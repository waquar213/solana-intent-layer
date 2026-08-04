// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SimpleStaking} from "../src/SimpleStaking.sol";

contract SimpleStakingTest is Test {
    SimpleStaking internal staking;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        staking = new SimpleStaking(500); // 5% APR
        staking.fundRewards{value: 10 ether}(); // seed the reward pool
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_StakeRecordsPrincipal() public {
        vm.prank(alice);
        staking.stake{value: 4 ether}();
        assertEq(staking.stakedOf(alice), 4 ether);
        assertEq(staking.totalStaked(), 4 ether);
    }

    function test_RewardAccruesLinearly() public {
        vm.prank(alice);
        staking.stake{value: 10 ether}();
        // 5% APR on 10 ETH for exactly one year = 0.5 ETH.
        vm.warp(block.timestamp + 365 days);
        assertEq(staking.pendingReward(alice), 0.5 ether);
    }

    function test_UnstakeReturnsPrincipalPlusReward() public {
        vm.prank(alice);
        staking.stake{value: 10 ether}();
        vm.warp(block.timestamp + 365 days);
        uint256 before = alice.balance;
        vm.prank(alice);
        staking.unstake(10 ether);
        assertEq(alice.balance - before, 10.5 ether); // principal + 0.5 reward
        assertEq(staking.stakedOf(alice), 0);
        assertEq(staking.totalStaked(), 0);
    }

    function test_PartialUnstakePaysProportionalRewardKeepsRest() public {
        vm.prank(alice);
        staking.stake{value: 10 ether}();
        vm.warp(block.timestamp + 365 days); // accrue 0.5 ETH reward on 10 ETH
        uint256 before = alice.balance;
        vm.prank(alice);
        staking.unstake(4 ether); // 40% of principal → 40% of the accrued reward (0.2 ETH)
        assertEq(alice.balance - before, 4.2 ether); // 4 principal + 0.2 reward
        assertEq(staking.stakedOf(alice), 6 ether);
        // The remaining 60% of the accrued reward (0.3 ETH) stays claimable on the 6 ETH still staked.
        assertEq(staking.pendingReward(alice), 0.3 ether);
    }

    function test_RewardShortfallNeverStrandsAnotherStakersPrincipal() public {
        // Drain the reward pool by deploying a fresh, UNSEEDED pool.
        SimpleStaking bare = new SimpleStaking(500);
        vm.prank(alice);
        bare.stake{value: 10 ether}();
        vm.prank(bob);
        bare.stake{value: 10 ether}();
        vm.warp(block.timestamp + 365 days);
        // No reward pool → alice gets principal back, reward capped to 0 (never dips into bob's).
        uint256 before = alice.balance;
        vm.prank(alice);
        bare.unstake(10 ether);
        assertEq(alice.balance - before, 10 ether); // exactly principal, no reward
        // Bob's principal is fully intact and withdrawable.
        uint256 bBefore = bob.balance;
        vm.prank(bob);
        bare.unstake(10 ether);
        assertEq(bob.balance - bBefore, 10 ether);
    }

    function test_StakeCompoundsOnRestake() public {
        vm.prank(alice);
        staking.stake{value: 10 ether}();
        vm.warp(block.timestamp + 365 days); // accrue 0.5
        vm.prank(alice);
        staking.stake{value: 5 ether}(); // settles accrued, adds principal
        assertEq(staking.stakedOf(alice), 15 ether);
        assertEq(staking.pendingReward(alice), 0.5 ether); // accrued preserved across the re-stake
    }

    function test_RevertOnZeroStake() public {
        vm.prank(alice);
        vm.expectRevert(SimpleStaking.ZeroAmount.selector);
        staking.stake{value: 0}();
    }

    function test_RevertOnOverUnstake() public {
        vm.prank(alice);
        staking.stake{value: 1 ether}();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SimpleStaking.InsufficientStake.selector, 1 ether, 2 ether));
        staking.unstake(2 ether);
    }

    receive() external payable {}
}
