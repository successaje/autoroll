// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";
import {IERC20} from "../src/interfaces/IDreamDex.sol";

interface ITestUsdc {
    function faucet(uint256 amount) external;
}

/// Deploys a vault with one ETH position queued, for the keeper verification.
contract SeedKeeper is Script {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address constant TEST_USDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;

    function run() external {
        vm.startBroadcast();

        AutoRollVault vault = new AutoRollVault(BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC);
        ITestUsdc(TEST_USDC).faucet(500e6);
        IERC20(TEST_USDC).approve(address(vault), 100e6);

        uint256 id = vault.openPosition(
            keccak256("ETH"),
            true,
            100e6,
            AutoRollVault.Policy({
                maxRolls: 0,
                maxLosses: 4,
                takeProfitBps: 0,
                sizeBps: 2_000,
                maxPriceWad: 0.65e18,
                compound: true
            })
        );

        console.log("VAULT", address(vault));
        console.log("POSITION", id);
        console.log("PENDING_ETH", vault.pendingCount(keccak256("ETH")));

        vm.stopBroadcast();
    }
}
