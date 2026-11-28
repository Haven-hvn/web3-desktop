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
  epochKeyringId,
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
import { inspectGateToken, type DiscoveredWallet, type Eip1193Provider } from "../kernel/evm";
import {
  clearMediaCache,
  DEFAULT_MEDIA_CACHE_MAX_BYTES,
  getMediaCacheStats,
  type MediaCacheStats,
} from "../kernel/mediaCache";
import { useAccount, useDisconnect } from "wagmi";
import { modal } from "../lib/reown";
import {
  buildGateDirectory,
  currentEpochNow,
  type GateDirectoryEntry,
  type GateTokenMetadata,
  type HavenEntity,
  type HavenGateRef,
} from "../kernel/protocol";
import { HavenOsBridgeHost, type TransferReport } from "../kernel/osBridgeHost";

export interface ActiveTransfer extends TransferReport {
  startedAt: number;
  updatedAt: number;
  rateBytesPerSec?: number;
}

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
  refreshUniverse: () => Promise<HavenEntity[]>;
  clearLocalArkivCache: () => void;

  mediaCacheStats: MediaCacheStats;
  refreshMediaCacheStats: () => Promise<void>;
  clearLocalMediaCache: () => Promise<void>;

  transfers: ActiveTransfer[];
  reportTransfer: (report: TransferReport) => void;
  dismissTransfer: (id: string) => void;
  clearAllTransfers: () => void;

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

  gateTokenMeta: Record<string, GateTokenMetadata>;
  checkingGates: boolean;
  inspectGate: (gate: HavenGateRef) => Promise<GateTokenMetadata>;
  getGateMeta: (gate?: HavenGateRef) => GateTokenMetadata | undefined;
  recheckGateMemberships: () => Promise<void>;
}

const HavenKernelContext = createContext<HavenKernelValue | null>(null);

