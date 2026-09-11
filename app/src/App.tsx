import { NavigationProvider, useNavigation } from "./lib/navigation";
import { useEffect, useMemo, useState } from "react";
import { OpenCard, type OpenRequest } from "./components/OpenCard";
import { PositionCard } from "./components/PositionCard";
import { ConnectCard } from "./components/ConnectCard";
import { Landing } from "./components/Landing";
import { Feed } from "./components/Feed";
import { onChainMode, VAULT, shannon } from "./lib/chain";
import { useWallet } from "./lib/useWallet";
import { useVault } from "./lib/useVault";
import { DEFAULT_POLICY, STREAK_POLICY } from "./lib/policy";
import { closePosition, faucet, openPosition } from "./lib/vault";
import { money } from "./lib/format";
import type { Position, RollerEvent, Snapshot } from "./lib/types";

export default function App() {
  return <NavigationProvider>{onChainMode ? <OnChain /> : <OffChain />}</NavigationProvider>;
}

/* ------------------------------------------------------------------ shared */

function Shell({
  children,
  badge,
  note,
}: {
  children: React.ReactNode;
  badge: React.ReactNode;
  note?: React.ReactNode;
}) {
  const { page, go, back } = useNavigation();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand" aria-label="AutoRoll continuous event contracts">
          <img src="/icon.png" alt="" />
          <div>AutoRoll <small>continuous event contracts</small></div>
        </div>
        {badge}
      </header>
      <div className="row page-heading">
        <h1 tabIndex={-1}>{page === "position" ? "Position" : page === "trade" ? "Trade" : "Activity"}</h1>
        {(page !== "position" || history.state?.autorollDepth > 0) && <button className="chip" onClick={back}>← Back</button>}
      </div>
      {!online && <section className="card" role="status">You’re offline. Connect to refresh balances, activity and wallet actions.</section>}
      {online ? children : <section className="card empty">AutoRoll’s app shell is available offline. Live positions and trading require a connection.</section>}
      <nav className="bottom-nav" aria-label="Main navigation">
        {(["position", "trade", "activity"] as const).map(item => <button key={item} aria-current={page === item ? "page" : undefined} onClick={() => go(item)}>{item === "position" ? "Position" : item === "trade" ? "Trade" : "Activity"}</button>)}
      </nav>
      <p className="foot">
        {note}
        Shannon testnet · event windows typically roll every 60 seconds. AutoRoll only
        enters when its limit can be filled; a missed window leaves funds in the vault.
      </p>
    </main>
  );
}

function Body({
  positions,
  decimals,
  feed,
  lastEntered,
  onOpen,
  onClose,
  busy,
  step,
  readOnly,
}: {
  positions: Position[];
  decimals: number;
  feed: RollerEvent[];
  lastEntered: Extract<RollerEvent, { kind: "entered" }> | null;
  onOpen: (r: OpenRequest) => void;
  onClose: (id: number) => void;
  busy: boolean;
  step?: string | null;
  /** Watching somebody else's position: render it, offer no controls. */
  readOnly?: boolean;
}) {
  const { page, go } = useNavigation();
  const current = positions.find((p) => p.active) ?? positions.at(-1) ?? null;
  return <div className="deck workspace-deck">
    <div className="col">
      {page === "position" && (current ? <PositionCard position={current} decimals={decimals} lastEntered={lastEntered} onClose={!readOnly && current.active ? () => onClose(current.id) : undefined} /> : <section className="card stack"><h2>No position yet</h2><p className="sub">Open a view to follow it across eligible windows.</p>{!readOnly && <button className="cta" onClick={() => go("trade")}>Open a position</button>}</section>)}
      {page === "trade" && (readOnly ? <section className="card empty">You’re watching this wallet. Connect your own wallet to trade.</section> : current?.active ? <section className="card stack"><h2>Your position is running</h2><p className="sub">Close your current position before opening another.</p><button className="cta ghost" onClick={() => go("position")}>View position</button></section> : <OpenCard onOpen={onOpen} busy={busy} step={step} />)}
      {page === "activity" && <section className="card"><h2>Activity</h2><Feed feed={feed} decimals={decimals} /></section>}
    </div>
    {page !== "activity" && <section className="card desktop-activity"><h2>Activity</h2><Feed feed={feed} decimals={decimals} /></section>}
  </div>;
}

/* ------------------------------------------------------------- on-chain mode */

/**
 *  `?watch=0x…` opens a position read-only, with no wallet involved.
 *
 *  Worth having beyond debugging: a running position is the interesting thing
 *  to show somebody, and requiring them to install a wallet first to look at it
 *  is a bad trade. It is also the only way to see the vault's state on a device
 *  that has no injected provider at all.
 */
