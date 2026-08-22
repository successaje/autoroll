import { useEffect, useMemo, useState } from "react";
import { OpenCard, type OpenRequest } from "./components/OpenCard";
import { PositionCard } from "./components/PositionCard";
import { ConnectCard } from "./components/ConnectCard";
import { Feed } from "./components/Feed";
import { onChainMode, VAULT, shannon } from "./lib/chain";
import { useWallet } from "./lib/useWallet";
import { useVault } from "./lib/useVault";
import { DEFAULT_POLICY, STREAK_POLICY } from "./lib/policy";
import { closePosition, faucet, openPosition } from "./lib/vault";
import { money } from "./lib/format";
import type { Position, RollerEvent, Snapshot } from "./lib/types";

export default function App() {
  return onChainMode ? <OnChain /> : <OffChain />;
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
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          AutoRoll <small>perpetual event contracts</small>
        </div>
        {badge}
      </header>
      {children}
      <p className="foot">
        {note}
        Windows on Somnia Shannon roll every 60 seconds. dreamDEX charges zero maker,
        taker and settlement fees — which is the only reason rolling a position
        hundreds of times is worth anything at the end.
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
}: {
  positions: Position[];
  decimals: number;
  feed: RollerEvent[];
  lastEntered: Extract<RollerEvent, { kind: "entered" }> | null;
  onOpen: (r: OpenRequest) => void;
  onClose: (id: number) => void;
  busy: boolean;
  step?: string | null;
}) {
  const current = positions.find((p) => p.active) ?? positions.at(-1) ?? null;
  const showOpen = !current || !current.active;

  return (
    <>
      {/* An active position is the whole screen; once it closes the open card
          leads again and the finished run drops below it as a result. */}
      {current?.active && (
        <PositionCard
          position={current}
          decimals={decimals}
          lastEntered={lastEntered}
          onClose={() => onClose(current.id)}
        />
      )}

      {showOpen && <OpenCard onOpen={onOpen} busy={busy} step={step} />}

      {current && !current.active && (
        <PositionCard
          position={current}
          decimals={decimals}
          lastEntered={lastEntered}
          onClose={() => {}}
        />
      )}

      <section className="card">
        <h2 style={{ marginBottom: 6 }}>Activity</h2>
        <Feed feed={feed} decimals={decimals} />
      </section>
    </>
  );
}

/* ------------------------------------------------------------- on-chain mode */

function OnChain() {
  const wallet = useWallet();
  const ready = Boolean(wallet.account) && wallet.onRightChain;
  const { positions, balance, decimals, feed, error, refresh } = useVault(
    ready ? wallet.account : null,
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
      <span className={`dot ${ready ? "on" : "warn"}`} />
      {ready ? `${wallet.account!.slice(0, 6)}…${wallet.account!.slice(-4)}` : shannon.name}
    </span>
  );

  return (
    <Shell badge={badge}>
      {!ready ? (
        <ConnectCard wallet={wallet} />
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
          />
          <div className="row" style={{ padding: "0 4px" }}>
            <span className="sub">Balance {money(balance.toString(), decimals)} tUSDC</span>
            <button
              className="chip"
              onClick={() => wallet.account && faucet(wallet.account).then(refresh)}
            >
              Get test tUSDC
            </button>
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
