import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  decryptEntityText,
  epochKeyringId,
  fetchAndDecryptEntityMedia,
  unlockGateEpochV3,
  type UnlockedEpochEntry,
} from "../kernel/aol";
import {
  clearArkivCache,
  fetchHavenUniverse,
  loadCachedEntities,
  probeArkiv,
  type ArkivProbeResult,
} from "../kernel/arkiv";
import { DEFAULT_CONFIG, loadConfig, saveConfig, type HavenOsConfig } from "../kernel/config";
import {
  connectEip1193Wallet,
  discoverInjectedWallets,
  inspectGateToken,
  type DiscoveredWallet,
  type Eip1193Provider,
} from "../kernel/evm";
import {
  buildGateDirectory,
  currentEpochNow,
  type GateDirectoryEntry,
  type GateTokenMetadata,
  type HavenEntity,
  type HavenGateRef,
} from "../kernel/protocol";
import { HavenOsBridgeHost } from "../kernel/osBridgeHost";

export interface WalletState {
  address: string | null;
  chainId: number | null;
  walletName: string | null;
  watchOnly: boolean;
  provider: Eip1193Provider | null;
}

export interface HavenKernelValue {
  config: HavenOsConfig;
  updateConfig: (patch: Partial<HavenOsConfig>) => void;
  resetConfig: () => void;

  arkivProbe: ArkivProbeResult | null;
  entities: HavenEntity[];
  gates: GateDirectoryEntry[];
  loadingUniverse: boolean;
  scanStatus: string;
  scanError: string | null;
  refreshUniverse: () => Promise<void>;
  clearLocalArkivCache: () => void;

  wallet: WalletState;
  discoveredWallets: DiscoveredWallet[];
  connectWallet: (w?: DiscoveredWallet) => Promise<void>;
  setWatchAddress: (address: string) => void;
  disconnectWallet: () => void;

  unlockedKeys: UnlockedEpochEntry[];
  unlockingGateKey: string | null;
  unlockError: string | null;
  unlockGate: (gate: HavenGateRef, epoch?: number) => Promise<UnlockedEpochEntry>;
  findUnlockedKey: (gate?: HavenGateRef, epoch?: number) => UnlockedEpochEntry | undefined;
  forgetAllKeys: () => void;

  decryptedTexts: Record<string, string>;
  decryptTextForEntity: (entity: HavenEntity) => Promise<string>;
  decryptMediaForEntity: (entity: HavenEntity) => Promise<{ blobUrl: string; mimeType: string; bytes: number }>;

  gateTokenMeta: Record<string, GateTokenMetadata>;
  checkingGates: boolean;
  inspectGate: (gate: HavenGateRef) => Promise<GateTokenMetadata>;
  getGateMeta: (gate?: HavenGateRef) => GateTokenMetadata | undefined;
  recheckGateMemberships: () => Promise<void>;

  votes: Record<string, -1 | 0 | 1>;
  castVote: (entityKey: string, dir: -1 | 0 | 1) => void;
}

const VOTES_STORAGE_KEY = "haven-os:redhaven-votes:v1";
const HavenKernelContext = createContext<HavenKernelValue | null>(null);