export function HavenKernelProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<HavenOsConfig>(() => loadConfig());
  const [arkivProbe, setArkivProbe] = useState<ArkivProbeResult | null>(null);
  const [entities, setEntities] = useState<HavenEntity[]>(() => loadCachedEntities(loadConfig().arkivRpcUrl));
  const [loadingUniverse, setLoadingUniverse] = useState(false);
  const [scanStatus, setScanStatus] = useState("Ready");
  const [scanError, setScanError] = useState<string | null>(null);

  const [mediaCacheStats, setMediaCacheStats] = useState<MediaCacheStats>({
    count: 0,
    totalBytes: 0,
    maxBytes: DEFAULT_MEDIA_CACHE_MAX_BYTES,
  });
  const [transfers, setTransfers] = useState<ActiveTransfer[]>([]);
  const transferTimersRef = useRef<Map<string, number>>(new Map());

  const { address: wagmiAddress, chainId: wagmiChainId, isConnected: wagmiConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    walletName: null,
    watchOnly: false,
    provider: null,
  });
  // Reown is the single wallet source; keep the shape for bridge/consumers.
  const discoveredWallets: DiscoveredWallet[] = [];

  const [unlockedMap, setUnlockedMap] = useState<Record<string, UnlockedEpochEntry>>({});
  const [unlockingGateKey, setUnlockingGateKey] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [gateTokenMeta, setGateTokenMeta] = useState<Record<string, GateTokenMetadata>>({});
  const [checkingGates, setCheckingGates] = useState(false);
  const gateTokenMetaRef = useRef(gateTokenMeta);
  gateTokenMetaRef.current = gateTokenMeta;

  const configRef = useRef(config);
  configRef.current = config;

  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  const refreshMediaCacheStats = useCallback(async () => {
    const stats = await getMediaCacheStats();
    setMediaCacheStats(stats);
  }, []);

  const clearLocalMediaCache = useCallback(async () => {
    await clearMediaCache();
    await refreshMediaCacheStats();
  }, [refreshMediaCacheStats]);

  const dismissTransfer = useCallback((id: string) => {
    const existingTimer = transferTimersRef.current.get(id);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      transferTimersRef.current.delete(id);
    }
    setTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllTransfers = useCallback(() => {
    for (const timer of transferTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    transferTimersRef.current.clear();
    setTransfers([]);
  }, []);

  const reportTransfer = useCallback(
    (report: TransferReport) => {
      const now = Date.now();
      const existingTimer = transferTimersRef.current.get(report.id);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
        transferTimersRef.current.delete(report.id);
      }

      if (report.status === "cancelled" && !report.label) {
        setTransfers((prev) => prev.filter((t) => t.id !== report.id));
        return;
      }

      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.id === report.id);
        const prevEntry = idx >= 0 ? prev[idx] : undefined;
        const startedAt = prevEntry?.startedAt ?? now;
        const elapsedSec = Math.max(0.15, (now - startedAt) / 1000);
        const loaded = report.loaded ?? prevEntry?.loaded;
        const total = report.total ?? prevEntry?.total;
        const rateBytesPerSec =
          typeof loaded === "number" && loaded > 0 ? Math.round(loaded / elapsedSec) : prevEntry?.rateBytesPerSec;

        const nextEntry: ActiveTransfer = {
          ...prevEntry,
          ...report,
          label: report.label || prevEntry?.label || "Haven file",
          loaded,
          total,
          startedAt,
          updatedAt: now,
          rateBytesPerSec,
        };

        if (idx >= 0) {
          const copy = prev.slice();
          copy[idx] = nextEntry;
          return copy;
        }
        return [...prev, nextEntry];
      });

      if (report.status === "done" || report.status === "cancelled") {
        const delayMs = report.status === "done" ? 2200 : 1000;
        const timer = window.setTimeout(() => {
          transferTimersRef.current.delete(report.id);
          setTransfers((prev) => prev.filter((t) => t.id !== report.id));
        }, delayMs);
        transferTimersRef.current.set(report.id, timer);
      } else if (report.status === "error") {
        const timer = window.setTimeout(() => {
          transferTimersRef.current.delete(report.id);
          setTransfers((prev) => prev.filter((t) => t.id !== report.id));
        }, 6000);
        transferTimersRef.current.set(report.id, timer);
      }
    },
    [],
  );

  useEffect(() => {
    const timers = transferTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    void refreshMediaCacheStats();
  }, [refreshMediaCacheStats]);

  // Sync wagmi/Reown account into wallet state (single source; watch-only wins).
  useEffect(() => {
    let cancelled = false;
    if (wagmiConnected && wagmiAddress && connector) {
      connector
        .getProvider()
        .then((provider) => {
          if (cancelled) return;
          setWallet((prev) =>
            prev.watchOnly
              ? prev
              : {
                  address: wagmiAddress,
                  chainId: wagmiChainId ?? 1,
                  walletName: connector.name ?? "WalletConnect",
                  watchOnly: false,
                  provider: provider as unknown as Eip1193Provider,
                },
          );
        })
        .catch(() => undefined);
    } else if (!wagmiConnected) {
      setWallet((prev) => (prev.watchOnly ? prev : { address: null, chainId: null, walletName: null, watchOnly: false, provider: null }));
    }
    return () => {
      cancelled = true;
    };
  }, [wagmiConnected, wagmiAddress, wagmiChainId, connector]);

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

  const refreshUniverse = useCallback(async (): Promise<HavenEntity[]> => {
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
        return entitiesRef.current;
      }
      const list = await fetchHavenUniverse(cfg, (msg) => setScanStatus(msg));
      setEntities(list);
      setScanStatus(`${list.length} Haven entities indexed from ${cfg.arkivNetworkName}`);
      return list;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanError(msg);
      setScanStatus("Scan interrupted");
      return entitiesRef.current;
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

  const connectWallet = useCallback(async () => {
    if (!modal) throw new Error("WalletConnect is not configured (set VITE_WALLETCONNECT_PROJECT_ID).");
    await modal.open();
  }, []);

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
    disconnect();
  }, [disconnect]);

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
    setUnlockError(null);
  }, []);

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
      mediaCacheStats,
      refreshMediaCacheStats,
      clearLocalMediaCache,
      transfers,
      reportTransfer,
      dismissTransfer,
      clearAllTransfers,
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
      gateTokenMeta,
      checkingGates,
      inspectGate,
      getGateMeta,
      recheckGateMemberships,
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
      mediaCacheStats,
      refreshMediaCacheStats,
      clearLocalMediaCache,
      transfers,
      reportTransfer,
      dismissTransfer,
      clearAllTransfers,
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
      gateTokenMeta,
      checkingGates,
      inspectGate,
      getGateMeta,
      recheckGateMemberships,
    ],
  );

  // Cross-site Haven OS Bridge Host (haven-os:v1) for embedded & *.pinme.dev iframes
  const bridgeHostRef = useRef<HavenOsBridgeHost | null>(null);
  const latestBridgeStateRef = useRef({
    wallet,
    config,
    unlockedKeys,
    entities,
    connectWallet,
    unlockGate,
    refreshUniverse,
    refreshMediaCacheStats,
    reportTransfer,
  });
  latestBridgeStateRef.current = {
    wallet,
    config,
    unlockedKeys,
    entities,
    connectWallet,
    unlockGate,
    refreshUniverse,
    refreshMediaCacheStats,
    reportTransfer,
  };

  useEffect(() => {
    const host = new HavenOsBridgeHost({
      getWallet: () => latestBridgeStateRef.current.wallet,
      connectWallet: () => latestBridgeStateRef.current.connectWallet(),
      getConfig: () => latestBridgeStateRef.current.config,
      getUnlockedKeys: () => latestBridgeStateRef.current.unlockedKeys,
      unlockGate: (gate, epoch) => latestBridgeStateRef.current.unlockGate(gate, epoch),
      getEntities: () => latestBridgeStateRef.current.entities,
      refreshEntities: () => latestBridgeStateRef.current.refreshUniverse(),
      onMediaCacheChanged: () => void latestBridgeStateRef.current.refreshMediaCacheStats(),
      onTransferReport: (report) => latestBridgeStateRef.current.reportTransfer(report),
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
      unlockedKeys.map((k) => ({
        gateKey: k.gateKey,
        cacheKey: k.cacheKey,
        chainVariant: k.chainVariant,
        tokenAddress: k.tokenAddress,
        threshold: k.threshold,
        epoch: k.epoch,
      })),
    );
  }, [unlockedKeys]);

  useEffect(() => {
    bridgeHostRef.current?.broadcast(
      "keyringChanged",
      unlockedKeys.map((k) => k.gateKey),
    );
  }, [unlockedKeys]);

  useEffect(() => {
    bridgeHostRef.current?.broadcast("entitiesChanged", entities);
  }, [entities]);

  return <HavenKernelContext.Provider value={value}>{children}</HavenKernelContext.Provider>;
}

export function useHavenKernel(): HavenKernelValue {
  const ctx = useContext(HavenKernelContext);
  if (!ctx) throw new Error("useHavenKernel must be used within HavenKernelProvider");
  return ctx;
}
