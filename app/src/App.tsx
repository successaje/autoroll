import { useEffect, useMemo, useState } from "react";
import { OpenCard, type OpenRequest } from "./components/OpenCard";
import { PositionCard } from "./components/PositionCard";
import { Feed } from "./components/Feed";
import type { RollerEvent, Snapshot } from "./lib/types";

export default function App() {
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

  const current = useMemo(() => {
    if (!snap) return null;
    return snap.positions.find((p) => p.active) ?? snap.positions.at(-1) ?? null;
  }, [snap]);

  const lastEntered = useMemo(() => {
    if (!snap || !current) return null;
    const hits = snap.feed.filter(
      (e): e is Extract<RollerEvent, { kind: "entered" }> => e.kind === "entered" && e.id === current.id,
    );
    return hits.at(-1) ?? null;
  }, [snap, current]);

  async function open(r: OpenRequest) {
    setBusy(true);
    try {
      await fetch("/api/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(r),
      });
    } finally {
      setBusy(false);
    }
  }

  async function close(id: number) {
    await fetch("/api/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  const showOpen = !current || !current.active;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          AutoRoll <small>perpetual event contracts</small>
        </div>
        <span className="badge" title={connected ? "streaming" : "reconnecting"}>
          <span className={`dot ${connected ? "on" : "warn"}`} />
          {snap?.live ? "Live" : "Dry run"}
        </span>
      </header>

      {/* An active position is the whole screen; once it closes the open card
          leads again and the finished run drops below it as a result. */}
      {current?.active && (
        <PositionCard
          position={current}
          decimals={snap?.decimals ?? 6}
          lastEntered={lastEntered}
          onClose={() => close(current.id)}
        />
      )}

      {showOpen && <OpenCard onOpen={open} busy={busy} />}

      {current && !current.active && (
        <PositionCard
          position={current}
          decimals={snap?.decimals ?? 6}
          lastEntered={lastEntered}
          onClose={() => {}}
        />
      )}

      <section className="card">
        <h2 style={{ marginBottom: 6 }}>Activity</h2>
        <Feed feed={snap?.feed ?? []} decimals={snap?.decimals ?? 6} />
      </section>

      <p className="foot">
        Windows on Somnia Shannon roll every 60 seconds. dreamDEX charges zero maker,
        taker and settlement fees — which is the only reason rolling a position
        hundreds of times is worth anything at the end.
      </p>
    </main>
  );
}
