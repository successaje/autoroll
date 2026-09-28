import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../dist/", import.meta.url);
async function files(dir = "") {
  const entries = await readdir(new URL(dir, root), { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}${e.name}/`) : `${dir}${e.name}`))).flat();
}
const paths = (await files()).filter(p => p !== "sw.js");
const hash = createHash("sha256");
for (const p of paths) hash.update(await readFile(new URL(p, root)));
const cache = `autoroll-shell-${hash.digest("hex").slice(0, 16)}`;
await writeFile(new URL("sw.js", root), `
const CACHE = ${JSON.stringify(cache)};
const SHELL = ${JSON.stringify(paths.map(p => '/' + p))};
// Take over as soon as the new shell is cached. The previous build waited for
// every tab to close first, which is tidier in theory and wrong in practice:
// an open tab - or an installed PWA, which is never "closed" - kept serving a
// stale app indefinitely, so a deploy could be live and invisible.
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('autoroll-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    // Network first for navigations, falling back to the cached shell offline.
    // Cache-only here is what made a stale shell survive every redeploy.
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('/index.html'))));
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(hit => hit || fetch(event.request)));
  }
});
`);
console.log(`Generated ${cache} (${paths.length} shell assets)`);
