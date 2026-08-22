// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";
import {IBinaryMarket, IBinaryMarketsModule, IERC20, IOutcomeToken6909} from "../src/interfaces/IDreamDex.sol";

interface ITestUsdc {
    function faucet(uint256 amount) external;
}

/**
 *  The test the audit was missing: a roll driven all the way through against a
 *  real dreamDEX window.
 *
 *  Everything here is the live protocol — the module, the CLOB, the ERC-6909
 *  singleton, the collateral, and a real resting book we cross for a real fill.
 *  Nothing is mocked. The fork is PINNED so the fixture below stays Trading with
 *  liquidity at its best ask; without the pin the window would have expired long
 *  before anyone ran this.
 *
 *  Resolution goes through `voidExpired()` rather than the oracle: a fork cannot
 *  advance the oracle's off-chain answer, but `voidExpired` is a real,
 *  permissionless protocol path and it pays both sides 0.5, so the redemption,
 *  the accounting and the requeue are all exercised for real.
 *
 *    forge test --match-path test/AutoRollVault.roll.t.sol -vv
 */
contract AutoRollVaultRollTest is Test {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address constant TEST_USDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;

    // Fixture captured by scripts/find-fixture.ts: a 300s ETH window, Trading,
    // best ask 0.487 — inside the 0.65 limit, so our IOC crosses.
    uint256 constant FORK_BLOCK = 468558054;
    bytes32 constant MARKET_ID = 0x0000000000000000000000000000000000000000000000000000000000006c5c;
    bytes32 constant ETH = keccak256("ETH");

    uint256 constant STAKE = 100e6; // 100 tUSDC, 6dp
    uint256 constant SIZE_BPS = 2_000; // 20% per window -> 20 tUSDC at risk

    AutoRollVault vault;
    address user = makeAddr("user");

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("shannon"), FORK_BLOCK);
        vault = new AutoRollVault(BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC);
    }

    function _policy() internal pure returns (AutoRollVault.Policy memory) {
        return AutoRollVault.Policy({
            maxRolls: 0,
            maxLosses: 4,
            takeProfitBps: 0,
            sizeBps: uint32(SIZE_BPS),
            maxPriceWad: 0.65e18,
            compound: true
        });
    }

    function _open() internal returns (uint256 id) {
        vm.startPrank(user);
        ITestUsdc(TEST_USDC).faucet(STAKE);
        IERC20(TEST_USDC).approve(address(vault), STAKE);
        id = vault.openPosition(ETH, true, STAKE, _policy());
        vm.stopPrank();
    }

    /// The market really is Trading at the pinned block, so the fixture has not
    /// silently rotted out from under the test.
    function test_fixtureIsStillTradable() public view {
        (,,,,,,,, address market, address pool,,,, uint64 expiry) =
            IBinaryMarketsModule(BINARY_MODULE).markets(MARKET_ID);
        assertTrue(market != address(0), "market exists");
        assertTrue(pool != address(0), "pool bound");
        assertEq(IBinaryMarket(market).status(), 1, "Trading");
        assertGt(expiry, block.timestamp, "not yet expired");
    }

    /// Entry: a real IOC against a real book, with the position charged what it
    /// actually spent rather than what it asked to spend.
    function test_enterFillsAgainstTheLiveBook() public {
        uint256 id = _open();

        vault.pokeCreated(MARKET_ID, ETH);

        (,,,, uint256 bankroll, uint256 atRisk, uint256 quantity,,,,) = vault.positions(id);

        assertGt(quantity, 0, "outcome tokens actually received");
        assertGt(atRisk, 0, "collateral actually committed");
        assertLe(atRisk, (STAKE * SIZE_BPS) / 10_000, "never more than the policy size");
        assertEq(bankroll + atRisk, STAKE, "equity is conserved across entry");
        assertEq(vault.equityOf(id), STAKE);
        assertEq(vault.inMarketCount(MARKET_ID), 1, "exposed to exactly this window");
        assertEq(vault.pendingCount(ETH), 0, "left the queue");

        // The tokens are the vault's, on the singleton, under this window's id.
        (,,,,,,,,,, uint256 yesId,,,) = IBinaryMarketsModule(BINARY_MODULE).markets(MARKET_ID);
        assertEq(
            IOutcomeToken6909(OUTCOME_TOKEN).balanceOf(address(vault), yesId),
            quantity,
            "vault holds exactly what the position recorded"
        );

        console.log("filled  quantity:", quantity);
        console.log("        spent   :", atRisk);
    }

    /// The full loop: enter, let the window die, harvest, and land back in the
    /// queue ready for the successor — with the money accounted for at each step.
    function test_rollEndToEnd() public {
        uint256 id = _open();
        vault.pokeCreated(MARKET_ID, ETH);

        (,,,, uint256 bankrollAfterEntry, uint256 staked, uint256 quantity,,,,) = vault.positions(id);
        assertGt(quantity, 0, "entered");

        // Past expiry and past the settlement window, with no oracle answer on a
        // fork, the market is voidable by anyone.
        (,,,,,,,, address market,,,,,) = IBinaryMarketsModule(BINARY_MODULE).markets(MARKET_ID);
        vm.warp(block.timestamp + 7 days);
        IBinaryMarket(market).voidExpired();
        assertEq(IBinaryMarket(market).status(), 5, "Voided");

        uint256 vaultBefore = IERC20(TEST_USDC).balanceOf(address(vault));
        vault.pokeFinalized(MARKET_ID);
        uint256 redeemed = IERC20(TEST_USDC).balanceOf(address(vault)) - vaultBefore;

        // A void pays 0.5 per contract to whichever side you hold.
        assertApproxEqAbs(redeemed, quantity / 2, 1, "voided redemption is half a contract each");

        (,,,, uint256 bankroll, uint256 atRisk, uint256 qty, uint32 rolls,, bool active,) =
            vault.positions(id);

        assertEq(rolls, 1, "one completed window");
        assertEq(atRisk, 0, "nothing left committed");
        assertEq(qty, 0, "outcome tokens burned on redemption");
        assertEq(bankroll, bankrollAfterEntry + redeemed, "proceeds returned to the bankroll");
        assertTrue(active, "still rolling");

        assertEq(vault.inMarketCount(MARKET_ID), 0, "window drained");
        assertEq(vault.pendingCount(ETH), 1, "requeued for the successor");

        // The curve got its point, and it reads back as the bankroll at that roll.
        (uint256[] memory curve, bool[] memory won, uint256 firstRoll) = vault.curveOf(id);
        assertEq(curve.length, 1);
        assertEq(firstRoll, 1);
        assertEq(curve[0], bankroll, "curve point is the bankroll after the roll");
        // Half a contract back for a fraction of a contract staked is a loss.
        assertFalse(won[0], "a void at 0.5 does not return the stake here");

        console.log("staked  :", staked);
        console.log("redeemed:", redeemed);
        console.log("bankroll:", bankroll);
    }

    /// A limit tighter than anything on the book must commit NOTHING and leave
    /// the position queued — this is the path that used to book a wipe.
    function test_noFillLeavesThePositionUntouched() public {
        vm.startPrank(user);
        ITestUsdc(TEST_USDC).faucet(STAKE);
        IERC20(TEST_USDC).approve(address(vault), STAKE);
        AutoRollVault.Policy memory tight = _policy();
        tight.maxPriceWad = 0.01e18; // far below the best ask
        uint256 id = vault.openPosition(ETH, true, STAKE, tight);
        vm.stopPrank();

        vault.pokeCreated(MARKET_ID, ETH);

        (,,,, uint256 bankroll, uint256 atRisk, uint256 quantity,, uint32 losses, bool active,) =
            vault.positions(id);

        assertEq(bankroll, STAKE, "not a cent committed");
        assertEq(atRisk, 0);
        assertEq(quantity, 0);
        assertEq(losses, 0, "an unfilled window is not a loss");
        assertTrue(active);
        assertEq(vault.pendingCount(ETH), 1, "still queued for the next window");
        assertEq(vault.inMarketCount(MARKET_ID), 0, "never entered");
    }
}