export function HavenKernelProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<HavenOsConfig>(() => loadConfig());
  const [arkivProbe, setArkivProbe] = useState<ArkivProbeResult | null>(null);
  const [entities, setEntities] = useState<HavenEntity[]>(() => loadCachedEntities(loadConfig().arkivRpcUrl));
  const [loadingUniverse, setLoadingUniverse] = useState(false);
  const [scanStatus, setScanStatus] = useState("Ready");
  const [scanError, setScanError] = useState<string | null>(null);

  const [discoveredWallets, setDiscoveredWallets] = useState<DiscoveredWallet[]>([]);
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    walletName: null,
    watchOnly: false,
    provider: null,
  });

  const [unlockedMap, setUnlockedMap] = useState<Record<string, UnlockedEpochEntry>>({});
  const [unlockingGateKey, setUnlockingGateKey] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [decryptedTexts, setDecryptedTexts] = useState<Record<string, string>>({});
  const [gateTokenMeta, setGateTokenMeta] = useState<Record<string, GateTokenMetadata>>({});
  const [checkingGates, setCheckingGates] = useState(false);
  const gateTokenMetaRef = useRef(gateTokenMeta);
  gateTokenMetaRef.current = gateTokenMeta;

  const [votes, setVotes] = useState<Record<string, -1 | 0 | 1>>(() => {
    try {
      const raw = localStorage.getItem(VOTES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, -1 | 0 | 1>) : {};
    } catch {
      return {};
    }
  });

  const configRef = useRef(config);
  configRef.current = config;

  // Discover EIP-6963 / injected wallets on boot
  useEffect(() => {
    return discoverInjectedWallets((w) => {
      setDiscoveredWallets((prev) => (prev.some((p) => p.id === w.id) ? prev : [...prev, w]));
    });
  }, []);

  const updateConfig = useCallback((patch: Partial<HavenOsConfig>) => {
    setConfig((prev) => {
      const next: HavenOsConfig = {
        ...prev,
        ...patch,
        appMounts: patch.appMounts ? { ...prev.appMounts, ...patch.appMounts } : prev.appMounts,
      };
      saveConfig(next);
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    saveConfig(DEFAULT_CONFIG);
    setConfig(DEFAULT_CONFIG);
  }, []);

  const refreshUniverse = useCallback(async () => {
    const cfg = configRef.current;
    setLoadingUniverse(true);
    setScanError(null);
    setScanStatus(`Probing ${cfg.arkivNetworkName}…`);
    try {
      const probe = await probeArkiv(cfg);
      setArkivProbe(probe);
      if (!probe.online) {
        setScanError(`Arkiv RPC unreachable: ${probe.error ?? "network error"}`);
        setScanStatus("Offline");
        return;
      }
      const list = await fetchHavenUniverse(cfg, (msg) => setScanStatus(msg));
      setEntities(list);
      setScanStatus(`${list.length} Haven entities indexed from ${cfg.arkivNetworkName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanError(msg);
      setScanStatus("Scan interrupted");
    } finally {
      setLoadingUniverse(false);
    }
  }, []);

  // Automatically probe & index Haven entities from Arkiv when RPC URL changes
  useEffect(() => {
    void refreshUniverse();
  }, [config.arkivRpcUrl, config.arkivApiKey, refreshUniverse]);

  const clearLocalArkivCache = useCallback(() => {
    clearArkivCache();
    setEntities([]);
    setScanStatus("Cache cleared");
  }, []);

  const connectWallet = useCallback(
    async (chosen?: DiscoveredWallet) => {
      const target = chosen ?? discoveredWallets[0];
      if (!target) {
        throw new Error(
          "No injected EVM wallet detected in this browser. Install MetaMask/Rabby or enter a Watch Address.",
        );
      }
      const { address, chainId } = await connectEip1193Wallet(target.provider);
      setWallet({
        address,
        chainId,
        walletName: target.name,
        watchOnly: false,
        provider: target.provider,
      });
    },
    [discoveredWallets],
  );

  const setWatchAddress = useCallback((address: string) => {
    const clean = address.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(clean)) {
      throw new Error("Enter a valid 0x EVM address (42 characters)");
    }
    setWallet({
      address: clean,
      chainId: 1,
      walletName: "Watch-Only Address",
      watchOnly: true,
      provider: null,
    });
  }, []);

  const disconnectWallet = useCallback(() => {
    setWallet({
      address: null,
      chainId: null,
      walletName: null,
      watchOnly: false,
      provider: null,
    });
  }, []);

  const findUnlockedKey = useCallback(
    (gate?: HavenGateRef, epoch?: number): UnlockedEpochEntry | undefined => {
      if (!gate) return undefined;
      const targetEpoch = epoch ?? gate.epoch ?? currentEpochNow();
      return (
        unlockedMap[epochKeyringId(gate, targetEpoch)] ??
        unlockedMap[epochKeyringId(gate, currentEpochNow())]
      );
    },
    [unlockedMap],
  );

  const unlockGate = useCallback(
    async (gate: HavenGateRef, epoch?: number): Promise<UnlockedEpochEntry> => {
      const existing = findUnlockedKey(gate, epoch);
      if (existing) return existing;
      if (!wallet.address || !wallet.provider || wallet.watchOnly) {
        throw new Error(
          "Connect a real EVM wallet (MetaMask, Rabby, etc.) to sign the gasless EIP-712 GateRequestV3.",
        );
      }
      const keyId = epochKeyringId(gate, epoch ?? gate.epoch ?? currentEpochNow());
      setUnlockingGateKey(keyId);
      setUnlockError(null);
      try {
        const entry = await unlockGateEpochV3({
          config: configRef.current,
          gate,
          epoch,
          provider: wallet.provider,
          evmAddress: wallet.address,
        });
        setUnlockedMap((prev) => ({ ...prev, [entry.cacheKey]: entry }));
        return entry;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setUnlockError(msg);
        throw err;
      } finally {
        setUnlockingGateKey(null);
      }
    },
    [findUnlockedKey, wallet],
  );

  const forgetAllKeys = useCallback(() => {
    setUnlockedMap({});
    setDecryptedTexts({});
    setUnlockError(null);
  }, []);

  const decryptTextForEntity = useCallback(
    async (entity: HavenEntity): Promise<string> => {
      if (entity.clearText) return entity.clearText;
      if (decryptedTexts[entity.key]) return decryptedTexts[entity.key];
      const gate = entity.gate;
      if (!gate) throw new Error("Entity has no gate metadata");
      let entry = findUnlockedKey(gate, gate.epoch);
      if (!entry) {
        entry = await unlockGate(gate, gate.epoch);
      }
      const text = await decryptEntityText(entity, entry.vetKey);
      setDecryptedTexts((prev) => ({ ...prev, [entity.key]: text }));
      return text;
    },
    [decryptedTexts, findUnlockedKey, unlockGate],
  );

  const decryptMediaForEntity = useCallback(
    async (entity: HavenEntity) => {
      if (entity.media?.fcid) {
        return fetchAndDecryptEntityMedia(configRef.current, entity);
      }
      const gate = entity.gate;
      if (!gate) throw new Error("Sealed media missing gate metadata");
      let entry = findUnlockedKey(gate, gate.epoch);
      if (!entry) {
        entry = await unlockGate(gate, gate.epoch);
      }
      return fetchAndDecryptEntityMedia(configRef.current, entity, entry.vetKey);
    },
    [findUnlockedKey, unlockGate],
  );

  const gateMetaId = useCallback(
    (gate: HavenGateRef, addr?: string | null) =>
      `${gate.chainId}:${gate.tokenAddress.toLowerCase()}:${gate.threshold}:${(addr ?? "anon").toLowerCase()}`,
    [],
  );

  const getGateMeta = useCallback(
    (gate?: HavenGateRef): GateTokenMetadata | undefined => {
      if (!gate) return undefined;
      return gateTokenMeta[gateMetaId(gate, wallet.address)];
    },
    [gateTokenMeta, gateMetaId, wallet.address],
  );

  const inspectGate = useCallback(
    async (gate: HavenGateRef, force = false): Promise<GateTokenMetadata> => {
      const id = gateMetaId(gate, wallet.address);
      const cached = gateTokenMetaRef.current[id];
      if (!force && cached && Date.now() - cached.fetchedAt < 60_000) return cached;
      const meta = await inspectGateToken(
        gate.chainId,
        gate.tokenAddress,
        gate.threshold,
        wallet.address ?? undefined,
      );
      setGateTokenMeta((prev) => ({ ...prev, [id]: meta }));
      return meta;
    },
    [gateMetaId, wallet.address],
  );

  const castVote = useCallback((entityKey: string, dir: -1 | 0 | 1) => {
    setVotes((prev) => {
      const next = { ...prev, [entityKey]: prev[entityKey] === dir ? 0 : dir };
      try {
        localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const gates = useMemo(() => buildGateDirectory(entities), [entities]);
  const unlockedKeys = useMemo(() => Object.values(unlockedMap), [unlockedMap]);

  const recheckGateMemberships = useCallback(async () => {
    const gated = gates.filter((g) => g.gate && !g.isPublic);
    if (gated.length === 0) return;
    setCheckingGates(true);
    try {
      await Promise.allSettled(gated.map((g) => inspectGate(g.gate!, true)));
    } finally {
      setCheckingGates(false);
    }
  }, [gates, inspectGate]);

  // Automatically resolve token metadata & connected/watch wallet DAO membership for every discovered gate
  useEffect(() => {
    const gated = gates.filter((g) => g.gate && !g.isPublic);
    if (gated.length === 0) return;
    let cancelled = false;
    setCheckingGates(true);
    Promise.allSettled(gated.map((g) => inspectGate(g.gate!))).finally(() => {
      if (!cancelled) setCheckingGates(false);
    });
    return () => {
      cancelled = true;
    };
  }, [gates, wallet.address, inspectGate]);

  const value = useMemo<HavenKernelValue>(
    () => ({
      config,
      updateConfig,
      resetConfig,
      arkivProbe,
      entities,
      gates,
      loadingUniverse,
      scanStatus,
      scanError,
      refreshUniverse,
      clearLocalArkivCache,
      wallet,
      discoveredWallets,
      connectWallet,
      setWatchAddress,
      disconnectWallet,
      unlockedKeys,
      unlockingGateKey,
      unlockError,
      unlockGate,
      findUnlockedKey,
      forgetAllKeys,
      decryptedTexts,
      decryptTextForEntity,
      decryptMediaForEntity,
      gateTokenMeta,
      checkingGates,
      inspectGate,
      getGateMeta,
      recheckGateMemberships,
      votes,
      castVote,
    }),
    [
      config,
      updateConfig,
      resetConfig,
      arkivProbe,
      entities,
      gates,
      loadingUniverse,
      scanStatus,
      scanError,
      refreshUniverse,
      clearLocalArkivCache,
      wallet,
      discoveredWallets,
      connectWallet,
      setWatchAddress,
      disconnectWallet,
      unlockedKeys,
      unlockingGateKey,
      unlockError,
      unlockGate,
      findUnlockedKey,
      forgetAllKeys,
      decryptedTexts,
      decryptTextForEntity,
      decryptMediaForEntity,
      gateTokenMeta,
      checkingGates,
      inspectGate,
      getGateMeta,
      recheckGateMemberships,
      votes,
      castVote,
    ],
  );

  // Cross-site Haven OS Bridge Host (haven-os:v1) for embedded & *.pinme.dev iframes
  const bridgeHostRef = useRef<HavenOsBridgeHost | null>(null);
  const latestBridgeStateRef = useRef({
    wallet,
    config,
    unlockedKeys,
    connectWallet,
    unlockGate,
  });
  latestBridgeStateRef.current = {
    wallet,
    config,
    unlockedKeys,
    connectWallet,
    unlockGate,
  };

  useEffect(() => {
    const host = new HavenOsBridgeHost({
      getWallet: () => latestBridgeStateRef.current.wallet,
      connectWallet: () => latestBridgeStateRef.current.connectWallet(),
      getConfig: () => latestBridgeStateRef.current.config,
      getUnlockedKeys: () => latestBridgeStateRef.current.unlockedKeys,
      unlockGate: (gate, epoch) => latestBridgeStateRef.current.unlockGate(gate, epoch),
    });
    host.start();
    bridgeHostRef.current = host;
    return () => {
      host.stop();
      bridgeHostRef.current = null;
    };
  }, []);

  useEffect(() => {
    bridgeHostRef.current?.broadcast("accountsChanged", wallet.address ? [wallet.address] : []);
  }, [wallet.address]);

  useEffect(() => {
    if (wallet.chainId != null) {
      bridgeHostRef.current?.broadcast("chainChanged", `0x${wallet.chainId.toString(16)}`);
    }
  }, [wallet.chainId]);

  useEffect(() => {
    bridgeHostRef.current?.broadcast("configChanged", {
      arkivNetworkName: config.arkivNetworkName,
      arkivRpcUrl: config.arkivRpcUrl,
      ipfsGateway: config.ipfsGateway,
      havenAolCanisterId: config.havenAolCanisterId,
      icpHost: config.icpHost,
    });
  }, [
    config.arkivNetworkName,
    config.arkivRpcUrl,
    config.ipfsGateway,
    config.havenAolCanisterId,
    config.icpHost,
  ]);

  useEffect(() => {
    bridgeHostRef.current?.broadcast(
      "keyringChanged",
      unlockedKeys.map((k) => k.gateKey),
    );
  }, [unlockedKeys]);

  return <HavenKernelContext.Provider value={value}>{children}</HavenKernelContext.Provider>;
}

export function useHavenKernel(): HavenKernelValue {
  const ctx = useContext(HavenKernelContext);
  if (!ctx) throw new Error("useHavenKernel must be used within HavenKernelProvider");
  return ctx;
}
