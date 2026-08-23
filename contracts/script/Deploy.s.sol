// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";

/**
 *  Deploy on Shannon (50312). Deployment only — subscribing happens separately.
 *
 *  Reactivity is deliberately NOT wired here. `forge script` simulates locally
 *  before it broadcasts, and Foundry's EVM has no reactivity precompile at
 *  0x…0100: `subscribe` returns empty data, decoding it as a uint256 reverts,
 *  and the whole deploy aborts before a single transaction is sent. Gating the
 *  call on `msg.sender.balance` does not help either — the simulation sender
 *  carries a synthetic balance, so the branch is taken no matter what the real
 *  deployer holds.
 *
 *  So: deploy here, then subscribe against the live node, which has the
 *  precompile, with `npm run subscribe -- --vault 0x…`. The vault is fully
 *  functional in between; the keeper drives it through the same internals.
 *
 *    cd contracts && forge script script/Deploy.s.sol --rpc-url … --broadcast -i 1
 */
contract Deploy is Script {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address constant TEST_USDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;

    function run() external {
        vm.startBroadcast();
        AutoRollVault vault = new AutoRollVault(BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC);
        vm.stopBroadcast();

        console.log("AutoRollVault:", address(vault));
        console.log("");
        console.log("Drive it now:   npx tsx src/keeper.ts --vault <above> --live");
        console.log("Reactivity:     npm run subscribe -- --vault <above>   (needs 33 STT)");
    }
}
