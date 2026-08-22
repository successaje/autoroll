// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {IBinaryMarketsModule, IBinaryPool, IOutcomeToken6909, IERC20} from "./interfaces/IDreamDex.sol";

/**
 *  @title  AutoRollVault
 *  @notice A synthetic *perpetual* event contract on DreamDEX.
 *
 *  DreamDEX binary windows have a hard expiry (60s on the short BTC/ETH feeds) and
 *  the venue rolls a successor automatically. A human who is simply "long BTC" would
 *  have to redeem and re-enter every single window, forever. This vault does it for
 *  them, on-chain, with no keeper:
 *
 *    1. Somnia reactivity subscription A fires on `MarketFinalized` from the module.
 *       The handler redeems every position this vault holds in that market and parks
 *       the proceeds in a per-asset pending queue.
 *    2. Subscription B fires on `MarketCreated`. The handler rests a bid on the fresh
 *       window for every pending position on that asset.
 *
 *  The economics only close because dreamDEX charges zero maker, taker and settlement
 *  fees — rolling a position hundreds of times through any fee-charging venue would
 *  surrender the whole stake to fees.
 *
 *  Cold start is handled by the venue's mint-a-pair path: a resting Up bid can cross
 *  a resting Down bid with no seller at all, so a brand-new window fills without
 *  anybody holding inventory.
 *
 *  @dev The vault contract is itself the reactivity subscription owner, so it must
 *       hold >= 32 STT/SOMI at `subscribe()` time and enough thereafter to pay gas
 *       for each handler invocation. See `fundReactivity()`.
 */
