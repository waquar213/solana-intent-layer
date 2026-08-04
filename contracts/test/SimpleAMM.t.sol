// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SimpleAMM} from "../src/SimpleAMM.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract SimpleAMMTest is Test {
    TestUSDC internal token;
    SimpleAMM internal amm;

    function setUp() public {
        token = new TestUSDC();
        amm = new SimpleAMM(address(token));
        // Seed: 1 ETH : 2000 gUSDC (6dp) → price ~2000 gUSDC/ETH.
        token.mint(address(this), 2000e6);
        token.approve(address(amm), 2000e6);
        amm.addLiquidity{value: 1 ether}(2000e6);
        vm.deal(address(this), 100 ether);
    }

    function test_SeededReserves() public view {
        assertEq(amm.reserveEth(), 1 ether);
        assertEq(amm.reserveToken(), 2000e6);
        assertEq(amm.totalLiquidity(), 1 ether);
    }

    function test_QuoteMatchesUniV2Formula() public view {
        uint256 amountIn = 0.01 ether;
        uint256 withFee = amountIn * 997;
        uint256 expected = (withFee * 2000e6) / (1 ether * 1000 + withFee);
        assertEq(amm.quoteEthForToken(amountIn), expected, "quote = x*y=k with 0.3% fee");
    }

    function test_SwapEthForToken_MovesPrice() public {
        uint256 out = amm.quoteEthForToken(0.01 ether);
        uint256 balBefore = token.balanceOf(address(this));
        uint256 got = amm.swapEthForToken{value: 0.01 ether}(out); // minOut = quote (exact)
        assertEq(got, out, "delivered the quoted amount");
        assertEq(token.balanceOf(address(this)) - balBefore, out, "received tokens");
        assertEq(amm.reserveEth(), 1.01 ether, "eth reserve grew");
        assertEq(amm.reserveToken(), 2000e6 - out, "token reserve shrank");
        // k never decreases (fee accrues to LPs).
        assertGe(amm.reserveEth() * amm.reserveToken(), 1 ether * 2000e6, "k preserved/grown");
    }

    function test_SwapRevertsBelowMinOut() public {
        uint256 out = amm.quoteEthForToken(0.01 ether);
        vm.expectRevert(abi.encodeWithSelector(SimpleAMM.InsufficientOutput.selector, out, out + 1));
        amm.swapEthForToken{value: 0.01 ether}(out + 1); // demand 1 more than possible → revert
    }

    function test_RoundTripSwapLosesOnlyFee() public {
        uint256 tokOut = amm.swapEthForToken{value: 0.01 ether}(0);
        token.approve(address(amm), tokOut);
        uint256 ethBack = amm.swapTokenForEth(tokOut, 0);
        // A round trip pays the 0.3% fee twice → strictly less ETH back than 0.01.
        assertLt(ethBack, 0.01 ether, "round trip costs the fee");
        assertGt(ethBack, 0.0098 ether, "but only ~0.6% is lost");
    }

    function test_RejectsBareEth() public {
        (bool ok, ) = address(amm).call{value: 1 ether}("");
        assertFalse(ok, "no receive/fallback - bare ETH reverts");
    }

    // ── removeLiquidity (regression: LP units used to be unredeemable) ───────────

    function test_RemoveLiquidityReturnsProRataShareOfBothReserves() public {
        // setUp seeded the whole pool from this contract: 1 ETH + 2000 gUSDC → 1 ETH of LP.
        uint256 units = amm.liquidity(address(this));
        assertEq(units, 1 ether);
        uint256 ethBefore = address(this).balance;
        uint256 tokBefore = token.balanceOf(address(this));

        (uint256 ethOut, uint256 tokenOut) = amm.removeLiquidity(units / 2); // withdraw half

        assertEq(ethOut, 0.5 ether);
        assertEq(tokenOut, 1000e6);
        assertEq(address(this).balance - ethBefore, 0.5 ether);
        assertEq(token.balanceOf(address(this)) - tokBefore, 1000e6);
        // Reserves and LP supply move together, so the pricing curve stays consistent.
        assertEq(amm.reserveEth(), 0.5 ether);
        assertEq(amm.reserveToken(), 1000e6);
        assertEq(amm.totalLiquidity(), 0.5 ether);
        assertEq(amm.liquidity(address(this)), 0.5 ether);
    }

    function test_FullExitClearsTheCallersClaim() public {
        uint256 units = amm.liquidity(address(this));
        amm.removeLiquidity(units);
        assertEq(amm.reserveEth(), 0);
        assertEq(amm.reserveToken(), 0);
        assertEq(amm.totalLiquidity(), 0);
        assertEq(amm.liquidity(address(this)), 0);
    }

    function test_RemoveLiquiditySplitsProRataBetweenTwoProviders() public {
        // A second provider doubles the pool at the current ratio, so each owns half.
        address bob = address(0xB0B);
        vm.deal(bob, 10 ether);
        token.mint(bob, 2000e6);
        vm.startPrank(bob);
        token.approve(address(amm), 2000e6);
        uint256 bobUnits = amm.addLiquidity{value: 1 ether}(2000e6);
        vm.stopPrank();
        assertEq(bobUnits, 1 ether);
        assertEq(amm.totalLiquidity(), 2 ether);

        uint256 bobEthBefore = bob.balance;
        vm.prank(bob);
        (uint256 ethOut, uint256 tokenOut) = amm.removeLiquidity(bobUnits);
        assertEq(ethOut, 1 ether); // exactly his half, never the whole pool
        assertEq(tokenOut, 2000e6);
        assertEq(bob.balance - bobEthBefore, 1 ether);
        // The original provider's claim is untouched.
        assertEq(amm.liquidity(address(this)), 1 ether);
        assertEq(amm.reserveEth(), 1 ether);
    }

    function test_RemoveLiquidityCannotTakeMoreThanYouOwn() public {
        address bob = address(0xB0B);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SimpleAMM.InsufficientLiquidity.selector, 0, 1));
        amm.removeLiquidity(1); // bob never provided anything

        uint256 units = amm.liquidity(address(this));
        vm.expectRevert(abi.encodeWithSelector(SimpleAMM.InsufficientLiquidity.selector, units, units + 1));
        amm.removeLiquidity(units + 1);
    }

    function test_RemoveLiquidityRejectsZero() public {
        vm.expectRevert(SimpleAMM.ZeroAmount.selector);
        amm.removeLiquidity(0);
    }

    function test_ProviderEarnsTheSwapFeeAfterATrade() public {
        // A swap leaves its 0.3% fee in the reserves, so the sole provider withdraws MORE ETH than
        // they put in — proof the fee accrues to liquidity rather than to nobody.
        amm.swapEthForToken{value: 0.1 ether}(0);
        uint256 units = amm.liquidity(address(this));
        (uint256 ethOut, ) = amm.removeLiquidity(units);
        assertEq(ethOut, 1.1 ether); // 1 seeded + 0.1 swapped in, all of it theirs
    }

    function test_SwapsStillWorkAfterAPartialWithdrawal() public {
        amm.removeLiquidity(amm.liquidity(address(this)) / 2);
        uint256 expected = amm.getAmountOut(0.01 ether, amm.reserveEth(), amm.reserveToken());
        uint256 out = amm.swapEthForToken{value: 0.01 ether}(expected);
        assertEq(out, expected);
        assertGt(out, 0);
    }

    receive() external payable {}
}
