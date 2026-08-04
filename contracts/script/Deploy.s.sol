// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IntentExecutor} from "../src/IntentExecutor.sol";

/// @notice Deploys IntentExecutor to GIWA Sepolia (chainId 91342).
///         Run: forge script script/Deploy.s.sol:Deploy --rpc-url giwa_sepolia --broadcast
///         Requires PRIVATE_KEY in the environment (a funded GIWA Sepolia key).
contract Deploy is Script {
    function run() external returns (IntentExecutor executor) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        executor = new IntentExecutor();
        vm.stopBroadcast();
        console.log("IntentExecutor deployed at:", address(executor));
    }
}
