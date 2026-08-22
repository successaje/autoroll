import { encodeFunctionData, toEventSelector, decodeErrorResult } from "viem";
const RPC="https://api.infra.testnet.somnia.network/";
const PRE="0x0000000000000000000000000000000000000100";
const MODULE="0x3ecC694Cef705358864a646142ac17A90E29e388";
const FINALIZED=toEventSelector("MarketFinalized(bytes32,address,uint256)");
const abi=[{name:"subscribe",type:"function",stateMutability:"nonpayable",
  inputs:[{type:"tuple",name:"d",components:[
    {type:"bytes32[4]",name:"eventTopics"},{type:"address",name:"origin"},{type:"address",name:"caller"},
    {type:"address",name:"emitter"},{type:"address",name:"handlerContractAddress"},{type:"bytes4",name:"handlerFunctionSelector"},
    {type:"uint64",name:"priorityFeePerGas"},{type:"uint64",name:"maxFeePerGas"},{type:"uint64",name:"gasLimit"},
    {type:"bool",name:"isGuaranteed"},{type:"bool",name:"isCoalesced"}]}],
  outputs:[{type:"uint256"}]}];
const Z="0x0000000000000000000000000000000000000000";
const data=encodeFunctionData({abi,functionName:"subscribe",args:[{
  eventTopics:[FINALIZED,"0x"+"0".repeat(64),"0x"+"0".repeat(64),"0x"+"0".repeat(64)],
  origin:Z, caller:Z, emitter:MODULE,
  handlerContractAddress:"0x000000000000000000000000000000000000dEaD",
  handlerFunctionSelector:"0x1cb44dfc", // onEvent(address,bytes32[],bytes)
  priorityFeePerGas:0n, maxFeePerGas:20000000000n, gasLimit:1000000n,
  isGuaranteed:false, isCoalesced:false }]});
const CALLER="0x1111111111111111111111111111111111111111";
async function call(overrides){
  const params=[{from:CALLER,to:PRE,data},"latest"]; if(overrides) params.push(overrides);
  const r=await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params})});
  return r.json();
}
console.log("MarketFinalized topic0:", FINALIZED);
console.log("\n[A] zero-balance caller ->", JSON.stringify(await call()));
console.log("\n[B] with 100 STT state override ->", JSON.stringify(await call({[CALLER]:{balance:"0x56bc75e2d63100000"}})));
