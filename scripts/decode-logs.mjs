import * as E from "../node_modules/@somnia-chain/markets-sdk/dist/eventsAbi.js";
import { decodeEventLog, toEventSelector } from "viem";
const abi=[]; for(const a of Object.values(E)) if(Array.isArray(a)) for(const e of a) if(e.type==="event") abi.push(e);
const r=await fetch("https://shannon-explorer.somnia.network/api/v2/addresses/0x3ecC694Cef705358864a646142ac17A90E29e388/logs");
const {items}=await r.json();
const byTopic={}; for(const it of items) (byTopic[it.topics[0]] ??= []).push(it);
for(const [t0,logs] of Object.entries(byTopic)){
  const l=logs[0];
  try{
    const d=decodeEventLog({abi,topics:l.topics,data:l.data});
    console.log(`\n${t0} -> ${d.eventName}  (x${logs.length})`);
    for(const [k,v] of Object.entries(d.args)) console.log(`   ${k} = ${String(v).slice(0,80)}`);
  }catch(err){ console.log(`\n${t0} -> UNKNOWN (x${logs.length}) topics=${l.topics.length} dataLen=${(l.data.length-2)/2}`);
    l.topics.forEach((t,i)=>console.log(`   t${i}=${t}`)); }
}
