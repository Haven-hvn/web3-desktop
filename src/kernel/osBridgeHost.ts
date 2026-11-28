import type { UnlockedEpochEntry } from "./aol";
import type { HavenOsConfig } from "./config";
import type { Eip1193Provider } from "./evm";
import {
  deleteCachedMedia,
  getCachedMedia,
  getMediaCacheStats,
  hasCachedMedia,
  putCachedMedia,
  type MediaCachePutInput,
} from "./mediaCache";
import { CHAINS, makeGateKey, type HavenEntity, type HavenGateRef } from "./protocol";

export const HAVEN_OS_BRIDGE_CHANNEL = "haven-os:v1" as const;

export type TransferDirection = "upload" | "download";
export type TransferStatus = "active" | "done" | "error" | "cancelled";

export interface TransferReport {
  id: string;
  direction: TransferDirection;
  label: string;
  from?: string;
  to?: string;
  loaded?: number;
  total?: number;
  status: TransferStatus;
  detail?: string;
  appId?: string;
}

const DEFAULT_ALLOWED_ORIGINS = new Set<string>([
  "https://haven-os.pinme.dev",
  "https://haven.pinme.dev",
  "https://haven-tunes.pinme.dev",
  "https://haven-bay.pinme.dev",
  "https://fairhaven.pinme.dev",
  "https://redhaven.pinme.dev",
  "https://feetonfire.pinme.dev",
]);

const VARIANT_TO_CHAIN_ID: Record<string, number> = {
  EthMainnet: 1,
  OptimismMainnet: 10,
  BaseMainnet: 8453,
  ArbitrumOne: 42161,
  EthSepolia: 11155111,
};

export function isAllowedBridgeOrigin(origin: string): boolean {
  if (!origin || origin === "null") return false;
  if (typeof window !== "undefined" && origin === window.location.origin) return true;
  if (DEFAULT_ALLOWED_ORIGINS.has(origin)) return true;
  // Allow localhost / 127.0.0.1 cross-port development & testing
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.protocol === "https:" && u.hostname.endsWith(".pinme.dev")) return true;
  } catch {
    return false;
  }
  return false;
}

export interface HostBridgeDeps {
  getWallet: () => {
    address: string | null;
    chainId: number | null;
    walletName: string | null;
    watchOnly: boolean;
    provider: Eip1193Provider | null;
  };
  connectWallet: () => Promise<void>;
  getConfig: () => HavenOsConfig;
  getUnlockedKeys: () => UnlockedEpochEntry[];
  unlockGate: (gate: HavenGateRef, epoch?: number) => Promise<UnlockedEpochEntry>;
  getEntities: () => HavenEntity[];
  refreshEntities: () => Promise<HavenEntity[]>;
  onMediaCacheChanged?: () => void;
  onTransferReport?: (report: TransferReport) => void;
}

interface RegisteredClient {
  win: Window;
  origin: string;
  appId?: string;
}

interface DispatchOutcome {
  result: unknown;
  transfer?: Transferable[];
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function exportConfig(cfg: HavenOsConfig) {
  return {
    arkivNetworkName: cfg.arkivNetworkName,
    arkivRpcUrl: cfg.arkivRpcUrl,
    ipfsGateway: cfg.ipfsGateway,
    havenAolCanisterId: cfg.havenAolCanisterId,
    icpHost: cfg.icpHost,
    filecoinChainId: cfg.filecoinChainId,
    synapseEnableCdn: cfg.synapseEnableCdn,
  };
}

export class HavenOsBridgeHost {
  private clients = new Map<Window, RegisteredClient>();
  private deps: HostBridgeDeps;
  private boundHandler: (ev: MessageEvent) => void;

  constructor(deps: HostBridgeDeps) {
    this.deps = deps;
    this.boundHandler = (ev) => void this.handleMessage(ev);
  }

  start(): void {
    window.addEventListener("message", this.boundHandler);
  }

  stop(): void {
    window.removeEventListener("message", this.boundHandler);
    this.clients.clear();
  }

