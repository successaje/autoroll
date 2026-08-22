// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";

/**
 *  Deploy + subscribe on Shannon (50312).
 *
 *  The vault is its own reactivity subscription owner, so the deployer must send it
 *  >= 32 STT before `subscribeAll` — that is a protocol-level sybil gate, not a fee:
 *  the 32 is never consumed, it just has to be sitting there at subscribe time.
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

        vault.fundReactivity{value: REACTIVITY_FUNDING}();
        (uint256 finalizedSub, uint256 createdSub) = vault.subscribeAll(
            10_000_000, // gasLimit per handler invocation
            0, // priorityFeePerGas
            20 gwei // maxFeePerGas
        );
        console.log("sub(MarketFinalized):", finalizedSub);
        console.log("sub(MarketCreated):", createdSub);

        vm.stopBroadcast();
    }
}
