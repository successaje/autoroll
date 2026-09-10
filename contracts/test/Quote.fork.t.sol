// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";
import {IBinaryMarketsModule, IBinaryPool} from "../src/interfaces/IDreamDex.sol";

/// Exposes the private quote so off-grid inputs can be checked directly.
contract QuoteHarness is AutoRollVault {
    constructor(address m, address o, address c) AutoRollVault(m, o, c) {}

    function quote(address pool, bool up, uint256 maxPriceWad, uint256 stake)
        external
        view
        returns (uint256 price, uint256 quantity)
    {
        return _quoteExposed(pool, up, maxPriceWad, stake);
    }
}

/**
 *  The grid is the venue's hardest edge: an off-tick price is rejected with
 *  `InvalidPrice` and a sub-lot size with `InvalidQuantity`, so a quote that is
 *  merely *close* is a reverted roll. These feed deliberately off-grid limits to
 *  the real fixture pool and check where they land.
 */
contract QuoteForkTest is Test {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address constant TEST_USDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;
    uint256 constant FORK_BLOCK = 468558054;
    bytes32 constant MARKET_ID = 0x0000000000000000000000000000000000000000000000000000000000006c5c;

    QuoteHarness h;
    address pool;
    uint256 tick;
    uint256 lot;
    uint256 minQty;
    uint256 one;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("shannon"), FORK_BLOCK);
        h = new QuoteHarness(BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC);
        (,,,,,,,,, pool,,,,) = IBinaryMarketsModule(BINARY_MODULE).markets(MARKET_ID);

        IBinaryPool.OrderBookParameters memory g = IBinaryPool(pool).getOrderBookParameters();
        (tick, minQty, lot) = (g.tickSize, g.minQuantity, g.lotSize);
        one = IBinaryPool(pool).getBinaryPoolParams().oneCollateral;
        console.log("grid tick/lot/min:", tick, lot, minQty);
    }

    /// An off-tick Up limit must land ON the grid, and never above the limit.
    function test_upSnapsDownOntoTheTick() public view {
        uint256 maxWad = 0.6537e18; // 653700 in 6dp - deliberately off a 1000 tick
        (uint256 price, uint256 qty) = h.quote(pool, true, maxWad, 50e6);

        assertEq(price % tick, 0, "on the tick grid");
        assertEq(price, 653000, "snapped DOWN, not rounded");
        assertLe(price, (maxWad * one) / 1e18, "never above the limit we set");
        assertEq(qty % lot, 0, "on the lot grid");
        assertGe(qty, minQty, "at or above the minimum");
    }

    /// A Down limit is a YES price of `one - limit`, and must snap the other way:
    /// UP, because a higher YES price is a CHEAPER NO contract.
    function test_downSnapsUpOntoTheTick() public view {
        uint256 maxWad = 0.6537e18;
        (uint256 price, uint256 qty) = h.quote(pool, false, maxWad, 50e6);

        assertEq(price % tick, 0, "on the tick grid");
        assertEq(price, 347000, "ceil of (1e6 - 653700) = 346300 -> 347000");

        // The thing that actually matters: what we pay per NO contract stays
        // under the limit. Snapping the wrong way here would overspend.
        uint256 costPerContract = one - price;
        assertLe(costPerContract, (maxWad * one) / 1e18, "never pays over the limit");
        assertEq(qty % lot, 0, "on the lot grid");
    }

    /// Snapping must never silently overspend the stake.
    function test_quantityNeverExceedsTheStake() public view {
        uint256 stake = 7_333_333; // deliberately not a round number
        (uint256 price, uint256 qty) = h.quote(pool, true, 0.5e18, stake);
        assertLe((qty * price) / one, stake, "escrow fits inside the stake");
    }

    /// A stake too small to buy one lot must return zero, not a rejected order.
    function test_dustStakeQuotesZero() public view {
        (, uint256 qty) = h.quote(pool, true, 0.5e18, 1);
        assertEq(qty, 0, "refused before it reaches the venue");
    }

    /// Degenerate limits are refused rather than clamped into a bad order.
    function test_impossibleLimitsQuoteZero() public view {
        (, uint256 qA) = h.quote(pool, true, 0, 50e6);
        assertEq(qA, 0, "a zero limit buys nothing");
        (, uint256 qB) = h.quote(pool, true, 1e18, 50e6);
        assertEq(qB, 0, "a limit at certainty is not a tradable price");
    }

    /// The grid is read from the pool, not assumed. If the venue ever reprices
    /// its tick this test says so instead of the vault silently misquoting.
    function test_gridIsWhatWeThinkItIs() public view {
        assertEq(tick, 1000, "tick");
        assertEq(lot, 1000, "lot");
        assertEq(minQty, 1000, "min quantity");
        assertEq(one, 1e6, "6dp collateral");
    }
}
