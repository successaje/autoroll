import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../dist/', import.meta.url);
const source = await readFile(new URL('sw.js',root),'utf8');
const handlers = {};
const responses = new Map();
let cached = [];
let netFail = false;
const removed = [];
const cache = {addAll: async paths => {cached=paths;}, match: async path => responses.get(path)};
vm.runInNewContext(source, {self:{location:{origin:'https://autoroll.test'},addEventListener:(name,cb)=>handlers[name]=cb,clients:{claim:async()=>{}},skipWaiting:async()=>{}}, caches:{open:async()=>cache,keys:async()=>['unrelated','autoroll-shell-old'],delete:async key=>removed.push(key)}, URL, fetch:async()=>{if(netFail) throw new Error('offline'); return 'network';}});
test('install precaches all emitted assets, including valid PNG install icons',async()=>{
 let done; handlers.install({waitUntil:p=>done=p});await done;
 assert.ok(cached.includes('/index.html'));
 const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));
 assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const bytes=await readFile(new URL(icon.src.slice(1),root)); assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);}
 for(const path of cached) await readFile(new URL(path.slice(1),root));
});
// Navigation is network-first with a cached-shell fallback. It used to be
// cache-only, which meant an open tab - or an installed PWA, which is never
// closed - kept serving a stale app through every redeploy. This test asserts
// both halves, because the old version only ever exercised the cache path
// while its harness had fetch succeeding.
test('online navigation takes the network; offline falls back to the shell',async()=>{
 responses.set('/index.html','offline shell');
 let online;handlers.fetch({request:{url:'https://autoroll.test/?page=activity&watch=0x123',method:'GET',mode:'navigate'},respondWith:p=>online=p});assert.equal(await online,'network');
 netFail=true;
 let offline;handlers.fetch({request:{url:'https://autoroll.test/?page=activity',method:'GET',mode:'navigate'},respondWith:p=>offline=p});assert.equal(await offline,'offline shell');
 netFail=false;
});
test('RPC, API and writes bypass the cache',async()=>{
 for(const [url,method] of [['https://autoroll.test/api/stream','GET'],['https://rpc.test/','GET'],['https://autoroll.test/api/open','POST']]){let intercepted=false;handlers.fetch({request:{url,method},respondWith:()=>intercepted=true});assert.equal(intercepted,false);}
});
test('activation deletes only old AutoRoll caches',async()=>{let done;handlers.activate({waitUntil:p=>done=p});await done;assert.deepEqual(removed,['autoroll-shell-old']);});
