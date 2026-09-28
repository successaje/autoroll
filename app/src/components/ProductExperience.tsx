import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { Feed } from "./Feed";
import { EquityCurve } from "./EquityCurve";
import { useNavigation, type Route } from "../lib/navigation";
import { money, pnl } from "../lib/format";
import { DEFAULT_POLICY } from "../lib/policy";
import { DEMO_ADDRESS, shannon, VAULT } from "../lib/chain";
import type { Position, RollerEvent } from "../lib/types";
import type { WindowEvent } from "../lib/useWindows";

export type MarketState = { events: WindowEvent[]; connected: boolean; expired: number; opened: number; seeded: number };

export function Brand({ onClick }: { onClick?: () => void }) {
  return <button className="brand-button" onClick={onClick} aria-label="AutoRoll home"><img src="/icon.png" alt="" /><span>AutoRoll</span></button>;
}

export function MarketingSite({ markets }: { markets: MarketState }) {
  const { go } = useNavigation();
  const launch = () => go({ name: "markets" });
  const demoHref = DEMO_ADDRESS
    ? `/app/portfolio?watch=${encodeURIComponent(DEMO_ADDRESS)}`
    : "#how";
  return <div className="site-shell">
    <header className="site-nav">
      <Brand onClick={() => scrollTo({ top: 0, behavior: "smooth" })} />
      <nav aria-label="Website navigation"><a href="#how">How it works</a><a href="#dreamdex">Why DreamDEX</a><a href="#mobile">Mobile</a><button onClick={() => go({ name: "status" })}>Status</button></nav>
      <div className="nav-actions"><ThemeToggle /><button className="button primary compact" onClick={launch}>Launch app <span>→</span></button></div>
    </header>

    <main>
      <section className="marketing-hero">
        <div className="hero-copy">
          <p className="overline">Persistent positions on DreamDEX</p>
          <h1>Take a position.<br />Keep it.</h1>
          <p className="lede">AutoRoll turns DreamDEX’s expiring markets into positions that keep rolling automatically. Open once. Stay in until you decide to leave.</p>
          <div className="hero-actions"><button className="button primary" onClick={launch}>Launch AutoRoll <span>→</span></button><a className="button secondary" href={demoHref}>{DEMO_ADDRESS ? "View on-chain run" : "See how it works"}</a></div>
          <div className="proof-row"><span>On-chain vault</span><span>Price-protected entry</span><span>User-controlled exit</span></div>
        </div>
        <RolloverDemo connected={markets.connected} />
      </section>

      <section className="section markets-preview">
        <div className="section-intro"><p className="overline">Supported markets</p><h2>Choose the view.<br />We handle the windows.</h2><p>AutoRoll currently supports DreamDEX’s BTC and ETH directional markets on Somnia Shannon.</p></div>
        <div className="market-grid">{(["BTC", "ETH"] as const).map((asset) => <MarketTile key={asset} asset={asset} onClick={() => go({ name: "market", asset })} connected={markets.connected} />)}</div>
      </section>

      <section className="section how-section" id="how">
        <div className="section-intro"><p className="overline">How it works</p><h2>One decision.<br />Continuous execution.</h2></div>
        <div className="steps-grid"><Step n="01" title="Pick a side">Choose BTC or ETH and the direction you believe in.</Step><Step n="02" title="Open once">Set your amount, entry guardrail, and stop policy.</Step><Step n="03" title="Keep rolling">AutoRoll settles and enters eligible successors without another signature.</Step></div>
      </section>

      <section className="section mechanism" id="dreamdex">
        <div className="mechanism-flow"><span>Window N</span><i>→</i><span>Settle</span><i>→</i><span>Redeem</span><i>→</i><span>IOC entry</span><i>→</i><span>Window N+1</span></div>
        <div className="mechanism-result"><span>BTC ↑</span><b>↻ AutoRoll active</b></div>
        <div className="feature-grid"><article><p className="overline">Zero trading fees</p><h3>The economics work repeatedly.</h3><p>Zero maker, taker, and settlement fees are not a small optimization. They make repeated rolling viable. Network execution costs remain separate.</p></article><article><p className="overline">Transparent automation</p><h3>Automation you can inspect.</h3><p>The showcase deployment is keeper-driven with permissionless fallback. Native Somnia reactivity remains part of the supported architecture, not a claim about the active driver.</p></article></div>
      </section>

      <section className="section mobile-section" id="mobile">
        <div className="phone-frame"><div className="phone-top" /><div className="phone-content"><span className="mini-label">Portfolio preview</span><strong>BTC ↑</strong><b>↻ AutoRoll active</b><div className="mini-balance">Managed balance<br /><strong>Vault-proven</strong></div><div className="mini-timeline">Window N ✓ <span>→</span> N+1 ● <span>→</span> ∞</div></div></div>
        <div className="section-intro"><p className="overline">Progressive web app</p><h2>Your position,<br />in your pocket.</h2><p>Install AutoRoll from your browser. It opens directly into the application with a cached shell, safe-area support, and a theme-aware startup.</p><button className="button primary" onClick={launch}>Open the application</button></div>
      </section>

      <section className="final-cta"><p className="overline">Markets expire. Your strategy continues.</p><h2>Take a position.<br />Keep it.</h2><button className="button light" onClick={launch}>Launch AutoRoll →</button></section>
    </main>
    <footer><Brand /><span>Built on DreamDEX · Somnia Shannon testnet</span><button onClick={() => go({ name: "status" })}>Protocol status</button></footer>
  </div>;
}

