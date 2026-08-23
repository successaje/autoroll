// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice BinaryMarketsModule — signatures mirror @somnia-chain/markets-sdk `binaryModuleWriteAbi`.
interface IBinaryMarketsModule {
    function redeem(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint8 outcomeIdx, uint256 amount)
        external;
    function mintCompleteSet(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint256 amount) external;
    function mergeCompleteSet(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint256 amount) external;
    function markets(bytes32 marketId)
        external
        view
        returns (
            uint256 oracleQuestionId,
            uint8 outcomeSlotCount,
            uint8 voidPolicy,
            address collateral,
            uint32 originOperatorId,
            bytes32 originVenueId,
            address oracleAdapter,
            address creator,
            address market,
            address pool,
            uint256 yesId,
            uint256 noId,
            uint64 tradingStart,
            uint64 expiry
        );
}

/**
 *  @notice BinaryPool (the CLOB).
 *
 *  Binary markets use `placeBinaryOrder`, NOT the generic `placeOrder(bool isBid, …)`
 *  the spot book exposes: the YES/NO side is an explicit `OrderKind` enum that the
 *  pool maps onto the base book's (isBid, price) internally. `price` is ALWAYS in
 *  YES terms, on the collateral's own scale — a NO order at probability `p` is a
 *  price of `oneCollateral - p`.
 */
interface IBinaryPool {
    /// 0 BUY_YES · 1 SELL_YES · 2 BUY_NO · 3 SELL_NO
    function placeBinaryOrder(
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k,
        uint64 userData
    ) external payable returns (bool success, uint128 id);

    function cancelOrder(uint128 orderId) external;

    struct Level {
        uint256 price;
        uint256 quantity;
    }

    /// Resting levels on the BASE book, always in YES terms. `isBid = true` are
    /// the bids a BUY_NO (an ask in YES terms) crosses; `isBid = false` are the
    /// asks a BUY_YES crosses.
    function getBookLevels(bool isBid, uint64 numLevels) external view returns (Level[] memory);

    struct OrderBookParameters {
        uint256 tickSize;
        uint256 minQuantity;
        uint256 lotSize;
    }

    /// The grid every order must land on. Off-grid prices and sub-lot sizes are
    /// rejected outright (`InvalidQuantity`, `InvalidPrice`).
    function getOrderBookParameters() external view returns (OrderBookParameters memory);

    struct BinaryPoolParams {
        address collateralToken;
        address market;
        address outcomeToken;
        uint256 yesId;
        uint256 noId;
        uint256 oneCollateral;
        uint256 setBacking;
        address feeRecipient;
        uint256 makerFeeBpsTimes1k;
        uint256 takerFeeBpsTimes1k;
        uint256 maxBuilderFeeBpsTimes1k;
        uint256 settlementFeeBpsTimes1k;
        address settlement;
        uint64 marketNonce;
        bool finalized;
    }

    function getBinaryPoolParams() external view returns (BinaryPoolParams memory);
}

/// @notice A per-window BinaryMarket clone. `voidExpired` is the permissionless
/// dead-oracle escape hatch: once the settlement window closes with no answer,
/// anyone can void the market and both sides redeem at 0.5.
interface IBinaryMarket {
    function voidExpired() external;
    function status() external view returns (uint8);
}

/// @notice OutcomeToken6909 — Up/Down are token ids on a shared singleton.
interface IOutcomeToken6909 {
    function balanceOf(address owner, uint256 id) external view returns (uint256);
    function transfer(address to, uint256 id, uint256 amount) external returns (bool);
    /// Redemption is module-routed: the module pulls the holder's winning tokens,
    /// which it can only do as an approved operator on the singleton. Without this
    /// every redeem reverts `InsufficientPermission()`.
    function setOperator(address spender, bool approved) external returns (bool);
    function isOperator(address owner, address spender) external view returns (bool);
}

interface IERC20Meta {
    function decimals() external view returns (uint8);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
