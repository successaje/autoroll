import type { EIP1193Provider } from "viem";
import { shannon, setProvider } from "./chain";

// A single persisted SDK session backs both connection and every viem write.
let clientPromise: ReturnType<typeof initialize> | undefined;
async function initialize() {
  const { createEVMClient } = await import("@metamask/connect-evm");
  const client = await createEVMClient({
    dapp: { name: "AutoRoll", url: location.origin, iconUrl: `${location.origin}/icon.png` },
    api: { supportedNetworks: { [`0x${shannon.id.toString(16)}`]: shannon.rpcUrls.default.http[0] } },
    analytics: { enabled: false },
  });
  setProvider(client.getProvider() as unknown as EIP1193Provider);
  return client;
}
export function getMetaMask() {
  return clientPromise ??= initialize().catch(error => { clientPromise = undefined; throw error; });
}
