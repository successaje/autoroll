// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";
import {IERC20} from "../src/interfaces/IDreamDex.sol";

interface ITestUsdc {
    function faucet(uint256 amount) external;
}

/**
 *  Local-fork seeding, so the UI's on-chain path can be exercised end to end
 *  without waiting on testnet STT: deploy, faucet collateral, open a position.
 *
 *    anvil --fork-url https://api.infra.testnet.somnia.network/
 *    forge script script/SeedLocal.s.sol --rpc-url http://localhost:8545 --broadcast \
 *      --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 */
contract SeedLocal is Script {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address constant TEST_USDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;

    function run() external {
        vm.startBroadcast();

        AutoRollVault vault = new AutoRollVault(BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC);

        ITestUsdc(TEST_USDC).faucet(500e6);
        IERC20(TEST_USDC).approve(address(vault), 200e6);

        uint256 id = vault.openPosition(
            keccak256("BTC"),
            true,
            200e6,
            AutoRollVault.Policy({
                maxRolls: 0,
                maxLosses: 4,
                takeProfitBps: 0,
                sizeBps: 2_000,
                maxPriceWad: 0.65e18,
                compound: true
            })
        );

        console.log("AutoRollVault:", address(vault));
        console.log("position id:", id);
        console.log("equity:", vault.equityOf(id));

        vm.stopBroadcast();
    }
}
