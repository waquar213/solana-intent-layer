// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntentExecutor} from "../src/IntentExecutor.sol";

/// @dev Exercises the whole contract surface: happy paths, refunds, and every revert.
///      `forge test -vvv` should be green before deploying to GIWA.
contract IntentExecutorTest is Test {
    IntentExecutor internal executor;

    address payable internal alice = payable(address(0xA11CE));
    address payable internal bob = payable(address(0xB0B));

    bytes32 internal constant HASH = keccak256("send 1 ETH to alice, 0.5 to bob");

    event IntentExecuted(bytes32 indexed intentHash, address indexed sender, uint256 stepCount, uint256 totalValue);

    function setUp() public {
        executor = new IntentExecutor();
        vm.deal(address(this), 100 ether);
    }

    function _steps2() internal view returns (IntentExecutor.Step[] memory s) {
        s = new IntentExecutor.Step[](2);
        s[0] = IntentExecutor.Step({to: alice, amount: 1 ether});
        s[1] = IntentExecutor.Step({to: bob, amount: 0.5 ether});
    }

    function test_ExecutesMultipleStepsAtomically() public {
        vm.expectEmit(true, true, false, true);
        emit IntentExecuted(HASH, address(this), 2, 1.5 ether);

        executor.execute{value: 1.5 ether}(HASH, _steps2());

        assertEq(alice.balance, 1 ether, "alice funded");
        assertEq(bob.balance, 0.5 ether, "bob funded");
        assertEq(address(executor).balance, 0, "contract keeps nothing");
    }

    function test_RefundsDustToSender() public {
        uint256 before = address(this).balance;
        executor.execute{value: 2 ether}(HASH, _steps2()); // 0.5 ETH over-funded
        // spent exactly the 1.5 ETH the plan required; the rest came back
        assertEq(address(this).balance, before - 1.5 ether, "dust refunded");
        assertEq(address(executor).balance, 0, "contract keeps nothing");
    }

    function test_RevertsOnUnderfunding() public {
        vm.expectRevert(abi.encodeWithSelector(IntentExecutor.ValueMismatch.selector, 1 ether, 1.5 ether));
        executor.execute{value: 1 ether}(HASH, _steps2());
    }

    function test_RevertsOnEmptyIntent() public {
        IntentExecutor.Step[] memory none = new IntentExecutor.Step[](0);
        vm.expectRevert(IntentExecutor.EmptyIntent.selector);
        executor.execute{value: 0}(HASH, none);
    }

    function test_RejectsBareEth() public {
        (bool ok, ) = address(executor).call{value: 1 ether}("");
        assertFalse(ok, "bare ETH must revert");
    }

    function test_RevertsWholeIntentIfALegFails() public {
        // A recipient that rejects ETH makes its leg fail — the whole intent reverts,
        // so no leg is left half-applied.
        RejectEth bad = new RejectEth();
        IntentExecutor.Step[] memory s = new IntentExecutor.Step[](2);
        s[0] = IntentExecutor.Step({to: alice, amount: 1 ether});
        s[1] = IntentExecutor.Step({to: payable(address(bad)), amount: 0.5 ether});

        vm.expectRevert(abi.encodeWithSelector(IntentExecutor.TransferFailed.selector, 1));
        executor.execute{value: 1.5 ether}(HASH, s);

        assertEq(alice.balance, 0, "no leg applied when the intent reverts");
    }

    receive() external payable {}
}

/// @dev A recipient that always rejects incoming ETH — forces a leg to fail.
contract RejectEth {
    receive() external payable {
        revert("nope");
    }
}
