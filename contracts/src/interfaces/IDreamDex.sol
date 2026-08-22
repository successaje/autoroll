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

/// @notice BinaryPool (the CLOB). Prices are Up probabilities in 18 decimals.
interface IBinaryPool {
    function placeOrder(
        bool isBid,
        uint64 userData,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k
    ) external payable;
    function cancelOrder(uint128 orderId) external;
}

/// @notice OutcomeToken6909 — Up/Down are token ids on a shared singleton.
interface IOutcomeToken6909 {
    function balanceOf(address owner, uint256 id) external view returns (uint256);
    function transfer(address to, uint256 id, uint256 amount) external returns (bool);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
