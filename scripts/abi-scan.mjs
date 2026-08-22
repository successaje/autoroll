import * as E from "../node_modules/@somnia-chain/markets-sdk/dist/eventsAbi.js";
import { toEventSelector } from "viem";
const seen = {
"0x776d26878b6eb1cb76f8ff17b78454323d7286d04fe482dd833e8c9e2241fe7d":10,
"0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd":10,
"0x8f396ac6cf2e01887362e2b39d8e56860042c604e5b1b481c87e6d9f90006e08":9,
"0x4ca9766196d8679d9b2e01457f67073d844b29646ce302169de44cd72e593d11":9,
"0xa389f948003aaa74e0c2c9cc8a98b4c16fd32b5c0d5d9885008046030daa429a":8,
"0xa304dae09530a82263c62fe0cfe08a427eb09e5dbf7506fbd3c4b19fdc76490e":4,
};
for (const [name, abi] of Object.entries(E)) {
  if (!Array.isArray(abi)) continue;
  for (const e of abi) {
    if (e.type !== "event") continue;
    const sig = `${e.name}(${e.inputs.map(i=>i.type).join(",")})`;
    const h = toEventSelector(sig);
    const hit = seen[h] !== undefined ? `  <<< OBSERVED x${seen[h]}` : "";
    if (hit || /Resolv|Void|Final|Creat|Lock|Settl/i.test(e.name))
      console.log(`${name.padEnd(26)} ${h} ${sig}${hit}`);
  }
}
