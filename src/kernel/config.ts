export type AppRuntimeMode = "native" | "iframe";

export interface AppMountConfig {
  mode: AppRuntimeMode;
  url: string;
}

export interface HavenOsConfig {
  arkivNetworkName: string;
  arkivRpcUrl: string;
  arkivApiKey: string;
  icpHost: string;
  havenAolCanisterId: string;
  havenAolVerifyingContract: string;
  havenAolFetchRootKey: boolean;
  eip712ChainId: number;
  ipfsGateway: string;
  synapseBaseUrl: string;
  synapseApiKey: string;
  walletConnectProjectId: string;
  maxArkivRecords: number;
  showDebugOverlay: boolean;
  skipBootScreen: boolean;
  clippyEnabled: boolean;
  clippyXmtpEnv: "production" | "dev";
  clippyRoomUrl: string;
  clippyAgentAddress: string;
  clippyGunRelays: string;
  appMounts: {
    "haven-media": AppMountConfig;
    fairhaven: AppMountConfig;
    redhaven: AppMountConfig;
    feetonfire: AppMountConfig;
  };
}

export const ARKIV_PRESETS = [
  {
    id: "rabdi",
    name: "Rabdi Testnet (Latest)",
    rpcUrl: "https://rpc.rabdi.db-chain.testnet.arkiv.network",
  },
  {
    id: "localhost",
    name: "Local arkiv-op-reth (1337)",
    rpcUrl: "http://127.0.0.1:8545",
  },
] as const;

export const DEFAULT_CONFIG: HavenOsConfig = {
  arkivNetworkName: "Rabdi",
  arkivRpcUrl: "https://rpc.rabdi.db-chain.testnet.arkiv.network",
  arkivApiKey: "",
  icpHost: "https://icp-api.io",
  havenAolCanisterId: "gny6k-fqaaa-aaaab-ag3ra-cai",
  havenAolVerifyingContract: "0x0000000000000000000000000000000000000000",
  havenAolFetchRootKey: false,
  eip712ChainId: 1,
  ipfsGateway: "https://w3s.link",
  synapseBaseUrl: "https://api.synapse.storage",
  synapseApiKey: "",
  walletConnectProjectId: "",
  maxArkivRecords: 200,
  showDebugOverlay: false,
  skipBootScreen: false,
  clippyEnabled: true,
  clippyXmtpEnv: "production",
  clippyRoomUrl: "https://shoutbox.pinme.dev/default",
  clippyAgentAddress: "0x90779a7582aafb91b9ad78e9f3a3cba88ed44042",
  clippyGunRelays: "http://localhost:8765/gun",
  appMounts: {
    "haven-media": { mode: "iframe", url: "/apps/haven-dapp/index.html" },
    fairhaven: { mode: "native", url: "/apps/fairhaven/" },
    redhaven: { mode: "native", url: "/apps/redhaven/" },
    feetonfire: { mode: "native", url: "/apps/feetonfire/index.html" },
  },
};

const STORAGE_KEY = "haven-os:config:v1";

export function loadConfig(): HavenOsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<HavenOsConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      appMounts: {
        ...DEFAULT_CONFIG.appMounts,
        ...(parsed.appMounts ?? {}),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: HavenOsConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}
