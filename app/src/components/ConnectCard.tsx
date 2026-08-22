import type { Wallet } from "../lib/useWallet";
import { shannon } from "../lib/chain";

export function ConnectCard({ wallet }: { wallet: Wallet }) {
  if (!wallet.available) {
    return (
      <section className="card stack">
        <div>
          <h2>Connect a wallet</h2>
          <p className="sub">
            No injected wallet found. Install MetaMask (or any EIP-1193 wallet) and reload — the app
            will add {shannon.name} for you.
          </p>
        </div>
      </section>
    );
  }

  if (!wallet.account) {
    return (
      <section className="card stack">
        <div>
          <h2>Connect a wallet</h2>
          <p className="sub">
            One signature opens the position. Every roll after that happens without you.
          </p>
        </div>
        {wallet.error && <p className="sub" style={{ color: "var(--critical)" }}>{wallet.error}</p>}
        <button className="cta" onClick={wallet.connect} disabled={wallet.connecting}>
          {wallet.connecting ? "Check your wallet…" : "Connect wallet"}
        </button>
      </section>
    );
  }

  return (
    <section className="card stack">
      <div>
        <h2>Wrong network</h2>
        <p className="sub">
          AutoRoll runs on {shannon.name} (chain {shannon.id}). Switch and you're in.
        </p>
      </div>
      <button className="cta" onClick={wallet.connect}>
        Switch to {shannon.name}
      </button>
    </section>
  );
}