  broadcast(
    event:
      | "accountsChanged"
      | "chainChanged"
      | "configChanged"
      | "keyringChanged"
      | "entitiesChanged",
    data: unknown,
  ): void {
    for (const [win, client] of Array.from(this.clients.entries())) {
      if (win.closed) {
        this.clients.delete(win);
        continue;
      }
      try {
        win.postMessage(
          {
            channel: HAVEN_OS_BRIDGE_CHANNEL,
            kind: "event",
            event,
            data,
          },
          client.origin,
        );
      } catch {
        this.clients.delete(win);
      }
    }
  }

  private reply(
    target: Window,
    origin: string,
    id: string,
    result?: unknown,
    error?: { code: number; message: string },
    transfer?: Transferable[],
  ): void {
    const payload = {
      channel: HAVEN_OS_BRIDGE_CHANNEL,
      kind: "response",
      id,
      ...(error ? { error } : { result }),
    };
    if (transfer && transfer.length > 0) {
      target.postMessage(payload, origin, transfer);
    } else {
      target.postMessage(payload, origin);
    }
  }

  private async handleMessage(ev: MessageEvent): Promise<void> {
    if (!ev.source || ev.source === window) return;
    if (!isAllowedBridgeOrigin(ev.origin)) return;

    const msg = ev.data as
      | { channel?: string; kind?: string; id?: string; method?: string; params?: unknown; appId?: string }
      | null;
    if (!msg || msg.channel !== HAVEN_OS_BRIDGE_CHANNEL) return;

    const target = ev.source as Window;
    const origin = ev.origin;

    if (msg.kind === "hello") {
      this.clients.set(target, { win: target, origin, appId: msg.appId });
      const w = this.deps.getWallet();
      target.postMessage(
        {
          channel: HAVEN_OS_BRIDGE_CHANNEL,
          kind: "welcome",
          payload: {
            wallet: {
              address: w.address,
              chainId: w.chainId,
              walletName: w.walletName,
              watchOnly: w.watchOnly,
            },
            config: exportConfig(this.deps.getConfig()),
            unlockedGates: this.deps.getUnlockedKeys().map((k) => k.gateKey),
            entityCount: this.deps.getEntities().length,
            capabilities: ["arkiv-cache", "media-cache", "transfer-dialog"],
          },
        },
        origin,
      );
      return;
    }

    if (msg.kind !== "request" || !msg.id || !msg.method) return;

    const senderAppId = this.clients.get(target)?.appId;
    try {
      const outcome = await this.dispatch(msg.method, msg.params, senderAppId);
      this.reply(target, origin, msg.id, outcome.result, undefined, outcome.transfer);
    } catch (err) {
      const code = (err as { code?: number })?.code ?? -32000;
      const message = err instanceof Error ? err.message : String(err);
      this.reply(target, origin, msg.id, undefined, { code, message });
    }
  }

