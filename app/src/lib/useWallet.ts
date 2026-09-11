import { useCallback, useEffect, useState } from "react";
import { getMetaMask } from "./metamask";
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

/** MetaMask Connect supports extension and mobile approval sessions. */
export function useWallet(): Wallet {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [provider, updateProvider] = useState(getProvider);
  const available = true;
  useEffect(() => {
    let mounted = true;
    void getMetaMask().then(() => { if (mounted) updateProvider(() => getProvider()); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

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
    void readChain().catch(() => {});

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
    setConnecting(true);
    setError(null);
    try {
      const client = await getMetaMask();
      const activeProvider = getProvider()!;
      updateProvider(() => activeProvider);
      const { accounts: accs } = await client.connect({ chainIds: [`0x${shannon.id.toString(16)}`] });
      setAccount(accs[0] ?? null);
      await ensureShannon(activeProvider);
      const id = (await activeProvider.request({ method: "eth_chainId" })) as string;
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
