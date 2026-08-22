import { useCallback, useEffect, useState } from "react";
import { ensureShannon, getProvider, shannon } from "./chain";

export interface Wallet {
  account: `0x${string}` | null;
  chainId: number | null;
  available: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  onRightChain: boolean;
}

/**
 *  A deliberately small EIP-1193 binding — no connector library, no modal.
 *  The product's whole claim is that the user signs once and then walks away,
 *  so the wallet surface should be the least interesting part of the app.
 */
export function useWallet(): Wallet {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = getProvider();
  const available = Boolean(provider);

  useEffect(() => {
    if (!provider) return;

    const readChain = async () => {
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(id, 16));
    };

    // Reconnect silently if the wallet already authorised this origin, so a
    // reload never costs the user a click.
    provider
      .request({ method: "eth_accounts" })
      .then((accs) => {
        const list = accs as `0x${string}`[];
        if (list.length > 0) setAccount(list[0]);
      })
      .catch(() => {});
    void readChain();

    const onAccounts = (accs: unknown) => setAccount((accs as `0x${string}`[])[0] ?? null);
    const onChain = (id: unknown) => setChainId(Number.parseInt(id as string, 16));
    (provider as any).on?.("accountsChanged", onAccounts);
    (provider as any).on?.("chainChanged", onChain);
    return () => {
      (provider as any).removeListener?.("accountsChanged", onAccounts);
      (provider as any).removeListener?.("chainChanged", onChain);
    };
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) return;
    setConnecting(true);
    setError(null);
    try {
      const accs = (await provider.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
      setAccount(accs[0] ?? null);
      await ensureShannon(provider);
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(id, 16));
    } catch (err: any) {
      // 4001 is the user closing the prompt — not worth an error banner.
      setError(err?.code === 4001 ? null : (err?.shortMessage ?? err?.message ?? "Connection failed"));
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  return {
    account,
    chainId,
    available,
    connecting,
    error,
    connect,
    onRightChain: chainId === shannon.id,
  };
}
