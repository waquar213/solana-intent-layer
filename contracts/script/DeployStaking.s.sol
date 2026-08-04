// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SimpleStaking} from "../src/SimpleStaking.sol";

/// @notice Deploys SimpleStaking and seeds its reward pool in one shot. The SAME script deploys
///         to GIWA Sepolia AND Ethereum Sepolia — pick the chain with `--rpc-url`.
///
///   GIWA:    APR_BPS=500 SEED_REWARD_WEI=20000000000000000 \
///            forge script script/DeployStaking.s.sol:DeployStaking --rpc-url giwa_sepolia --broadcast
///   Sepolia: APR_BPS=500 SEED_REWARD_WEI=20000000000000000 \
///            forge script script/DeployStaking.s.sol:DeployStaking --rpc-url sepolia --broadcast
///
///   (APR_BPS defaults to 500 = 5%. SEED_REWARD_WEI defaults to 0.02 ETH; the deployer key must
///    hold that + gas. The reward pool is optional — with 0 seed, stakes still work; unstake just
///    returns principal only until the pool is funded.)
contract DeployStaking is Script {
    function run() external returns (SimpleStaking staking) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 aprBps = vm.envOr("APR_BPS", uint256(500));
        uint256 seed = vm.envOr("SEED_REWARD_WEI", uint256(0.02 ether));

        vm.startBroadcast(pk);
        staking = new SimpleStaking(aprBps);
        if (seed > 0) staking.fundRewards{value: seed}();
        vm.stopBroadcast();

        console.log("SimpleStaking:", address(staking));
        console.log("APR (bps):", aprBps);
        console.log("Reward pool seeded (wei):", seed);
    }
}
