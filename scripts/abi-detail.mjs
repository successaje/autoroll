import * as E from "../node_modules/@somnia-chain/markets-sdk/dist/eventsAbi.js";
import { toEventSelector } from "viem";
const want = new Set(["0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd","0x8f396ac6cf2e01887362e2b39d8e56860042c604e5b1b481c87e6d9f90006e08","0xa389f948003aaa74e0c2c9cc8a98b4c16fd32b5c0d5d9885008046030daa429a"]);
const done=new Set();
for (const abi of Object.values(E)) { if(!Array.isArray(abi)) continue;
  for (const e of abi) { if (e.type!=="event") continue;
    const h=toEventSelector(`${e.name}(${e.inputs.map(i=>i.type).join(",")})`);
    if (!want.has(h)||done.has(h)) continue; done.add(h);
    console.log(`\n${e.name}  ${h}`);
    e.inputs.forEach((i,n)=>console.log(`  [${n}] ${i.indexed?"INDEXED":"       "} ${i.type} ${i.name}`));
  }}
