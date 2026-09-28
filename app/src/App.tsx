import { useEffect, useMemo, useState } from "react";
import { NavigationProvider, useNavigation } from "./lib/navigation";
import { useWallet } from "./lib/useWallet";
import { useVault } from "./lib/useVault";
import { DEMO_ADDRESS } from "./lib/chain";
import { RollToasts } from "./components/RollToasts";
import { useWindows } from "./lib/useWindows";
import { closePosition, faucet, openPosition } from "./lib/vault";
import { DEFAULT_POLICY } from "./lib/policy";
import { onChainMode, shannon, VAULT } from "./lib/chain";
import type { RollerEvent, Snapshot } from "./lib/types";
import {
  ActivityScreen,
  AppShell,
  MarketingSite,
  MarketScreen,
  MarketsScreen,
  PortfolioScreen,
  PositionScreen,
  StatusScreen,
} from "./components/ProductExperience";

export default function App() {
  return <NavigationProvider><Router /></NavigationProvider>;
}

function Router() {
  const { route } = useNavigation();
  const windows = useWindows();
  if (route.name === "home") return <MarketingSite markets={windows} />;
  return onChainMode ? <OnChainApp markets={windows} /> : <OffChainApp markets={windows} />;
}

function watchParam(): `0x${string}` | null {
  const value = new URLSearchParams(location.search).get("watch");
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? value as `0x${string}` : null;
}

function OnChainApp({ markets }: { markets: ReturnType<typeof useWindows> }) {
  const { route, go } = useNavigation();
  const wallet = useWallet();
  const watch = useMemo(watchParam, []);
  const ready = Boolean(wallet.account) && wallet.onRightChain;
  /*  With no wallet and no ?watch, fall back to the showcase account rather than
      an empty app. Somebody opening this link for the first time — on a phone,
      in a Discord call, with nothing installed — should see real positions
      rolling, not an empty-state telling them to go and get a wallet first.
      Everything is read-only until a wallet connects. */
  const demo = !ready && !watch ? DEMO_ADDRESS ?? null : null;
  const target = ready ? wallet.account : watch ?? demo;
  const readOnly = !ready && Boolean(target);
  const { positions, balance, decimals, feed, error, loading, stale, refresh } = useVault(target);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ asset: string; up: boolean; stake: number } | null>(null);

  useEffect(() => {
    if (route.name !== "markets" || loading || !ready || positions.length === 0) return;
    if (new URLSearchParams(location.search).get("source") === "pwa") go({ name: "portfolio" }, true);
  }, [route.name, loading, ready, positions.length, go]);

  async function connect() {
    if (wallet.account && !wallet.onRightChain) await wallet.switchNetwork();
    else await wallet.connect();
  }

  async function open(request: { asset: string; up: boolean; stake: number; streak: boolean }) {
    if (!wallet.account || !wallet.onRightChain) return connect();
    setBusy(true); setActionError(null);
    try {
      await openPosition(wallet.account, request.asset, request.up, request.stake, DEFAULT_POLICY, setStep);
      await refresh();
      setOpened({ asset: request.asset, up: request.up, stake: request.stake });
      go({ name: "portfolio" });
    } catch (err: any) {
      if (err?.code !== 4001) setActionError(friendlyError(err));
    } finally { setBusy(false); setStep(null); }
  }

  async function stop(id: number) {
    if (!wallet.account) return;
    setBusy(true); setActionError(null); setStep("Confirm stop in your wallet…");
    try { await closePosition(wallet.account, id); await refresh(); }
    catch (err: any) { if (err?.code !== 4001) setActionError(friendlyError(err)); }
    finally { setBusy(false); setStep(null); }
  }

  const label = ready && wallet.account ? `${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)}` : wallet.account ? "Switch network" : "Connect wallet";
  const currentPosition = route.name === "position" ? positions.find((p) => p.id === route.id) : null;

  return <AppShell route={route} accountLabel={label} onConnect={() => void connect()}>
    {(wallet.error || error || actionError || stale) && <div className="app-alert" role="status"><div><b>{actionError ? "Action needs attention" : stale ? "Showing the last verified state" : "Connection needs attention"}</b><p>{actionError ?? wallet.error ?? error ?? "AutoRoll will keep retrying the Shannon RPC."}</p></div><button onClick={() => void refresh()}>Retry</button></div>}
    {readOnly && <div className="readonly-banner"><span>👁</span><div><b>Read-only showcase</b><p>You are viewing a live account on Somnia Shannon. Connect a wallet to open your own position.</p></div><button onClick={() => void connect()}>Connect</button></div>}
    {route.name === "markets" && <MarketsScreen markets={markets} />}
    {route.name === "market" && <MarketScreen asset={route.asset} initialSide={route.side} balance={balance} decimals={decimals} connected={ready} busy={busy} step={step} onConnect={() => void connect()} onOpen={(r) => void open(r)} />}
    {route.name === "portfolio" && <PortfolioScreen positions={positions} decimals={decimals} loading={loading && !positions.length} success={opened} onDismissSuccess={() => setOpened(null)} />}
    {route.name === "position" && (currentPosition ? <PositionScreen position={currentPosition} decimals={decimals} feed={feed} onStop={ready ? () => void stop(currentPosition.id) : undefined} /> : <NotFound onMarkets={() => go({ name: "portfolio" })} />)}
    {route.name === "activity" && <ActivityScreen feed={feed} decimals={decimals} />}
    {route.name === "status" && <StatusScreen connected={markets.connected} />}
    {ready && balance === 0n && route.name !== "status" && <button className="test-funds" disabled={busy} onClick={async () => { if (!wallet.account) return; setBusy(true); try { await faucet(wallet.account); await refresh(); } finally { setBusy(false); } }}>Get test tUSDC</button>}
    <RollToasts positions={positions} decimals={decimals} />
  </AppShell>;
}