contract AutoRollVault is SomniaEventHandler {
    // ---------------------------------------------------------------- errors

    error NotOwner();
    error AlreadySubscribed();
    error NotSubscribed();
    error InsufficientReactivityBalance(uint256 have, uint256 need);
    error NoSuchPosition();

    // ---------------------------------------------------------------- events

    event PositionOpened(uint256 indexed id, address indexed user, bytes32 asset, bool up, uint256 stake);
    event PositionRolled(uint256 indexed id, bytes32 indexed marketId, uint256 staked, uint32 rolls);
    /// Emitted once per finished window. Carries everything a client needs to
    /// draw the bankroll curve and narrate the roll, so the UI reads logs rather
    /// than reconstructing history from storage.
    event PositionSettled(
        uint256 indexed id,
        bytes32 indexed marketId,
        uint256 staked,
        uint256 returned,
        uint256 bankroll,
        bool won
    );
    event PositionClosed(uint256 indexed id, address indexed user, uint256 payout, string reason);
    event Subscribed(uint256 finalizedSubId, uint256 createdSubId);

    // ------------------------------------------------------- module wiring

    /// Topic0s verified against live Shannon logs (scripts/decode-logs.mjs).
    /// MarketFinalized(bytes32 indexed marketId, address indexed pool, uint256 marketKey)
    bytes32 public constant TOPIC_MARKET_FINALIZED =
        0x8f396ac6cf2e01887362e2b39d8e56860042c604e5b1b481c87e6d9f90006e08;
    /// MarketCreated(bytes32 indexed marketId, address indexed market, address indexed pool, ...)
    bytes32 public constant TOPIC_MARKET_CREATED =
        0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd;

    /// `onEvent(address,bytes32[],bytes)` — the selector reactivity calls on us.
    bytes4 public constant ON_EVENT_SELECTOR = SomniaEventHandler.onEvent.selector;

    IBinaryMarketsModule public immutable module;
    IOutcomeToken6909 public immutable outcomeToken;
    IERC20 public immutable collateral;

    address public owner;
    uint256 public finalizedSubId;
    uint256 public createdSubId;

    // ------------------------------------------------------------ positions

    /// Per-roll policy, expressed in terms a normal person can set in a UI.
    struct Policy {
        uint32 maxRolls; // stop after this many windows (0 = unlimited)
        uint32 maxLosses; // stop after this many consecutive losing windows
        uint64 takeProfitBps; // stop once bankroll >= principal * (1 + bps/10_000)
        /**
         *  How much of the bankroll goes into each window, in bps.
         *
         *  This is the parameter that decides whether the product is a position
         *  or a lottery ticket. A binary contract pays 0 on a loss, so betting
         *  the whole bankroll every window means the FIRST loss ends the run no
         *  matter what `maxLosses` says. Staking a fraction is what makes a
         *  hundred-window roll survivable and the other stops meaningful.
         */
        uint32 sizeBps;
        uint64 maxPriceWad; // never pay more than this Up-probability (1e18 = certainty)
        bool compound; // size off the live bankroll, or off the original principal
    }

    struct Position {
        address user;
        bytes32 asset; // keccak256(bytes(market.asset)), e.g. "BTC"
        bool up; // the side the user is expressing
        uint256 principal; // collateral originally deposited
        uint256 bankroll; // collateral held and not currently committed
        uint256 atRisk; // collateral committed to the window in `_inMarket`
        uint32 rolls;
        uint32 losses;
        bool active;
        Policy policy;
    }

    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;

    /**
     *  A bounded ring of recent bankroll points, so a client can draw the curve
     *  in ONE eth_call.
     *
     *  The obvious design is to read `PositionSettled` logs instead — but Somnia
     *  caps `eth_getLogs` at 1000 blocks, and at 100ms blocks that is 100 seconds
     *  of history. A position that has been rolling for an hour is 36,000 blocks
     *  deep, so log-backed history would need dozens of paged requests and would
     *  keep growing. A fixed ring costs one SSTORE per roll, never grows, and
     *  answers in a single call.
     *
     *  Each slot packs `bankroll << 1 | won`.
     */
    uint256 public constant CURVE_POINTS = 32;
    mapping(uint256 => uint256[CURVE_POINTS]) internal _curve;

    /// marketId => position ids currently exposed to that window.
    mapping(bytes32 => uint256[]) internal _inMarket;
    /// asset => position ids awaiting the next window to open.
    mapping(bytes32 => uint256[]) internal _pending;

    /// Bounded work per reactive invocation — the vault pays this gas itself.
    uint256 public constant MAX_ROLLS_PER_EVENT = 16;

    modifier onlyOwner() {
        require(msg.sender == owner, NotOwner());
        _;
    }

    constructor(address _module, address _outcomeToken, address _collateral) {
        owner = msg.sender;
        module = IBinaryMarketsModule(_module);
        outcomeToken = IOutcomeToken6909(_outcomeToken);
        collateral = IERC20(_collateral);
    }

    // ------------------------------------------------------------ reactivity

    /// @notice Fund the vault so it can own reactivity subscriptions and pay handler gas.
    function fundReactivity() external payable {}

    /// @notice Create both subscriptions. The vault becomes the subscription owner,
    ///         so it must already hold >= 32 native tokens.
    function subscribeAll(uint64 gasLimit, uint64 priorityFeePerGas, uint64 maxFeePerGas)
        external
        onlyOwner
        returns (uint256, uint256)
    {
        require(finalizedSubId == 0 && createdSubId == 0, AlreadySubscribed());
        uint256 need = SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE;
        require(address(this).balance >= need, InsufficientReactivityBalance(address(this).balance, need));

        SomniaExtensions.SubscriptionOptions memory opts = SomniaExtensions.SubscriptionOptions({
            priorityFeePerGas: priorityFeePerGas,
            maxFeePerGas: maxFeePerGas,
            gasLimit: gasLimit
        });

        // Wildcard on marketId: we want *every* finalization/creation from the module
        // and route it ourselves, rather than one subscription per window.
        finalizedSubId = SomniaExtensions.subscribe(
            address(this),
            SomniaExtensions.SubscriptionFilter({
                eventTopics: [TOPIC_MARKET_FINALIZED, bytes32(0), bytes32(0), bytes32(0)],
                origin: address(0),
                emitter: address(module)
            }),
            opts
        );

        createdSubId = SomniaExtensions.subscribe(
            address(this),
            SomniaExtensions.SubscriptionFilter({
                eventTopics: [TOPIC_MARKET_CREATED, bytes32(0), bytes32(0), bytes32(0)],
                origin: address(0),
                emitter: address(module)
            }),
            opts
        );

        emit Subscribed(finalizedSubId, createdSubId);
        return (finalizedSubId, createdSubId);
    }

    function unsubscribeAll() external onlyOwner {
        require(finalizedSubId != 0, NotSubscribed());
        SomniaExtensions.unsubscribe(finalizedSubId);
        SomniaExtensions.unsubscribe(createdSubId);
        finalizedSubId = 0;
        createdSubId = 0;
    }

    /// @inheritdoc SomniaEventHandler
    /// @dev Runs as a synthetic transaction with `msg.sender == 0x0100`, gas paid by
    ///      this contract. It must never revert on an unrelated market, or every
    ///      window on the venue would burn our gas on a failed handler.
    function _onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data) internal override {
        if (emitter != address(module) || eventTopics.length < 2) return;
        bytes32 marketId = eventTopics[1];

        if (eventTopics[0] == TOPIC_MARKET_FINALIZED) {
            _harvest(marketId);
        } else if (eventTopics[0] == TOPIC_MARKET_CREATED) {
            _enter(marketId, _assetOf(data));
        }
    }

    // -------------------------------------------------------- keeper entries

    /**
     *  Reactivity is the *fast* path, not the only one.
     *
     *  A subscription needs its owner to hold 32 native tokens at creation, which
     *  is a real gate on a testnet faucet. These two entries drive exactly the same
     *  internals from an ordinary transaction, so the vault is fully functional
     *  before it is ever subscribed — and afterwards they stay useful as the
     *  backstop for a handler that ran out of gas or lost its queue slot.
     *
     *  Both are permissionless and idempotent: a market with no position of ours
     *  in it is a couple of SLOADs and a return.
     */
    function pokeFinalized(bytes32 marketId) external {
        _harvest(marketId);
    }

    /// @param asset `keccak256(bytes(market.asset))` — the caller supplies it because
    ///        the reactive path gets it free from the log and a keeper can read it
    ///        off the indexer just as cheaply as this contract could re-derive it.
    function pokeCreated(bytes32 marketId, bytes32 asset) external {
        _enter(marketId, asset);
    }

    // ------------------------------------------------------------- internals

    /// Redeem this vault's winning outcome tokens in a just-finalized window and
    /// move each position into the pending queue for its asset.
    function _harvest(bytes32 marketId) internal {
        uint256[] storage ids = _inMarket[marketId];
        if (ids.length == 0) return; // not ours — cheap exit, this is the common case

        (,,,, uint32 operatorId, bytes32 venueId,,,,, uint256 yesId, uint256 noId,,) = module.markets(marketId);

        uint256 n = ids.length < MAX_ROLLS_PER_EVENT ? ids.length : MAX_ROLLS_PER_EVENT;
        for (uint256 i = 0; i < n; ++i) {
            Position storage p = positions[ids[i]];
            if (!p.active) continue;

            uint8 outcomeIdx = p.up ? 0 : 1;
            uint256 held = outcomeToken.balanceOf(address(this), p.up ? yesId : noId);
            uint256 before = collateral.balanceOf(address(this));
            if (held > 0) {
                // Losing redemptions pay 0 and do not revert (gotcha #11).
                module.redeem(operatorId, venueId, marketId, outcomeIdx, held);
            }
            uint256 proceeds = collateral.balanceOf(address(this)) - before;

            // The stake left the bankroll when the order was placed; whatever the
            // window returns comes back in. A loss costs the stake, not the position.
            uint256 staked = p.atRisk;
            p.bankroll += proceeds;
            p.atRisk = 0;
            p.losses = proceeds < staked ? p.losses + 1 : 0;
            p.rolls += 1;
            bool won_ = proceeds >= staked;
            _curve[ids[i]][(p.rolls - 1) % CURVE_POINTS] = (p.bankroll << 1) | (won_ ? 1 : 0);
            emit PositionSettled(ids[i], marketId, staked, proceeds, p.bankroll, won_);

            string memory stop = _stopReason(p);
            if (bytes(stop).length != 0) {
                _settle(ids[i], p, stop);
            } else {
                _pending[p.asset].push(ids[i]);
            }
        }
        delete _inMarket[marketId];
    }

    /// Rest a bid for every position waiting on this asset's next window.
    /// A resting Up bid crosses a resting Down bid via the venue's mint-a-pair
    /// path, so a fresh window fills with no seller and no inventory.
    function _enter(bytes32 marketId, bytes32 asset) internal {
        uint256[] storage ids = _pending[asset];
        if (ids.length == 0) return;

        (,,, address mktCollateral,,,,,, address pool,,, , uint64 expiry) = module.markets(marketId);
        if (mktCollateral != address(collateral) || pool == address(0)) return;

        uint256 n = ids.length < MAX_ROLLS_PER_EVENT ? ids.length : MAX_ROLLS_PER_EVENT;
        for (uint256 i = 0; i < n; ++i) {
            Position storage p = positions[ids[i]];
            if (!p.active || p.asset != asset) continue;

            uint256 stake = _nextStake(p);
            if (stake == 0) continue;

            // Prices are Up probabilities. A Down bid is expressed as a bid on the
            // same book read from the other side, hence the 1e18 complement.
            uint256 priceWad = p.up ? p.policy.maxPriceWad : 1e18 - p.policy.maxPriceWad;
            uint256 quantity = (stake * 1e18) / priceWad;

            p.bankroll -= stake;
            p.atRisk = stake;
            collateral.approve(pool, stake);
            // Gotcha #5: expiry is mandatory and capped at the window's own expiry —
            // it doubles as the dead-man's switch if a roll never fills.
            IBinaryPool(pool).placeOrder(
                p.up, // isBid on the Up book
                uint64(ids[i]), // userData: our position id, for attribution
                priceWad,
                quantity,
                uint64(expiry) * 1e9, // expireTimestampNs
                0, // orderType: LIMIT
                0, // selfMatchingOption: default
                address(0), // no builder
                0
            );

            _inMarket[marketId].push(ids[i]);
            emit PositionRolled(ids[i], marketId, stake, p.rolls);
        }
        delete _pending[asset];
    }

    /// What the next window should cost, given the policy and where we stand.
    function _nextStake(Position storage p) internal view returns (uint256) {
        uint256 base = p.policy.compound ? p.bankroll : p.principal;
        uint256 size = (base * p.policy.sizeBps) / 10_000;
        return size > p.bankroll ? p.bankroll : size;
    }

    function _stopReason(Position storage p) internal view returns (string memory) {
        if (p.policy.maxRolls != 0 && p.rolls >= p.policy.maxRolls) return "max-rolls";
        if (p.policy.maxLosses != 0 && p.losses >= p.policy.maxLosses) return "stop-loss";
        if (_nextStake(p) == 0) return "wiped";
        if (
            p.policy.takeProfitBps != 0
                && p.bankroll >= p.principal + (p.principal * p.policy.takeProfitBps) / 10_000
        ) return "take-profit";
        return "";
    }

    function _settle(uint256 id, Position storage p, string memory reason) internal {
        p.active = false;
        uint256 payout = p.bankroll;
        p.bankroll = 0;
        if (payout > 0) collateral.transfer(p.user, payout);
        emit PositionClosed(id, p.user, payout, reason);
    }

    /// MarketCreated packs `asset` as a dynamic string in the non-indexed tail.
    /// Word 13 of that tail is its offset (0:oracleQuestionId, 1:operatorId,
    /// 2:venueId, 3:creator, 4:collateral, 5:yesId, 6:noId, 7:nonce,
    /// 8:outcomeSlotCount, 9:marketType, 10:tradingStart, 11:expiry,
    /// 12:voidPolicy, 13:asset, 14:strike, 15:question, 16:context).
    /// Decoded by hand rather than with a 17-tuple `abi.decode`: the vault pays
    /// for this on every market the venue creates, so it stays O(1).
    uint256 private constant ASSET_WORD = 13;

    function _assetOf(bytes calldata data) internal pure returns (bytes32) {
        if (data.length < (ASSET_WORD + 1) * 32) return bytes32(0);
        uint256 off = uint256(bytes32(data[ASSET_WORD * 32:(ASSET_WORD + 1) * 32]));
        if (off + 32 > data.length) return bytes32(0);
        uint256 len = uint256(bytes32(data[off:off + 32]));
        if (len > 32 || off + 32 + len > data.length) return bytes32(0);
        return keccak256(data[off + 32:off + 32 + len]);
    }

    // ------------------------------------------------------------ user entry

    /// @notice Take a directional view and let it ride. One transaction, then nothing.
    function openPosition(bytes32 asset, bool up, uint256 stake, Policy calldata policy)
        external
        returns (uint256 id)
    {
        collateral.transferFrom(msg.sender, address(this), stake);
        id = nextPositionId++;
        positions[id] = Position({
            user: msg.sender,
            asset: asset,
            up: up,
            principal: stake,
            bankroll: stake,
            atRisk: 0,
            rolls: 0,
            losses: 0,
            active: true,
            policy: policy
        });
        _pending[asset].push(id);
        emit PositionOpened(id, msg.sender, asset, up, stake);
    }

    /// @notice Stop rolling. Funds still exposed to a live window are returned when
    ///         that window finalizes; anything idle comes back immediately.
    function closePosition(uint256 id) external {
        Position storage p = positions[id];
        require(p.user == msg.sender && p.active, NoSuchPosition());
        p.policy.maxRolls = p.rolls; // stop at the next harvest
        emit PositionClosed(id, p.user, 0, "user-stop");
    }

    /// @notice Every position id belonging to `user`, for the UI to page over.
    ///         Unbounded by design — this is a `view`, never called on-chain.
    function positionsOf(address user) external view returns (uint256[] memory ids) {
        uint256 n;
        for (uint256 i = 1; i < nextPositionId; ++i) {
            if (positions[i].user == user) ++n;
        }
        ids = new uint256[](n);
        uint256 j;
        for (uint256 i = 1; i < nextPositionId; ++i) {
            if (positions[i].user == user) ids[j++] = i;
        }
    }

    /**
     *  @notice The retained bankroll curve, oldest point first.
     *  @return bankrolls Bankroll after each retained roll.
     *  @return won       Whether that roll returned at least what it staked.
     *  @return firstRoll The roll number `bankrolls[0]` corresponds to (1-based),
     *                    so a client can tell a trimmed curve from a full one.
     */
    function curveOf(uint256 id)
        external
        view
        returns (uint256[] memory bankrolls, bool[] memory won, uint256 firstRoll)
    {
        uint256 rolls = positions[id].rolls;
        uint256 n = rolls < CURVE_POINTS ? rolls : CURVE_POINTS;
        bankrolls = new uint256[](n);
        won = new bool[](n);
        firstRoll = rolls - n + 1;

        for (uint256 i = 0; i < n; ++i) {
            uint256 packed = _curve[id][(firstRoll - 1 + i) % CURVE_POINTS];
            bankrolls[i] = packed >> 1;
            won[i] = packed & 1 == 1;
        }
    }

    /// @notice Total equity of a position — idle bankroll plus whatever is
    ///         committed to a live window. What the UI puts on the hero line.
    function equityOf(uint256 id) external view returns (uint256) {
        Position storage p = positions[id];
        return p.bankroll + p.atRisk;
    }

    function sweep(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    receive() external payable {}
}