function watchParam(): `0x${string}` | null {
  const v = new URLSearchParams(window.location.search).get("watch");
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : null;
}

function OnChain() {
  const { go } = useNavigation();
  const wallet = useWallet();
  const ready = Boolean(wallet.account) && wallet.onRightChain;
  const watching = useMemo(watchParam, []);
  const spectating = !ready && watching !== null;
  const { positions, balance, decimals, feed, error, refresh } = useVault(
    ready ? wallet.account : watching,
  );
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  async function open(r: OpenRequest) {
    if (!wallet.account) return;
    setBusy(true);
    try {
      await openPosition(
        wallet.account,
        r.asset,
        r.up,
        r.stake,
        r.streak ? STREAK_POLICY : DEFAULT_POLICY,
        setStep,
      );
      await refresh();
      go("position");
    } catch (err: any) {
      // 4001 is the user dismissing the wallet prompt — not an error state.
      if (err?.code !== 4001) setStep(err?.shortMessage ?? err?.message ?? "Transaction failed");
      return;
    } finally {
      setBusy(false);
      setTimeout(() => setStep(null), 2_500);
    }
  }

  async function close(id: number) {
    if (!wallet.account) return;
    try {
      await closePosition(wallet.account, id);
      await refresh();
    } catch {
      /* user dismissed */
    }
  }

  const badge = (
    <span className="badge" title={VAULT}>
      {/* Amber means "your wallet needs attention". On the landing there is no
          wallet yet and nothing is wrong, so it stays neutral there. */}
      <span className={`dot ${ready ? "on" : wallet.account ? "warn" : ""}`} />
      {ready
        ? `${wallet.account!.slice(0, 6)}…${wallet.account!.slice(-4)}`
        : spectating
          ? `watching ${watching!.slice(0, 6)}…${watching!.slice(-4)}`
          : shannon.name}
    </span>
  );

  return (
    <Shell badge={badge}>
      {!ready && !spectating ? (
        wallet.account && !wallet.onRightChain ? (
          <ConnectCard wallet={wallet} />
        ) : (
          <Landing wallet={wallet} />
        )
      ) : (
        <>
          {error && (
            <section className="card">
              <p className="sub" style={{ color: "var(--critical)" }}>{error}</p>
            </section>
          )}
          <Body
            positions={positions}
            decimals={decimals}
            feed={feed}
            lastEntered={null}
            onOpen={open}
            onClose={close}
            busy={busy}
            step={step}
            readOnly={spectating}
          />
          <div className="row" style={{ padding: "0 4px" }}>
            <span className="sub">Test tUSDC balance {money(balance.toString(), decimals)}</span>
            {!spectating && (
              <button
                className="chip"
                onClick={() => wallet.account && faucet(wallet.account).then(refresh)}
              >
                Get test tUSDC
              </button>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------ off-chain mode */

/** Drives the off-chain roller instead of a deployed vault. Identical product;
 *  it exists so the whole thing is demonstrable before the vault is deployed. */
function OffChain() {
  const { go } = useNavigation();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      setSnap(JSON.parse(m.data));
      setConnected(true);
    };
    return () => es.close();
  }, []);

  const positions = snap?.positions ?? [];
  const current = positions.find((p) => p.active) ?? positions.at(-1) ?? null;

  const lastEntered = useMemo(() => {
    if (!snap || !current) return null;
    const hits = snap.feed.filter(
      (e): e is Extract<RollerEvent, { kind: "entered" }> => e.kind === "entered" && e.id === current.id,
    );
    return hits.at(-1) ?? null;
  }, [snap, current]);

  async function post(path: string, body: unknown) {
    await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const badge = (
    <span className="badge" title={connected ? "streaming" : "reconnecting"}>
      <span className={`dot ${connected ? "on" : "warn"}`} />
      {snap?.live ? "Live" : "Dry run"}
    </span>
  );

  return (
    <Shell
      badge={badge}
      note={
        <>
          Running against the off-chain roller — set <code>VITE_VAULT_ADDRESS</code> to
          drive a deployed vault from your wallet instead.{" "}
        </>
      }
    >
      <Body
        positions={positions}
        decimals={snap?.decimals ?? 6}
        feed={snap?.feed ?? []}
        lastEntered={lastEntered}
        onOpen={async (r) => {
          setBusy(true);
          try {
            await post("/api/open", r);
            go("position");
          } finally {
            setBusy(false);
          }
        }}
        onClose={(id) => void post("/api/close", { id })}
        busy={busy}
      />
    </Shell>
  );
}