function OffChainApp({ markets }: { markets: ReturnType<typeof useWindows> }) {
  const { route, go } = useNavigation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const stream = new EventSource("/api/stream");
    stream.onmessage = (message) => setSnapshot(JSON.parse(message.data));
    return () => stream.close();
  }, []);
  const positions = snapshot?.positions ?? [];
  const feed = snapshot?.feed ?? [];
  const decimals = snapshot?.decimals ?? 6;
  async function post(path: string, body: unknown) { await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
  const position = route.name === "position" ? positions.find((p) => p.id === route.id) : null;
  return <AppShell route={route} accountLabel="Dry run" onConnect={() => {}}>
    {route.name === "markets" && <MarketsScreen markets={markets} />}
    {route.name === "market" && <MarketScreen asset={route.asset} initialSide={route.side} balance={500_000_000n} decimals={6} connected busy={busy} step={null} onConnect={() => {}} onOpen={async (request) => { setBusy(true); try { await post("/api/open", request); go({ name: "portfolio" }); } finally { setBusy(false); } }} />}
    {route.name === "portfolio" && <PortfolioScreen positions={positions} decimals={decimals} loading={!snapshot} />}
    {route.name === "position" && (position ? <PositionScreen position={position} decimals={decimals} feed={feed} onStop={() => void post("/api/close", { id: position.id })} /> : <NotFound onMarkets={() => go({ name: "portfolio" })} />)}
    {route.name === "activity" && <ActivityScreen feed={feed} decimals={decimals} />}
    {route.name === "status" && <StatusScreen connected={markets.connected} />}
  </AppShell>;
}

function NotFound({ onMarkets }: { onMarkets: () => void }) { return <div className="empty-state"><span>↻</span><h2>Position not found</h2><p>This position is unavailable for the connected wallet.</p><button className="button primary" onClick={onMarkets}>Return to portfolio</button></div>; }
function friendlyError(error: any) {
  const message = error?.shortMessage ?? error?.message ?? "The action could not be completed.";
  if (/insufficient/i.test(message)) return "The wallet does not have enough tUSDC or STT. Your existing vault funds are unaffected.";
  if (/revert/i.test(message)) return "The transaction was rejected by the contract. Your funds remain safe; try refreshing the position state.";
  return message;
}
