/**
 *  The roller, wrapped in an HTTP surface so the UI can drive it.
 *
 *  This is the demo seam: in production the browser would sign `openPosition`
 *  against `AutoRollVault` and read positions straight off chain. Here it talks
 *  to the off-chain roller, so the whole product is demonstrable before the vault
 *  has its 32 STT.
 *
 *    npx tsx src/server.ts            # dry run
 *    npx tsx src/server.ts --live     # signs and trades
 */
import { createServer } from "node:http";
import { makeExchange } from "./exchange.js";
import { Roller, type RollerEvent } from "./roller.js";
import { liveWindows } from "./windows.js";
import { DEFAULT_POLICY, STREAK_POLICY, type Policy } from "./policy.js";

const PORT = Number(process.env.PORT ?? 5183);
const DECIMALS = 6; // testnet collateral is 6dp TestUSDC

const live = process.argv.includes("--live");
const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (live && !pk) {
  console.error("--live needs PRIVATE_KEY in the environment");
  process.exit(1);
}

const ex = makeExchange(live ? pk : undefined);
const account = live ? (((await ex.trader) as any).account?.address ?? null) : null;
const roller = new Roller(ex, account, { live, cadenceSec: 60 });

/** Ring buffer of recent events, so a late-joining browser has context. */
const feed: Array<RollerEvent & { at: number }> = [];
roller.subscribe((e) => {
  feed.push({ ...e, at: Date.now() });
  if (feed.length > 200) feed.shift();
  broadcast();
});

const clients = new Set<import("node:http").ServerResponse>();

function snapshot() {
  return JSON.stringify(
    {
      live,
      decimals: DECIMALS,
      positions: roller.getPositions(),
      feed: feed.slice(-40),
    },
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );
}

function broadcast() {
  const payload = `data: ${snapshot()}\n\n`;
  for (const res of clients) res.write(payload);
}

// Push a heartbeat frame so countdowns and "seconds to expiry" stay honest even
// when nothing transitioned.
setInterval(broadcast, 1000);

const json = (res: any, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
};

const readBody = (req: any): Promise<any> =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST",
    });
    return res.end();
  }

  if (url.pathname === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    res.write(`data: ${snapshot()}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (url.pathname === "/api/windows") {
    try {
      return json(res, 200, await liveWindows(ex));
    } catch (err) {
      return json(res, 502, { error: (err as Error).message });
    }
  }

  if (url.pathname === "/api/open" && req.method === "POST") {
    const b = await readBody(req);
    const policy: Policy = b.streak
      ? STREAK_POLICY
      : { ...DEFAULT_POLICY, ...(b.policy ?? {}) };
    const p = roller.open(String(b.asset ?? "BTC"), Boolean(b.up), Number(b.stake ?? 25), DECIMALS, policy);
    return json(res, 200, { id: p.id });
  }

  if (url.pathname === "/api/close" && req.method === "POST") {
    const b = await readBody(req);
    return json(res, 200, { ok: roller.requestClose(Number(b.id)) });
  }

  json(res, 404, { error: "not found" });
}).listen(PORT, () => {
  console.log(`autoroll server on :${PORT}  (${live ? "LIVE" : "DRY RUN"})`);
});

void roller.run();
