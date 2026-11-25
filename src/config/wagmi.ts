import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { arbitrum, base, mainnet, optimism, sepolia } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";

// Get projectId from https://dashboard.reown.com (WalletConnect Cloud).
// Vite exposes it as VITE_WALLETCONNECT_PROJECT_ID; the Haven OS config
// (localStorage / ControlPanel) can override it. Empty means QR/modal off.
export function getProjectId(): string {
  const envId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) || "";
  const cfgId = (() => {
    try {
      const raw = localStorage.getItem("haven-os:config:v1");
      return raw ? (JSON.parse(raw).walletConnectProjectId as string | undefined) || "" : "";
    } catch {
      return "";
    }
  })();
  return cfgId || envId;
}

if (!getProjectId()) {
  console.warn("VITE_WALLETCONNECT_PROJECT_ID is not defined. WalletConnect QR will not work (injected wallets still work).");
}

export const networks = [mainnet, sepolia, base, optimism, arbitrum] as [
  AppKitNetwork,
  ...AppKitNetwork[],
];

export const wagmiAdapter = new WagmiAdapter({
  ssr: false,
  projectId: getProjectId(),
  networks,
});
