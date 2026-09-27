import { createPublicClient, createWalletClient, custom, fallback, http, defineChain, type EIP1193Provider } from "viem";

const configuredRpc = import.meta.env.VITE_RPC_URL as string | undefined;
export const SHANNON_RPCS = [
  configuredRpc,
  "https://dream-rpc.somnia.network/",
  "https://api.infra.testnet.somnia.network/",
].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);

/** Somnia Shannon testnet. The protocol core is CREATE3'd, so the vault's
 *  dependencies carry the same addresses on mainnet — only collateral differs. */
export const shannon = defineChain({
  id: 50312,
  name: "Somnia Shannon",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: {
      http: SHANNON_RPCS,
    },
  },
  blockExplorers: {
    default: { name: "Shannon Explorer", url: "https://shannon-explorer.somnia.network" },
  },
  testnet: true,
});

export const VAULT = import.meta.env.VITE_VAULT_ADDRESS as `0x${string}` | undefined;
/** Public testnet address whose AutoRoll history is safe to show without a
 * wallet. This is presentation state, never an authority or signing key. */
export const DEMO_ADDRESS = import.meta.env.VITE_DEMO_ADDRESS as `0x${string}` | undefined;
export const COLLATERAL = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as const; // TestUSDC, 6dp
export const COLLATERAL_DECIMALS = 6;

/** True when the app is wired to a deployed vault; otherwise it drives the
 *  off-chain roller instead, which is how the demo runs before deployment. */
export const onChainMode = Boolean(VAULT);

/** Reads fail over between Somnia's two public Shannon endpoints. A five-minute
 * demo should not disappear because one public RPC has a bad minute. */
export const publicClient = createPublicClient({
  chain: shannon,
  transport: fallback(SHANNON_RPCS.map((url) => http(url, { timeout: 8_000 })), {
    rank: false,
    retryCount: 1,
  }),
});

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
    const code = Number(err?.code ?? err?.data?.originalError?.code ?? err?.cause?.code);
    if (code !== 4902) throw err;
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
    // Most wallets switch automatically after adding, but EIP-3085 does not
    // require it. Make the resulting network deterministic.
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  }
}
