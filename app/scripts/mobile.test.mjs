import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../dist/', import.meta.url);
const source = await readFile(new URL('sw.js',root),'utf8');
const handlers = {};
const responses = new Map();
let cached = [];
const removed = [];
const cache = {addAll: async paths => {cached=paths;}, match: async path => responses.get(path)};
vm.runInNewContext(source, {self:{location:{origin:'https://autoroll.test'},addEventListener:(name,cb)=>handlers[name]=cb,clients:{claim:async()=>{}}}, caches:{open:async()=>cache,keys:async()=>['unrelated','autoroll-shell-old'],delete:async key=>removed.push(key)}, URL, fetch:async()=> 'network'});
test('install precaches all emitted assets, including valid PNG install icons',async()=>{
 let done; handlers.install({waitUntil:p=>done=p});await done;
 assert.ok(cached.includes('/index.html'));
 const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));
 assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const bytes=await readFile(new URL(icon.src.slice(1),root)); assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);}
 for(const path of cached) await readFile(new URL(path.slice(1),root));
});
test('offline navigation uses shell; RPC, API and writes bypass cache',async()=>{
 responses.set('/index.html','offline shell');
 let reply;handlers.fetch({request:{url:'https://autoroll.test/?page=activity&watch=0x123',method:'GET',mode:'navigate'},respondWith:p=>reply=p});assert.equal(await reply,'offline shell');
 for(const [url,method] of [['https://autoroll.test/api/stream','GET'],['https://rpc.test/','GET'],['https://autoroll.test/api/open','POST']]){let intercepted=false;handlers.fetch({request:{url,method},respondWith:()=>intercepted=true});assert.equal(intercepted,false);}
});
test('activation deletes only old AutoRoll caches',async()=>{let done;handlers.activate({waitUntil:p=>done=p});await done;assert.deepEqual(removed,['autoroll-shell-old']);});
