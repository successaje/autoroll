// Verifies AutoRollVault._decodeAsset's ASSET_WORD index against a real
// MarketCreated log pulled live from Shannon.
import { keccak256, toHex, toEventSelector } from "viem";
const TOPIC = "0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd";
const ASSET_WORD = 13;
const r = await fetch("https://shannon-explorer.somnia.network/api/v2/addresses/0x3ecC694Cef705358864a646142ac17A90E29e388/logs");
const { items } = await r.json();
const logs = items.filter(i => i.topics[0] === TOPIC);
if (!logs.length) { console.log("no MarketCreated logs in window"); process.exit(1); }
let ok = 0;
for (const l of logs) {
  const d = l.data.slice(2);
  const word = i => d.slice(i * 64, (i + 1) * 64);
  const off = Number(BigInt("0x" + word(ASSET_WORD)));
  const len = Number(BigInt("0x" + d.slice(off * 2, off * 2 + 64)));
  const raw = "0x" + d.slice(off * 2 + 64, off * 2 + 64 + len * 2);
  const asset = Buffer.from(raw.slice(2), "hex").toString("utf8");
  const good = /^(BTC|ETH|SOL|SOMI)$/.test(asset);
  ok += good ? 1 : 0;
  if (logs.indexOf(l) < 3) console.log(`  offset=${off} len=${len} asset="${asset}" keccak=${keccak256(raw)} ${good ? "OK" : "MISMATCH"}`);
}
console.log(`\nASSET_WORD=${ASSET_WORD}: ${ok}/${logs.length} logs decoded to a plausible asset ticker`);
process.exit(ok === logs.length ? 0 : 1);
