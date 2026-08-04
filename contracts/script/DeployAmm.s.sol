// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SimpleAMM} from "../src/SimpleAMM.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// @notice Deploys gUSDC + SimpleAMM to GIWA Sepolia AND seeds the pool with liquidity
///         in one shot. Price fixed at 2000 gUSDC/ETH.
///         Run: SEED_ETH_WEI=50000000000000000 \
///              forge script script/DeployAmm.s.sol:DeployAmm --rpc-url giwa_sepolia --broadcast
///         (SEED_ETH_WEI defaults to 0.05 ETH; the deployer key must hold that + gas.)
contract DeployAmm is Script {
    uint256 constant RATE = 2000; // gUSDC per ETH

    function run() external returns (TestUSDC token, SimpleAMM amm) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 seedEth = vm.envOr("SEED_ETH_WEI", uint256(0.02 ether));
        // gUSDC(6dp) to pair: (seedEth/1e18) * RATE * 1e6 = seedEth * RATE / 1e12
        uint256 seedToken = (seedEth * RATE) / 1e12;
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        token = new TestUSDC();
        amm = new SimpleAMM(address(token));
        token.mint(deployer, seedToken);
        token.approve(address(amm), seedToken);
        amm.addLiquidity{value: seedEth}(seedToken);
        vm.stopBroadcast();

        console.log("gUSDC (TestUSDC):", address(token));
        console.log("SimpleAMM:", address(amm));
        console.log("Seeded ETH (wei):", seedEth);
        console.log("Seeded gUSDC (6dp):", seedToken);
    }
}