  private async dispatch(
    method: string,
    params: unknown,
    senderAppId?: string,
  ): Promise<DispatchOutcome> {
    const w = this.deps.getWallet();

    if (method === "haven_getConfig") {
      return { result: exportConfig(this.deps.getConfig()) };
    }

    // Shared Arkiv entity cache (synced across all embedded apps + Gate Explorer)
    if (method === "haven_getEntities") {
      const p = (params ?? {}) as {
        grpPrefix?: string;
        gateKey?: string;
        refresh?: boolean;
      };
      let list = p.refresh ? await this.deps.refreshEntities() : this.deps.getEntities();
      if (p.grpPrefix) {
        list = list.filter((e) => e.grp.startsWith(p.grpPrefix!));
      }
      if (p.gateKey) {
        list = list.filter((e) => e.gateKey === p.gateKey);
      }
      return { result: list };
    }

    // Shared IndexedDB playback / media cache (zero-copy ArrayBuffer transfer on get)
    if (method === "haven_mediaCacheGet") {
      const p = (params ?? {}) as { key?: string };
      if (!p.key || typeof p.key !== "string") {
        throw new Error("haven_mediaCacheGet requires a string key");
      }
      const record = await getCachedMedia(p.key);
      if (!record) return { result: null };
      return {
        result: {
          key: record.key,
          bytes: record.bytes,
          mimeType: record.mimeType,
          size: record.size,
          encrypted: record.encrypted,
          createdAt: record.createdAt,
          lastAccessedAt: record.lastAccessedAt,
          meta: record.meta,
        },
        transfer: [record.bytes],
      };
    }

    if (method === "haven_mediaCacheHas") {
      const p = (params ?? {}) as { key?: string };
      if (!p.key || typeof p.key !== "string") {
        throw new Error("haven_mediaCacheHas requires a string key");
      }
      return { result: await hasCachedMedia(p.key) };
    }

    if (method === "haven_mediaCachePut") {
      const p = (params ?? {}) as Partial<MediaCachePutInput>;
      if (!p.key || typeof p.key !== "string" || !p.bytes) {
        throw new Error("haven_mediaCachePut requires { key, bytes }");
      }
      const res = await putCachedMedia({
        key: p.key,
        bytes: p.bytes,
        mimeType: p.mimeType,
        encrypted: p.encrypted,
        meta: p.meta,
      });
      if (res.stored) {
        this.deps.onMediaCacheChanged?.();
      }
      return { result: res };
    }

    if (method === "haven_mediaCacheDelete") {
      const p = (params ?? {}) as { key?: string };
      if (!p.key || typeof p.key !== "string") {
        throw new Error("haven_mediaCacheDelete requires a string key");
      }
      await deleteCachedMedia(p.key);
      this.deps.onMediaCacheChanged?.();
      return { result: { deleted: true } };
    }

    if (method === "haven_mediaCacheStats") {
      return { result: await getMediaCacheStats() };
    }

    // Classic Win98 file transfer dialog reporting (uploads & downloads from iframe apps)
    if (method === "haven_reportTransfer") {
      const p = (params ?? {}) as Partial<TransferReport>;
      if (!p.id || typeof p.id !== "string") {
        throw new Error("haven_reportTransfer requires a string id");
      }
      const direction: TransferDirection = p.direction === "upload" ? "upload" : "download";
      const status: TransferStatus =
        p.status === "done" || p.status === "error" || p.status === "cancelled"
          ? p.status
          : "active";
      const report: TransferReport = {
        id: p.id,
        direction,
        label: typeof p.label === "string" && p.label.trim() ? p.label.trim() : "Haven file",
        ...(typeof p.from === "string" ? { from: p.from } : {}),
        ...(typeof p.to === "string" ? { to: p.to } : {}),
        ...(typeof p.loaded === "number" && Number.isFinite(p.loaded) ? { loaded: Math.max(0, p.loaded) } : {}),
        ...(typeof p.total === "number" && Number.isFinite(p.total) && p.total > 0 ? { total: p.total } : {}),
        status,
        ...(typeof p.detail === "string" ? { detail: p.detail } : {}),
        appId: typeof p.appId === "string" && p.appId ? p.appId : senderAppId,
      };
      this.deps.onTransferReport?.(report);
      return { result: { ok: true } };
    }

    if (method === "haven_clearTransfer") {
      const p = (params ?? {}) as { id?: string };
      if (p.id && typeof p.id === "string") {
        this.deps.onTransferReport?.({
          id: p.id,
          direction: "download",
          label: "",
          status: "cancelled",
        });
      }
      return { result: { ok: true } };
    }

    if (method === "haven_getGateKey") {
      const p = (params ?? {}) as {
        gateId?: string;
        chainId?: number;
        chainVariant?: string;
        tokenAddress?: string;
        threshold?: string;
        epoch?: number;
      };
      const keys = this.deps.getUnlockedKeys();
      const targetGateId = p.gateId?.toLowerCase();
      const targetToken = p.tokenAddress?.toLowerCase();
      const targetVariant =
        p.chainVariant || (p.chainId != null ? CHAINS[Number(p.chainId)]?.aolVariant : undefined);
      const found = keys.find((k) => {
        if (p.epoch != null && k.epoch !== Number(p.epoch)) return false;
        const variantGateId = `${k.chainVariant}:${k.tokenAddress.toLowerCase()}:${k.threshold}`.toLowerCase();
        if (targetGateId) {
          if (
            k.gateKey.toLowerCase() === targetGateId ||
            k.cacheKey.toLowerCase() === targetGateId ||
            variantGateId === targetGateId
          ) {
            return true;
          }
        }
        if (targetToken && targetVariant) {
          const thresholdMatch = p.threshold == null || k.threshold === String(p.threshold);
          return (
            k.chainVariant === targetVariant &&
            k.tokenAddress.toLowerCase() === targetToken &&
            thresholdMatch
          );
        }
        return false;
      });
      if (!found) return { result: null };
      const derived = await found.vetKey.deriveSymmetricKey("haven-aes-256-gcm", 32);
      return {
        result: {
          gateId: found.gateKey,
          epoch: found.epoch,
          rawKeyBase64: bytesToBase64(new Uint8Array(derived)),
          vetKeyBase64: bytesToBase64(found.vetKey.serialize()),
          chainVariant: found.chainVariant,
          tokenAddress: found.tokenAddress,
          threshold: found.threshold,
        },
      };
    }

    if (method === "haven_unlockGate") {
      const p = (params ?? {}) as {
        gateId?: string;
        chainId?: number;
        chainVariant?: string;
        tokenAddress: string;
        threshold: string;
        epoch?: number;
      };
      const resolvedChainId =
        p.chainId != null
          ? Number(p.chainId)
          : p.chainVariant
            ? (VARIANT_TO_CHAIN_ID[p.chainVariant] ?? 8453)
            : 8453;
      const chainInfo = CHAINS[resolvedChainId];
      const resolvedVariant =
        (p.chainVariant as HavenGateRef["chainVariant"] | undefined) ??
        chainInfo?.aolVariant ??
        "BaseMainnet";
      const gateRef: HavenGateRef = {
        type: 3,
        chainId: resolvedChainId,
        chainVariant: resolvedVariant,
        tokenAddress: p.tokenAddress.toLowerCase(),
        threshold: p.threshold || "1",
        epoch: p.epoch,
      };
      const entry = await this.deps.unlockGate(gateRef, p.epoch);
      const derived = await entry.vetKey.deriveSymmetricKey("haven-aes-256-gcm", 32);
      return {
        result: {
          gateId: p.gateId || makeGateKey(gateRef),
          epoch: entry.epoch,
          rawKeyBase64: bytesToBase64(new Uint8Array(derived)),
          vetKeyBase64: bytesToBase64(entry.vetKey.serialize()),
          chainVariant: entry.chainVariant,
          tokenAddress: entry.tokenAddress,
          threshold: entry.threshold,
        },
      };
    }

    if (method === "eth_accounts") {
      return { result: w.address ? [w.address] : [] };
    }

    if (method === "eth_chainId") {
      return { result: w.chainId != null ? `0x${w.chainId.toString(16)}` : "0x1" };
    }

    if (method === "eth_requestAccounts") {
      if (!w.address) {
        await this.deps.connectWallet();
      }
      const next = this.deps.getWallet();
      return { result: next.address ? [next.address] : [] };
    }

    // Forward signing, chain-switching, and RPC calls needed by viem / Synapse / Arkiv writes
    if (
      method === "eth_signTypedData_v4" ||
      method === "personal_sign" ||
      method === "wallet_switchEthereumChain" ||
      method === "wallet_addEthereumChain" ||
      method === "eth_sendTransaction" ||
      method === "eth_sign" ||
      method === "eth_call" ||
      method === "eth_getBalance" ||
      method === "eth_estimateGas" ||
      method === "eth_gasPrice" ||
      method === "eth_maxPriorityFeePerGas" ||
      method === "eth_feeHistory" ||
      method === "eth_getTransactionCount" ||
      method === "eth_getTransactionReceipt" ||
      method === "eth_blockNumber" ||
      method === "net_version"
    ) {
      if (!w.provider) {
        throw new Error("Haven OS wallet is not connected (or is in watch-only mode).");
      }
      const res = await w.provider.request({
        method,
        params: Array.isArray(params) ? params : params != null ? [params] : [],
      });
      return { result: res };
    }

    throw new Error(`Unsupported Haven OS bridge method: ${method}`);
  }
}
