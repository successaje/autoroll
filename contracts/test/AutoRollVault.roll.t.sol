// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";
import {
    IBinaryMarket,
    IBinaryMarketsModule,
    IBinaryPool,
    IERC20,
    IOutcomeToken6909
} from "../src/interfaces/IDreamDex.sol";

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

    /// A caller who under-budgets must be told so, not silently handed a "no
    /// fill". This is the failure that made `eth_estimateGas` converge on a
    /// budget where the vault never traded and nothing ever reverted.
    function test_lowGasBudgetIsReportedNotSilentlySkipped() public {
        _open();

        vm.expectEmit(true, true, false, true);
        emit AutoRollVault.RollSkipped(1, MARKET_ID, "gas budget too low to place an order");
        vault.pokeCreated{gas: 400_000}(MARKET_ID, ETH);

        (,,,, uint256 bankroll, uint256 atRisk, uint256 quantity,,,,) = vault.positions(1);
        assertEq(bankroll, STAKE, "nothing committed");
        assertEq(atRisk, 0);
        assertEq(quantity, 0);
        assertEq(vault.pendingCount(ETH), 1, "still queued, so a funded poke can retry");
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

/*//////////////////////////////////////////////////////////////
                            THE DOWN SIDE
//////////////////////////////////////////////////////////////*/

/**
 *  The Up side proved the loop; this proves the *other* half of a two-sided
 *  product, which is where the price inversion lives and where it is easiest to
 *  be quietly wrong.
 *
 *  On a single book everything is quoted in YES terms, so a Down buy at
 *  probability `q` is an ASK at `one - q`. It therefore crosses the BIDS, not the
 *  asks — the opposite book from an Up buy. At the pinned block the bids top out
 *  at 0.508 and the asks start at 0.537, so a wrong-side or wrong-inversion
 *  implementation fills at a visibly different price (or not at all) rather than
 *  passing by luck.
 */
contract AutoRollVaultDownTest is Test {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address constant TEST_USDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;

    uint256 constant FORK_BLOCK = 468558054;
    bytes32 constant MARKET_ID = 0x0000000000000000000000000000000000000000000000000000000000006c5c;
    bytes32 constant ETH = keccak256("ETH");

    uint256 constant STAKE = 100e6;
    uint256 constant SIZE_BPS = 2_000;
    uint256 constant ONE = 1e6; // 6dp collateral
    uint64 constant MAX_PRICE = 0.65e18;

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
            maxPriceWad: MAX_PRICE,
            compound: true
        });
    }

    function _openDown() internal returns (uint256 id) {
        vm.startPrank(user);
        ITestUsdc(TEST_USDC).faucet(STAKE);
        IERC20(TEST_USDC).approve(address(vault), STAKE);
        id = vault.openPosition(ETH, false, STAKE, _policy());
        vm.stopPrank();
    }

    function _ids() internal view returns (uint256 yesId, uint256 noId) {
        (,,,,,,,,,, yesId, noId,,) = IBinaryMarketsModule(BINARY_MODULE).markets(MARKET_ID);
    }

    /// The two sides really do face opposite books, which is the premise the rest
    /// of these tests rest on.
    function test_theTwoSidesCrossOppositeBooks() public view {
        (,,,,,,,,, address pool,,,,) = IBinaryMarketsModule(BINARY_MODULE).markets(MARKET_ID);
        IBinaryPool.Level[] memory bids = IBinaryPool(pool).getBookLevels(true, 1);
        IBinaryPool.Level[] memory asks = IBinaryPool(pool).getBookLevels(false, 1);

        assertGt(bids.length, 0, "bids present for a Down buy to cross");
        assertGt(asks.length, 0, "asks present for an Up buy to cross");
        assertLt(bids[0].price, asks[0].price, "a real spread, so the sides are distinguishable");

        // A Down buy is an ask at `one - q`; to cross the best bid it needs
        // `one - q <= bestBid`, i.e. our limit must be at least `one - bestBid`.
        assertGe((uint256(MAX_PRICE) * ONE) / 1e18, ONE - bids[0].price, "0.65 clears the Down side here");
    }

    /// A Down fill must land in the NO token id, at a cost per contract that
    /// respects the limit — and must leave the YES id untouched.
    function test_enterDownFillsTheNoSide() public {
        uint256 id = _openDown();
        vault.pokeCreated(MARKET_ID, ETH);

        (,,,, uint256 bankroll, uint256 atRisk, uint256 quantity,,,,) = vault.positions(id);
        assertGt(quantity, 0, "filled");
        assertGt(atRisk, 0, "collateral committed");
        assertEq(bankroll + atRisk, STAKE, "equity conserved");

        (uint256 yesId, uint256 noId) = _ids();
        assertEq(
            IOutcomeToken6909(OUTCOME_TOKEN).balanceOf(address(vault), noId),
            quantity,
            "the position is in NO"
        );
        assertEq(
            IOutcomeToken6909(OUTCOME_TOKEN).balanceOf(address(vault), yesId),
            0,
            "and NOT in YES - a side mix-up would show up right here"
        );

        // Cost per contract, in collateral units, must be at or under the limit.
        uint256 paid = (atRisk * ONE) / quantity;
        assertLe(paid, (uint256(MAX_PRICE) * ONE) / 1e18, "never paid over the limit");

        // And it must be the DOWN price, not the UP price. The Up side fills at
        // the best ask (0.537); Down fills at `one - bestBid` (0.492). If the
        // inversion were dropped these would be indistinguishable.
        (,,,,,,,,, address pool,,,,) = IBinaryMarketsModule(BINARY_MODULE).markets(MARKET_ID);
        IBinaryPool.Level[] memory bids = IBinaryPool(pool).getBookLevels(true, 1);
        assertApproxEqAbs(paid, ONE - bids[0].price, 2, "filled against the bid, inverted");

        console.log("down quantity:", quantity);
        console.log("     spent   :", atRisk);
        console.log("     per unit:", paid);
    }

    /// The same full loop as the Up side, on NO tokens.
    function test_rollDownEndToEnd() public {
        uint256 id = _openDown();
        vault.pokeCreated(MARKET_ID, ETH);

        (,,,, uint256 bankrollAfterEntry,, uint256 quantity,,,,) = vault.positions(id);
        assertGt(quantity, 0, "entered");

        (,,,,,,,, address market,,,,,) = IBinaryMarketsModule(BINARY_MODULE).markets(MARKET_ID);
        vm.warp(block.timestamp + 7 days);
        IBinaryMarket(market).voidExpired();

        uint256 before = IERC20(TEST_USDC).balanceOf(address(vault));
        vault.pokeFinalized(MARKET_ID);
        uint256 redeemed = IERC20(TEST_USDC).balanceOf(address(vault)) - before;

        // A void pays 0.5 per contract to EITHER side, so the NO leg redeems the
        // same way the YES leg does.
        assertApproxEqAbs(redeemed, quantity / 2, 1, "voided NO redeems at 0.5");

        (,,,, uint256 bankroll, uint256 atRisk, uint256 qty, uint32 rolls,, bool active,) =
            vault.positions(id);
        assertEq(rolls, 1);
        assertEq(atRisk, 0);
        assertEq(qty, 0, "NO tokens burned on redemption");
        assertEq(bankroll, bankrollAfterEntry + redeemed);
        assertTrue(active);
        assertEq(vault.pendingCount(ETH), 1, "requeued");

        (uint256 yesId, uint256 noId) = _ids();
        assertEq(IOutcomeToken6909(OUTCOME_TOKEN).balanceOf(address(vault), noId), 0);
        assertEq(IOutcomeToken6909(OUTCOME_TOKEN).balanceOf(address(vault), yesId), 0);
    }

    /// A Down limit too low to cross must commit nothing, exactly like the Up side.
    function test_downNoFillLeavesThePositionUntouched() public {
        vm.startPrank(user);
        ITestUsdc(TEST_USDC).faucet(STAKE);
        IERC20(TEST_USDC).approve(address(vault), STAKE);
        AutoRollVault.Policy memory tight = _policy();
        tight.maxPriceWad = 0.05e18; // an ask at 0.95, far above the best bid
        uint256 id = vault.openPosition(ETH, false, STAKE, tight);
        vm.stopPrank();

        vault.pokeCreated(MARKET_ID, ETH);

        (,,,, uint256 bankroll, uint256 atRisk, uint256 quantity,, uint32 losses,,) = vault.positions(id);
        assertEq(bankroll, STAKE, "nothing committed");
        assertEq(atRisk, 0);
        assertEq(quantity, 0);
        assertEq(losses, 0, "an unfilled window is not a loss");
        assertEq(vault.pendingCount(ETH), 1, "still queued");
    }

    /// Up and Down opened together must each get their own side and their own
    /// tokens out of a single poke.
    function test_bothSidesInOneWindow() public {
        address up = makeAddr("up");
        address down = makeAddr("down");

        vm.startPrank(up);
        ITestUsdc(TEST_USDC).faucet(STAKE);
        IERC20(TEST_USDC).approve(address(vault), STAKE);
        uint256 idUp = vault.openPosition(ETH, true, STAKE, _policy());
        vm.stopPrank();

        vm.startPrank(down);
        ITestUsdc(TEST_USDC).faucet(STAKE);
        IERC20(TEST_USDC).approve(address(vault), STAKE);
        uint256 idDown = vault.openPosition(ETH, false, STAKE, _policy());
        vm.stopPrank();

        vault.pokeCreated(MARKET_ID, ETH);

        (,,,,,, uint256 qUp,,,,) = vault.positions(idUp);
        (,,,,,, uint256 qDown,,,,) = vault.positions(idDown);
        assertGt(qUp, 0, "up filled");
        assertGt(qDown, 0, "down filled");

        (uint256 yesId, uint256 noId) = _ids();
        assertEq(IOutcomeToken6909(OUTCOME_TOKEN).balanceOf(address(vault), yesId), qUp, "YES is the up leg");
        assertEq(IOutcomeToken6909(OUTCOME_TOKEN).balanceOf(address(vault), noId), qDown, "NO is the down leg");
        assertEq(vault.inMarketCount(MARKET_ID), 2, "both exposed");
    }
}
