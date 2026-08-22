#!/usr/bin/env node
/**
 *  Recording helper. Resets the position book and opens a warm-up position, so
 *  the app already has a real curve on screen when the camera starts.
 *
 *    node scripts/demo.mjs reset          # clear the book
 *    node scripts/demo.mjs warm BTC up    # clear, then open and start rolling
 *
 *  It does NOT influence outcomes. Windows resolve off the venue's oracle and a
 *  60-second BTC window is close to a coin flip — see DEMO.md on how to frame
 *  that, and on why faking it would be the wrong call.
 */
import { rm } from "node:fs/promises";

const API = process.env.API ?? "http://localhost:5183";
const [cmd = "warm", asset = "BTC", dir = "up", stake = "250"] = process.argv.slice(2);

async function post(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

if (cmd === "reset") {
  await rm(".autoroll-state.json", { force: true });
  console.log("Position book cleared. Restart the API server to pick it up.");
  process.exit(0);
}

const { id } = await post("/api/open", {
  asset: asset.toUpperCase(),
  up: dir.toLowerCase() === "up",
  stake: Number(stake),
});

console.log(`Opened #${id}: ${asset.toUpperCase()} ${dir.toUpperCase()} · ${stake} tUSDC`);
console.log("");
console.log("Leave this rolling for ~20 minutes before you record. At a 60s cadence");
console.log("that is roughly 20 points on the curve, which is what makes the chart");
console.log("read as a position rather than a couple of coin flips.");
