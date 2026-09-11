import { createPublicClient, createWalletClient, custom, http, defineChain, type EIP1193Provider } from "viem";

/** Somnia Shannon testnet. The protocol core is CREATE3'd, so the vault's
 *  dependencies carry the same addresses on mainnet — only collateral differs. */
export const shannon = defineChain({
  id: 50312,
  name: "Somnia Shannon",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        (import.meta.env.VITE_RPC_URL as string | undefined) ??
          "https://api.infra.testnet.somnia.network/",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Shannon Explorer", url: "https://shannon-explorer.somnia.network" },
  },
  testnet: true,
});

export const VAULT = import.meta.env.VITE_VAULT_ADDRESS as `0x${string}` | undefined;
export const COLLATERAL = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as const; // TestUSDC, 6dp
export const COLLATERAL_DECIMALS = 6;

/** True when the app is wired to a deployed vault; otherwise it drives the
 *  off-chain roller instead, which is how the demo runs before deployment. */
export const onChainMode = Boolean(VAULT);

export const publicClient = createPublicClient({ chain: shannon, transport: http() });

let connectedProvider: EIP1193Provider | null = null;
export function setProvider(provider: EIP1193Provider) { connectedProvider = provider; }

export function getProvider(): EIP1193Provider | null {
  if (connectedProvider) return connectedProvider;
  const eth = (globalThis as any).ethereum;
  return eth ?? null;
}

export function walletClient(account: `0x${string}`) {
  const provider = getProvider();
  if (!provider) throw new Error("No wallet found");
  return createWalletClient({ account, chain: shannon, transport: custom(provider) });
}

/** Ask the wallet to move to Shannon, adding it if it isn't there yet. */
export async function ensureShannon(provider: EIP1193Provider): Promise<void> {
  const hexId = `0x${shannon.id.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err: any) {
    // 4902 = chain unknown to the wallet. Anything else is the user declining.
    if (err?.code !== 4902 && err?.data?.originalError?.code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: shannon.name,
          nativeCurrency: shannon.nativeCurrency,
          rpcUrls: [...shannon.rpcUrls.default.http],
          blockExplorerUrls: [shannon.blockExplorers.default.url],
        },
      ],
    });
  }
}
