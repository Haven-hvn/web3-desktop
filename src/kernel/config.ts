export interface AppMountConfig {
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
    "haven-bay": AppMountConfig;
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
  arkivApiKey: (import.meta.env.VITE_ARKIV_API_KEY as string | undefined) ?? "",
  icpHost: "https://icp-api.io",
  havenAolCanisterId: "3gzy3-kaaaa-aaaan-q6y6q-cai",
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
    "haven-media": { url: "https://haven-tunes.pinme.dev/" },
    "haven-bay": { url: "https://haven-bay.pinme.dev/" },
    fairhaven: { url: "https://fairhaven.pinme.dev/" },
    redhaven: { url: "https://redhaven.pinme.dev/" },
    feetonfire: { url: "https://feetonfire.pinme.dev/" },
  },
};

const LEGACY_LOCAL_MOUNT_URLS = new Set<string>([
  "/apps/haven-dapp/index.html",
  "/apps/haven-bay/index.html",
  "/apps/fairhaven/",
  "/apps/redhaven/",
  "/apps/feetonfire/index.html",
]);

const STORAGE_KEY = "haven-os:config:v1";

export function loadConfig(): HavenOsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<HavenOsConfig>;
    const mergedMounts: HavenOsConfig["appMounts"] = {
      "haven-media": { url: parsed.appMounts?.["haven-media"]?.url || DEFAULT_CONFIG.appMounts["haven-media"].url },
      "haven-bay": { url: parsed.appMounts?.["haven-bay"]?.url || DEFAULT_CONFIG.appMounts["haven-bay"].url },
      fairhaven: { url: parsed.appMounts?.fairhaven?.url || DEFAULT_CONFIG.appMounts.fairhaven.url },
      redhaven: { url: parsed.appMounts?.redhaven?.url || DEFAULT_CONFIG.appMounts.redhaven.url },
      feetonfire: { url: parsed.appMounts?.feetonfire?.url || DEFAULT_CONFIG.appMounts.feetonfire.url },
    };
    // Migrate stale local /apps/... mount URLs to canonical PinMe URLs on remote origins
    const isLocalOrigin =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (!isLocalOrigin) {
      for (const key of Object.keys(DEFAULT_CONFIG.appMounts) as Array<keyof HavenOsConfig["appMounts"]>) {
        if (LEGACY_LOCAL_MOUNT_URLS.has(mergedMounts[key].url)) {
          mergedMounts[key] = { ...mergedMounts[key], url: DEFAULT_CONFIG.appMounts[key].url };
        }
      }
    }
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      appMounts: mergedMounts,
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
