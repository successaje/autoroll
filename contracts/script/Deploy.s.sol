// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";

/**
 *  Deploy on Shannon (50312), and subscribe if the deployer can fund it.
 *
 *  Deployment needs nothing but gas. The reactivity subscription needs the vault
 *  to hold >= 32 STT — a protocol sybil gate, never consumed — so the script
 *  deploys either way and only wires reactivity when the funds are actually
 *  there. Until then the vault runs off its permissionless `poke*` entries.
 *
 *    forge script script/Deploy.s.sol --rpc-url shannon --broadcast
 */
contract Deploy is Script {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address constant TEST_USDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;

    uint256 constant REACTIVITY_FUNDING = 33 ether;

    function run() external {
        vm.startBroadcast();

        AutoRollVault vault = new AutoRollVault(BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC);
        console.log("AutoRollVault:", address(vault));

        if (msg.sender.balance >= REACTIVITY_FUNDING) {
            vault.fundReactivity{value: REACTIVITY_FUNDING}();
            (uint256 finalizedSub, uint256 createdSub) =
                vault.subscribeAll(10_000_000, 0, 20 gwei);
            console.log("sub(MarketFinalized):", finalizedSub);
            console.log("sub(MarketCreated):", createdSub);
        } else {
            console.log("Deployed WITHOUT reactivity - deployer holds less than 33 STT.");
            console.log("Fund the vault and call subscribeAll(); until then, drive it with");
            console.log("pokeFinalized/pokeCreated (the roller does this automatically).");
        }

        vm.stopBroadcast();
    }
}
