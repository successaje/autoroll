import { toEventSelector } from "viem";
const targets = new Set([
"0x776d26878b6eb1cb76f8ff17b78454323d7286d04fe482dd833e8c9e2241fe7d",
"0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd",
"0x8f396ac6cf2e01887362e2b39d8e56860042c604e5b1b481c87e6d9f90006e08",
"0x4ca9766196d8679d9b2e01457f67073d844b29646ce302169de44cd72e593d11",
"0xa389f948003aaa74e0c2c9cc8a98b4c16fd32b5c0d5d9885008046030daa429a",
"0xa304dae09530a82263c62fe0cfe08a427eb09e5dbf7506fbd3c4b19fdc76490e",
]);
const names = ["MarketCreated","MarketResolved","MarketLocked","MarketVoided","MarketFinalized","MarketListed","MarketOpened","MarketExpired","MarketSettled","MarketRolled","SuccessorCreated","BinaryMarketCreated","BinaryMarketResolved","SetMinted","SetBurned","SetsMinted","SetsBurned","CompleteSetMinted","CompleteSetBurned","Redeemed","Redeem","PositionRedeemed","StatusChanged","MarketStatusChanged","OracleQuestionScheduled","Resolved","Voided","Finalized","Locked","Created"];
// arg-type vocab for 3 indexed leading (uint256/uint64/uint32 venueId, uintX, bytes32 marketId) + tails
const idT = ["uint256","uint64","uint32","uint16"];
const secondT = ["uint256","uint64","uint32","uint8","uint16"];
const tails = [
 "", ",address", ",address,address", ",uint256", ",address,uint256", ",uint256,uint256",
 ",address,uint64,uint32", ",uint8", ",bool", ",uint256,address",
 ",string,address,uint256", ",address,uint256,uint256", ",uint8,uint256",
 ",address,uint32,uint64", ",uint64,uint64", ",uint256,uint256,uint256",
 ",address,address,uint256",",bool,uint256",",uint256,bool",",address,uint8",
];
const found = {};
for (const n of names) for (const a of idT) for (const b of secondT) for (const t of tails) {
  const sig = `${n}(${a},${b},bytes32${t})`;
  const h = toEventSelector(sig);
  if (targets.has(h)) found[h] = sig;
}
console.log(found, "matched", Object.keys(found).length, "/", targets.size);
