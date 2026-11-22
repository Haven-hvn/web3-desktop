import type { UnlockedEpochEntry } from "./aol";
import type { HavenOsConfig } from "./config";
import type { Eip1193Provider } from "./evm";
import { CHAINS, makeGateKey, type HavenGateRef } from "./protocol";

export const HAVEN_OS_BRIDGE_CHANNEL = "haven-os:v1" as const;

const DEFAULT_ALLOWED_ORIGINS = new Set<string>([
  "https://haven.pinme.dev",
  "https://haven-tunes.pinme.dev",
  "https://haven-bay.pinme.dev",
  "https://fairhaven.pinme.dev",
  "https://redhaven.pinme.dev",
  "https://feetonfire.pinme.dev",
]);

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
}

interface RegisteredClient {
  win: Window;
  origin: string;
  appId?: string;
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
    event: "accountsChanged" | "chainChanged" | "configChanged" | "keyringChanged",
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
  ): void {
    target.postMessage(
      {
        channel: HAVEN_OS_BRIDGE_CHANNEL,
        kind: "response",
        id,
        ...(error ? { error } : { result }),
      },
      origin,
    );
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
          },
        },
        origin,
      );
      return;
    }

    if (msg.kind !== "request" || !msg.id || !msg.method) return;

    try {
      const result = await this.dispatch(msg.method, msg.params);
      this.reply(target, origin, msg.id, result);
    } catch (err) {
      const code = (err as { code?: number })?.code ?? -32000;
      const message = err instanceof Error ? err.message : String(err);
      this.reply(target, origin, msg.id, undefined, { code, message });
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    const w = this.deps.getWallet();

    if (method === "haven_getConfig") {
      return exportConfig(this.deps.getConfig());
    }

    if (method === "haven_getGateKey") {
      const p = (params ?? {}) as { gateId?: string; epoch?: number };
      const keys = this.deps.getUnlockedKeys();
      const found = keys.find(
        (k) =>
          (k.gateKey === p.gateId || k.gateKey.toLowerCase() === p.gateId?.toLowerCase()) &&
          (p.epoch == null || k.epoch === p.epoch),
      );
      if (!found) return null;
      const derived = await found.vetKey.deriveSymmetricKey("haven-aes-256-gcm", 32);
      return {
        gateId: found.gateKey,
        epoch: found.epoch,
        rawKeyBase64: bytesToBase64(new Uint8Array(derived)),
      };
    }

    if (method === "haven_unlockGate") {
      const p = (params ?? {}) as {
        gateId?: string;
        chainId: number;
        tokenAddress: string;
        threshold: string;
        epoch?: number;
      };
      const chainInfo = CHAINS[Number(p.chainId)];
      const gateRef: HavenGateRef = {
        type: 3,
        chainId: Number(p.chainId),
        chainVariant: chainInfo?.aolVariant ?? "BaseMainnet",
        tokenAddress: p.tokenAddress.toLowerCase(),
        threshold: p.threshold || "1",
        epoch: p.epoch,
      };
      const entry = await this.deps.unlockGate(gateRef, p.epoch);
      const derived = await entry.vetKey.deriveSymmetricKey("haven-aes-256-gcm", 32);
      return {
        gateId: p.gateId || makeGateKey(gateRef),
        epoch: entry.epoch,
        rawKeyBase64: bytesToBase64(new Uint8Array(derived)),
      };
    }

    if (method === "eth_accounts") {
      return w.address ? [w.address] : [];
    }

    if (method === "eth_chainId") {
      return w.chainId != null ? `0x${w.chainId.toString(16)}` : "0x1";
    }

    if (method === "eth_requestAccounts") {
      if (!w.address) {
        await this.deps.connectWallet();
      }
      const next = this.deps.getWallet();
      return next.address ? [next.address] : [];
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
      return w.provider.request({
        method,
        params: Array.isArray(params) ? params : params != null ? [params] : [],
      });
    }

    throw new Error(`Unsupported Haven OS bridge method: ${method}`);
  }
}
