import { createPublicClient, erc20Abi, http, isAddress } from "viem";
import { CHAINS, type GateTokenMetadata } from "./protocol";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface DiscoveredWallet {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
}

export interface ChainProbeResult {
  id: string;
  name: string;
  shortName: string;
  online: boolean;
  blockNumber: number | null;
  rttMs: number;
  error?: string;
}

export function discoverInjectedWallets(onDiscover: (wallet: DiscoveredWallet) => void): () => void {
  const seen = new Set<string>();

  const onAnnounce = (event: Event) => {
    const custom = event as CustomEvent<{
      info?: { uuid?: string; name?: string; icon?: string };
      provider?: Eip1193Provider;
    }>;
    const info = custom.detail?.info;
    const provider = custom.detail?.provider;
    if (!info?.name || !provider) return;
    const id = info.uuid || info.name;
    if (seen.has(id)) return;
    seen.add(id);
    onDiscover({ id, name: info.name, icon: info.icon, provider });
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Legacy window.ethereum fallback
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (eth && !seen.has("injected-default")) {
    seen.add("injected-default");
    onDiscover({ id: "injected-default", name: "Browser Wallet (window.ethereum)", provider: eth });
  }

  return () => {
    window.removeEventListener("eip6963:announceProvider", onAnnounce);
  };
}

export async function connectEip1193Wallet(
  provider: Eip1193Provider,
): Promise<{ address: string; chainId: number }> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts returned by wallet");
  }
  const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
  return {
    address: accounts[0],
    chainId: parseInt(chainHex, 16) || 1,
  };
}

export async function signEip712TypedData(
  provider: Eip1193Provider,
  address: string,
  typedData: Record<string, unknown>,
): Promise<string> {
  const serialized = JSON.stringify(typedData, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  const sig = await provider.request({
    method: "eth_signTypedData_v4",
    params: [address, serialized],
  });
  if (typeof sig !== "string") {
    throw new Error("Wallet returned invalid signature");
  }
  return sig;
}

const publicClients = new Map<number, ReturnType<typeof createPublicClient>>();

function getPublicClient(chainId: number) {
  let client = publicClients.get(chainId);
  if (!client) {
    const info = CHAINS[chainId];
    if (!info) throw new Error(`Unsupported EVM chain id ${chainId}`);
    client = createPublicClient({
      transport: http(info.rpcUrl, { retryCount: 1, timeout: 8000 }),
    });
    publicClients.set(chainId, client);
  }
  return client;
}

export async function inspectGateToken(
  chainId: number,
  tokenAddress: string,
  thresholdStr: string,
  holderAddress?: string,
): Promise<GateTokenMetadata> {
  const base: GateTokenMetadata = {
    chainId,
    tokenAddress: tokenAddress.toLowerCase(),
    name: tokenAddress.slice(0, 10),
    symbol: "TOKEN",
    decimals: 18,
    fetchedAt: Date.now(),
  };

  if (!isAddress(tokenAddress)) {
    return { ...base, error: "Invalid EVM address" };
  }

  try {
    const client = getPublicClient(chainId);
    const addr = tokenAddress as `0x${string}`;

    const [nameRes, symbolRes, decimalsRes, balRes] = await Promise.allSettled([
      client.readContract({ address: addr, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: addr, abi: erc20Abi, functionName: "decimals" }),
      holderAddress && isAddress(holderAddress)
        ? client.readContract({
            address: addr,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [holderAddress as `0x${string}`],
          })
        : Promise.resolve(undefined),
    ]);

    const name = nameRes.status === "fulfilled" ? String(nameRes.value) : base.name;
    const symbol = symbolRes.status === "fulfilled" ? String(symbolRes.value) : base.symbol;
    const decimals = decimalsRes.status === "fulfilled" ? Number(decimalsRes.value) : 0; // NFTs revert on decimals()
    const userBalance = balRes.status === "fulfilled" ? balRes.value : undefined;
    let isHolder: boolean | undefined;
    if (userBalance !== undefined) {
      try {
        isHolder = userBalance >= BigInt(thresholdStr || "1");
      } catch {
        isHolder = userBalance > 0n;
      }
    }

    return {
      ...base,
      name,
      symbol,
      decimals,
      userBalance,
      isHolder,
    };
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function probeEvmAndFilecoinChains(): Promise<ChainProbeResult[]> {
  const targets = [
    { id: "eth", name: "Ethereum Mainnet", shortName: "ETH", rpcUrl: CHAINS[1].rpcUrl },
    { id: "base", name: "Base Mainnet", shortName: "BASE", rpcUrl: CHAINS[8453].rpcUrl },
    { id: "arb", name: "Arbitrum One", shortName: "ARB", rpcUrl: CHAINS[42161].rpcUrl },
    { id: "op", name: "OP Mainnet", shortName: "OP", rpcUrl: CHAINS[10].rpcUrl },
    { id: "fil", name: "Filecoin FEVM", shortName: "FIL", rpcUrl: "https://api.node.glif.io/rpc/v1" },
  ];

  return Promise.all(
    targets.map(async (t) => {
      const t0 = performance.now();
      try {
        const res = await fetch(t.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { result?: string; error?: { message?: string } };
        if (data.error) throw new Error(data.error.message || "RPC error");
        const blockNumber = data.result ? parseInt(data.result, 16) : null;
        return {
          id: t.id,
          name: t.name,
          shortName: t.shortName,
          online: true,
          blockNumber: Number.isFinite(blockNumber) ? blockNumber : null,
          rttMs: Math.round(performance.now() - t0),
        };
      } catch (err) {
        return {
          id: t.id,
          name: t.name,
          shortName: t.shortName,
          online: false,
          blockNumber: null,
          rttMs: Math.round(performance.now() - t0),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}