function RolloverDemo({ connected: _connected }: { connected: boolean }) {
  const [seconds, setSeconds] = useState(3);
  useEffect(() => { const t = setInterval(() => setSeconds((s) => s <= 1 ? 3 : s - 1), 1000); return () => clearInterval(t); }, []);
  return <div className="roll-demo" aria-label="AutoRoll product demonstration">
    <div className="demo-header"><span className="status-dot live" /><span>Product preview</span></div>
    <div className="demo-position"><div><span>Bitcoin</span><strong>BTC ↑</strong></div><b className="autoroll-badge">↻ AutoRoll active</b></div>
    <div className="demo-balance"><span>Strategy equity</span><strong>500.00 <small>tUSDC</small></strong></div>
    <div className="demo-window"><span>Illustrative rollover</span><strong>Window N</strong><b>00:0{seconds}</b></div>
    <div className="window-track"><span>N−1 ✓</span><i>→</i><span className="current">N ●</span><i>→</i><span>N+1</span><i>→</i><span>∞</span></div>
    <p>No new signature when the window changes.</p>
  </div>;
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) { return <article className="step"><span>{n}</span><h3>{title}</h3><p>{children}</p></article>; }

export function AppShell({ route, accountLabel, children, onConnect }: { route: Route; accountLabel: string; children: React.ReactNode; onConnect: () => void }) {
  const { go } = useNavigation();
  const active = route.name === "market" ? "markets" : route.name === "position" ? "portfolio" : route.name;
  const nav = [{ name: "markets", label: "Markets", icon: "⌁" }, { name: "portfolio", label: "Portfolio", icon: "◫" }, { name: "activity", label: "Activity", icon: "↗" }] as const;
  return <div className="app-layout">
    <aside className="app-sidebar"><Brand onClick={() => go({ name: "markets" })} /><nav>{nav.map((item) => <button key={item.name} aria-current={active === item.name ? "page" : undefined} onClick={() => go({ name: item.name })}><i>{item.icon}</i>{item.label}</button>)}<button aria-current={route.name === "status" ? "page" : undefined} onClick={() => go({ name: "status" })}><i>●</i>Status</button></nav><div className="sidebar-bottom"><button onClick={() => go({ name: "home" })}>↗ Website</button><ThemeToggle labeled /></div></aside>
    <div className="app-main"><header className="app-header"><div className="mobile-brand"><Brand onClick={() => go({ name: "markets" })} /></div><span className="network-pill"><i />Somnia Shannon</span><button className="wallet-button" onClick={onConnect}>{accountLabel}</button></header><main className="app-content">{children}</main></div>
    <nav className="mobile-nav">{nav.map((item) => <button key={item.name} aria-current={active === item.name ? "page" : undefined} onClick={() => go({ name: item.name })}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav>
  </div>;
}

export function MarketsScreen({ markets }: { markets: MarketState }) {
  const { go } = useNavigation();
  return <><PageTitle eyebrow="DreamDEX markets" title="Markets" detail="Choose an asset and direction. AutoRoll carries the position across eligible 60-second successors." /><div className="market-grid app-markets">{(["BTC", "ETH"] as const).map((asset) => <MarketTile key={asset} asset={asset} connected={markets.connected} onClick={() => go({ name: "market", asset })} />)}</div><InfoStrip /></>;
}

function MarketTile({ asset, connected, onClick }: { asset: "BTC" | "ETH"; connected: boolean; onClick: () => void }) {
  const name = asset === "BTC" ? "Bitcoin" : "Ethereum";
  return <article className="market-tile"><div className="asset-head"><span className={`asset-icon ${asset.toLowerCase()}`}>{asset === "BTC" ? "₿" : "Ξ"}</span><div><h3>{name}</h3><p>{asset}/USD</p></div><span className={`availability ${connected ? "online" : ""}`}>{connected ? "Available" : "Checking"}</span></div><div className="market-facts"><span><small>Window cadence</small><b>60 seconds</b></span><span><small>Execution</small><b>Price protected</b></span></div><div className="direction-preview"><button onClick={onClick}>↑ Go Up</button><button onClick={onClick}>↓ Go Down</button></div><div className="roll-available">↻ AutoRoll available <span>View market →</span></div></article>;
}

export function MarketScreen({ asset, balance, decimals, connected, busy, step, onConnect, onOpen }: { asset: "BTC" | "ETH"; balance: bigint; decimals: number; connected: boolean; busy: boolean; step: string | null; onConnect: () => void; onOpen: (request: { asset: string; up: boolean; stake: number; streak: boolean }) => void }) {
  const { back } = useNavigation();
  const [side, setSide] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("25");
  const [stage, setStage] = useState<"configure" | "review">("configure");
  const valid = Number(amount) > 0 && side !== null;
  return <><button className="back-button" onClick={back}>← Markets</button><div className="market-workspace"><section className="market-detail"><div className="market-identity"><span className={`asset-icon ${asset.toLowerCase()}`}>{asset === "BTC" ? "₿" : "Ξ"}</span><div><p>{asset}/USD</p><h1>{asset === "BTC" ? "Bitcoin" : "Ethereum"}</h1></div></div><div className="persistent-explainer"><p className="overline">Persistent position</p><h2>The window expires.<br />Your position continues.</h2><div className="successor-track"><span>Window N ✓</span><i>→</i><span className="current">Current ●</span><i>→</i><span>Successor</span><i>→</i><b>∞</b></div><p>AutoRoll redeems settled exposure and uses immediate-or-cancel execution to enter an eligible successor. An unfilled amount stays in the vault.</p></div><InfoStrip /></section><section className="order-panel"><div><p className="overline">Open {asset} position</p><h2>{stage === "review" ? "Review automatic behavior" : "Choose your direction"}</h2></div>{stage === "configure" ? <><div className="direction-selector"><button className="up" aria-pressed={side === true} onClick={() => setSide(true)}>↑<b>Go Up</b><small>{asset} settles higher</small></button><button className="down" aria-pressed={side === false} onClick={() => setSide(false)}>↓<b>Go Down</b><small>{asset} settles lower</small></button></div><label className="amount-field"><span>You deposit</span><div><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} /><b>tUSDC</b></div><small>Available: {money(balance.toString(), decimals)} tUSDC</small></label><div className="amount-presets">{[10,25,100].map((n) => <button key={n} onClick={() => setAmount(String(n))}>{n}</button>)}</div><PolicyCard /><button className="button primary full" disabled={!valid} onClick={() => setStage("review")}>{side === null ? "Choose Up or Down" : `Review ${asset} ${side ? "↑" : "↓"}`}</button></> : <><div className="review-position"><span>{asset} {side ? "↑" : "↓"}</span><strong>{amount} tUSDC</strong></div><ul className="review-list"><li>Enter an eligible current window</li><li>Redeem automatically when it settles</li><li>Enter the next eligible successor</li><li>Continue until you or a stop rule ends it</li></ul><PolicyCard /><p className="signature-note"><b>One approval to open.</b> No signature is required for subsequent rolls.</p><button className="button primary full" disabled={busy} onClick={() => connected ? onOpen({ asset, up: side!, stake: Number(amount), streak: false }) : onConnect()}>{busy ? step ?? "Confirming on-chain…" : connected ? "Confirm & open" : "Connect wallet to continue"}</button><button className="text-button" onClick={() => setStage("configure")} disabled={busy}>Edit position</button></>}</section></div>{busy && <TransactionProgress step={step} />}</>;
}

function PolicyCard() { return <div className="policy-card"><div><span>Per window</span><b>20% of managed balance</b></div><div><span>Maximum entry</span><b>0.65</b></div><div><span>Automatic stop</span><b>4 consecutive losses</b></div></div>; }
function TransactionProgress({ step }: { step: string | null }) { const approval = step?.toLowerCase().includes("approv"); return <div className="transaction-state" role="status"><span className="rolling-mark">↻</span><div><p className="overline">Opening position</p><h3>{approval ? "Waiting for your wallet" : "Confirming on-chain"}</h3><p>{step ?? "Preparing the transaction…"}</p></div></div>; }

export function PortfolioScreen({ positions, decimals, loading, success, onDismissSuccess }: { positions: Position[]; decimals: number; loading: boolean; success?: { asset: string; up: boolean; stake: number } | null; onDismissSuccess?: () => void }) {
  const { go } = useNavigation();
  const active = positions.filter((p) => p.active);
  const completed = positions.filter((p) => !p.active).reverse();
  const managed = active.reduce((sum, p) => sum + BigInt(p.bankroll) + BigInt(p.atRisk), 0n);
  const newest = [...active].reverse().find((p) => !success || p.asset === success.asset && p.up === success.up);
  const finalEquity = (p: Position) => p.history.at(-1)?.bankroll ?? p.principal;
  return <><PageTitle eyebrow="Your AutoRoll" title="Portfolio" detail="Persistent positions and balances proven by the vault." />{success && <section className="success-card" role="status"><span className="success-check">✓</span><div><p className="overline">Position opened</p><h2>{success.asset} {success.up ? "↑" : "↓"} · {success.stake} tUSDC</h2><b>↻ AutoRoll active</b><p>Your position will continue through eligible successor windows until you stop it.</p></div><div>{newest && <button className="button primary" onClick={() => { onDismissSuccess?.(); go({ name: "position", id: newest.id }); }}>View position</button>}<button className="button secondary" onClick={onDismissSuccess}>Done</button></div></section>}{loading ? <PortfolioSkeleton /> : <>{active.length > 0 ? <><section className="portfolio-summary"><span>Managed balance <InfoTip /></span><strong>{money(managed.toString(), decimals)} <small>tUSDC</small></strong><p>Idle vault balance plus capital committed to current windows. This is not an instantly redeemable mark price.</p></section><div className="positions-list"><h2>Active positions</h2>{active.map((p) => <button className="position-row" key={p.id} onClick={() => go({ name: "position", id: p.id })}><span className={`asset-icon ${p.asset.toLowerCase()}`}>{p.asset === "BTC" ? "₿" : "Ξ"}</span><span><b>{p.asset} {p.up ? "↑" : "↓"}</b><small>↻ AutoRoll active</small></span><span><b>{money((BigInt(p.bankroll) + BigInt(p.atRisk)).toString(), decimals)} tUSDC</b><small>{p.rolls} {p.rolls === 1 ? "roll" : "rolls"}</small></span><i>→</i></button>)}</div></> : completed.length ? <CompletedProof position={completed[0]} decimals={decimals} onOpen={() => go({ name: "position", id: completed[0].id })} /> : <EmptyState title="No active positions" detail="Take a market view once. AutoRoll handles eligible windows after that." action="Explore markets" onClick={() => go({ name: "markets" })} />}{completed.length > 0 && <div className="positions-list completed-list"><h2>Completed runs <small>Verified from vault state</small></h2>{completed.map((p) => { const result = pnl(finalEquity(p), p.principal); return <button className="position-row" key={p.id} onClick={() => go({ name: "position", id: p.id })}><span className={`asset-icon ${p.asset.toLowerCase()}`}>{p.asset === "BTC" ? "₿" : "Ξ"}</span><span><b>{p.asset} {p.up ? "↑" : "↓"}</b><small>Run complete · position #{p.id}</small></span><span><b>{money(finalEquity(p), decimals)} tUSDC</b><small className={result.pct >= 0 ? "positive" : "negative"}>{result.label} · {p.rolls} {p.rolls === 1 ? "roll" : "rolls"}</small></span><i>→</i></button>; })}</div>}</>}</>;
}

function CompletedProof({ position, decimals, onOpen }: { position: Position; decimals: number; onOpen: () => void }) {
  const final = position.history.at(-1)?.bankroll ?? position.principal;
  const result = pnl(final, position.principal);
  return <section className="completed-proof"><div><p className="overline">Latest verified run</p><h2>{position.asset} {position.up ? "↑" : "↓"} completed {position.rolls} rolls</h2><p>No strategy is active right now. This finished run remains fully readable from the deployed vault.</p></div><div className="proof-result"><strong>{money(final, decimals)} <small>tUSDC</small></strong><b className={result.pct >= 0 ? "positive" : "negative"}>{result.label}</b><button className="button secondary" onClick={onOpen}>Inspect run →</button></div></section>;
}

export function PositionScreen({ position, decimals, feed, onStop }: { position: Position; decimals: number; feed: RollerEvent[]; onStop?: () => void }) {
  const { back } = useNavigation();
  const exposed = BigInt(position.atRisk) > 0n;
  const equity = position.active ? BigInt(position.bankroll) + BigInt(position.atRisk) : BigInt(position.history.at(-1)?.bankroll ?? position.principal);
  const { label } = pnl(equity.toString(), position.principal);
  const [phase, setPhase] = useState<"active" | "settled" | "redeeming" | "rolling">("active");
  const previousRolls = useRef(position.rolls);
  useEffect(() => {
    if (position.rolls <= previousRolls.current) return;
    previousRolls.current = position.rolls;
    setPhase("settled");
    const a = setTimeout(() => setPhase("redeeming"), 800);
    const b = setTimeout(() => setPhase("rolling"), 1600);
    const c = setTimeout(() => setPhase("active"), 2600);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [position.rolls]);
  const positionFeed = feed.filter((e) => e.id === position.id);
  const stoppedByLosses = !position.active && position.policy.maxLosses > 0 && position.losses >= position.policy.maxLosses;
  const stoppedByRolls = !position.active && position.policy.maxRolls > 0 && position.rolls >= position.policy.maxRolls;
  const completionCopy = stoppedByLosses ? `The ${position.policy.maxLosses}-loss safety limit ended this run automatically.` : stoppedByRolls ? `The ${position.policy.maxRolls}-roll limit ended this run automatically.` : "This run is complete and its final balance has been returned or made available to its owner.";
  return <><button className="back-button" onClick={back}>← Portfolio</button><div className="position-layout"><section className="position-primary"><div className="position-title"><span className={`asset-icon ${position.asset.toLowerCase()}`}>{position.asset === "BTC" ? "₿" : "Ξ"}</span><div><p className="overline">Persistent position</p><h1>{position.asset} {position.up ? "↑" : "↓"}</h1></div><span className={`autoroll-badge ${position.active ? "" : "stopped"}`}>{position.active ? "↻ AutoRoll active" : "○ AutoRoll stopped"}</span></div><div className="equity-block"><span>{position.active ? "Strategy equity" : "Final balance"} <InfoTip /></span><strong>{money(equity.toString(), decimals)} <small>tUSDC</small></strong><b>{label} from starting balance</b></div><EquityCurve position={position} decimals={decimals} /><LiveRollover position={position} phase={phase} /><div className="position-stats"><span><small>Starting balance</small><b>{money(position.principal, decimals)}</b></span><span><small>Total rolls</small><b>{position.rolls}</b></span><span><small>Consecutive losses</small><b>{position.losses} / {position.policy.maxLosses || "∞"}</b></span></div></section><aside className="position-side"><section className="panel"><p className="overline">Automation</p><dl><div><dt>Driver</dt><dd>Keeper</dd></div><div><dt>Fallback</dt><dd>Permissionless</dd></div><div><dt>Current state</dt><dd>{position.active ? exposed ? "In active window" : "Waiting for successor" : "Run complete"}</dd></div><div><dt>Maximum entry</dt><dd>{position.policy.maxPrice.toFixed(2)}</dd></div></dl></section>{position.active ? <section className="panel stop-panel"><h3>{exposed ? "Stop after current window" : "Stop AutoRoll"}</h3><p>{exposed ? "Your current window will finish normally. AutoRoll will redeem it and will not enter the successor." : "Your managed balance is between windows and can be returned immediately."}</p>{onStop && <button className="button danger full" onClick={onStop}>{exposed ? "Stop after current window" : "Stop and redeem"}</button>}</section> : <section className="panel completion-panel"><p className="overline">Final state</p><h3>Policy enforced</h3><p>{completionCopy}</p></section>}</aside></div><section className="panel activity-panel"><div className="panel-heading"><h2>Roll history</h2><span>Latest {Math.min(positionFeed.length, 14)} of {position.rolls} on-chain rolls</span></div><Feed feed={positionFeed} decimals={decimals} numbered /></section></>;
}

function LiveRollover({ position, phase }: { position: Position; phase: string }) {
  const [seconds, setSeconds] = useState(60 - Math.floor(Date.now() / 1000 % 60));
  useEffect(() => { const t = setInterval(() => setSeconds(60 - Math.floor(Date.now() / 1000 % 60)), 1000); return () => clearInterval(t); }, []);
  const exposed = BigInt(position.atRisk) > 0n;
  if (!position.active) return <div className="live-roll completed"><div className="live-roll-head"><span><i className="status-dot" />Run complete</span><b>On-chain</b></div><div className="roll-sequence"><span className="complete">Opened ✓</span><i>→</i><span className="complete">{position.rolls} rolls ✓</span><i>→</i><span className="current">Stopped</span></div><p>The vault enforced the policy and will not enter another successor market.</p></div>;
  return <div className="live-roll"><div className="live-roll-head"><span><i className={`status-dot ${position.active ? "live" : ""}`} />{exposed ? "Current window" : "Successor search"}</span><b>{exposed ? `00:${String(seconds).padStart(2, "0")}` : "Funds protected"}</b></div>{phase === "active" ? <div className="roll-sequence"><span className="complete">Previous ✓</span><i>→</i><span className="current">{exposed ? "Active window ●" : "Waiting ◷"}</span><i>→</i><span>Successor</span><i>→</i><b>∞</b></div> : <div className="roll-transition"><span className={phase === "settled" ? "active" : "done"}>Settled ✓</span><i>→</i><span className={phase === "redeeming" ? "active" : phase === "rolling" ? "done" : ""}>Redeeming</span><i>→</i><span className={phase === "rolling" ? "active" : ""}>Rolling ↻</span></div>}<p>No new user signature is required when AutoRoll moves to the successor.</p></div>;
}

export function ActivityScreen({ feed, decimals }: { feed: RollerEvent[]; decimals: number }) { return <><PageTitle eyebrow="Vault history" title="Activity" detail="Entries, settlements, automatic rolls, and exits in plain language." /><section className="panel activity-panel">{feed.length ? <Feed feed={feed} decimals={decimals} /> : <EmptyState title="Nothing here yet" detail="Your AutoRoll activity will appear after you open a position." />}</section></>; }

export function StatusScreen({ connected }: { connected: boolean }) { return <div className="status-page"><PageTitle eyebrow="Live infrastructure" title="AutoRoll status" detail="The execution model shown here reflects the deployed showcase configuration." /><section className="status-overall"><i className={`status-dot ${connected ? "live" : ""}`} /><div><b>{connected ? "Operational" : "Connecting"}</b><span>Somnia Shannon testnet</span></div></section><div className="status-list"><StatusRow name="DreamDEX" value={connected ? "Connected" : "Checking"} good={connected} /><StatusRow name="Vault" value={VAULT ? "Deployed" : "Unavailable"} good={Boolean(VAULT)} /><StatusRow name="Roll execution" value="Keeper" good /><StatusRow name="Permissionless fallback" value="Available" good /><StatusRow name="Validator reactivity" value="Not active" /></div><p className="status-note">AutoRoll supports a native Somnia reactivity architecture. The current showcase deployment is intentionally reported as keeper-driven.</p></div>; }
function StatusRow({ name, value, good = false }: { name: string; value: string; good?: boolean }) { return <div><span>{name}</span><b><i className={`status-dot ${good ? "live" : ""}`} />{value}</b></div>; }
function InfoStrip() { return <div className="info-strip"><span>↻</span><div><b>One position across eligible windows</b><p>A missed price limit leaves funds in the vault. AutoRoll never creates a resting order.</p></div></div>; }
function InfoTip() { return <span className="info-tip" title="Idle vault balance plus capital currently committed to a live window. It is not a mark-to-market or an immediately redeemable quote.">i</span>; }
function PageTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) { return <div className="page-title"><p className="overline">{eyebrow}</p><h1>{title}</h1><p>{detail}</p></div>; }
function EmptyState({ title, detail, action, onClick }: { title: string; detail: string; action?: string; onClick?: () => void }) { return <div className="empty-state"><span>↻</span><h2>{title}</h2><p>{detail}</p>{action && <button className="button primary" onClick={onClick}>{action}</button>}</div>; }
function PortfolioSkeleton() { return <div className="skeleton-stack"><div /><div /><div /></div>; }
