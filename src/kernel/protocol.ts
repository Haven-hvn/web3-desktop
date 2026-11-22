import type { Chain as HavenAolChain } from "haven-aol";

export const EPOCH_LENGTH_SECONDS = 2_592_000; // 30 days

export const HAVEN_GROUPS = [
  "haven.video.full",
  "haven.video.drip.series",
  "haven.video.drip.part",
  "haven.audio.full",
  "haven.image.full",
  "haven.text.full",
  "haven.file.full",
  "haven.board.def",
  "haven.board.thread",
  "haven.board.post",
] as const;

export type HavenGroup = (typeof HAVEN_GROUPS)[number] | string;

export const HAVEN_FULL_GROUPS = new Set<string>([
  "haven.video.full",
  "haven.audio.full",
  "haven.image.full",
  "haven.text.full",
  "haven.file.full",
]);

export const ENUM_TO_MIME: Readonly<Record<number, string>> = {
  1: "video/mp4",
  2: "video/webm",
  3: "video/quicktime",
  4: "audio/mpeg",
  5: "audio/wav",
  6: "audio/ogg",
  7: "image/png",
  8: "image/jpeg",
  9: "image/webp",
  10: "image/gif",
  11: "image/svg+xml",
  12: "text/plain",
  13: "text/markdown",
  14: "application/pdf",
  15: "application/vnd.comicbook+zip",
  16: "application/vnd.comicbook-rar",
};

export interface ChainInfo {
  id: number;
  name: string;
  shortName: string;
  aolVariant: HavenAolChain;
  rpcUrl: string;
  explorerUrl: string;
}

export const CHAINS: Record<number, ChainInfo> = {
  1: {
    id: 1,
    name: "Ethereum",
    shortName: "ETH",
    aolVariant: "EthMainnet",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorerUrl: "https://etherscan.io",
  },
  8453: {
    id: 8453,
    name: "Base",
    shortName: "BASE",
    aolVariant: "BaseMainnet",
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
  },
  42161: {
    id: 42161,
    name: "Arbitrum One",
    shortName: "ARB",
    aolVariant: "ArbitrumOne",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
  },
  10: {
    id: 10,
    name: "OP Mainnet",
    shortName: "OP",
    aolVariant: "OptimismMainnet",
    rpcUrl: "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
  },
  11155111: {
    id: 11155111,
    name: "Sepolia",
    shortName: "SEP",
    aolVariant: "EthSepolia",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io",
  },
};

export const VARIANT_TO_CHAIN_ID: Record<string, number> = {
  EthMainnet: 1,
  BaseMainnet: 8453,
  ArbitrumOne: 42161,
  OptimismMainnet: 10,
  EthSepolia: 11155111,
};

export interface HavenGateRef {
  type: number; // 1 = per-file, 3 = per-epoch, 4 = marketcap drip
  chainId: number;
  chainVariant: HavenAolChain;
  tokenAddress: string;
  threshold: string; // decimal string (u256 safe)
  epoch?: number;
}

export interface HavenMediaLocator {
  piece?: string;
  fcid?: string;
  mime?: number;
  size?: number;
  name?: string;
  hint?: string;
}

export interface DancePackInfo {
  packName: string;
  songCount: number;
  songs: { title: string; artist?: string; bpm?: string }[];
  isSample: boolean;
}

export interface AttestationSummary {
  evmAddress?: string;
  epoch?: number;
  balance?: string;
  isMerkle: boolean;
  hasSignature: boolean;
}

export interface HavenEntity {
  key: string;
  owner: string;
  creator: string;
  createdAt: number;
  expiresAt: number;
  grp: HavenGroup;
  title: string;
  board?: string;
  rootRef?: string;
  parentRef?: string;
  noBump?: boolean;
  mime: number;
  mimeType: string;
  durS?: number;
  sealedMask: number; // 0 clear, 1 text sealed, 2 media sealed, 3 both
  sha256Ct?: string;
  dripId?: string;
  dripIdx?: number;
  seriesRef?: string;
  mcapUsd?: number;
  gate?: HavenGateRef;
  gateKey: string; // "public" or "gate:<chainId>:<token>:<threshold>"
  payload: Record<string, unknown> | null;
  clearText?: string;
  sealedTextB64?: string;
  gateJson?: string;
  media?: HavenMediaLocator;
  dance?: DancePackInfo;
  hasAttestation: boolean;
  attestation?: AttestationSummary;
  boardDef?: {
    about: string;
    bumpLimit: number;
    capacity: number;
    pageSize: number;
    sealText: boolean;
    sealMedia: boolean;
  };
  rawAttributes: Record<string, string | number | boolean>;
}

export interface GateTokenMetadata {
  chainId: number;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  userBalance?: bigint;
  isHolder?: boolean;
  error?: string;
  fetchedAt: number;
}

export type GateStanding =
  | "public"
  | "member-unlocked"
  | "member-eligible"
  | "locked"
  | "unchecked";

export interface GateDirectoryEntry {
  gateKey: string;
  slug: string;
  title: string;
  about?: string;
  gate?: HavenGateRef;
  isPublic: boolean;
  defEntity?: HavenEntity;
  entities: HavenEntity[];
  uniqueUploaders: string[];
  attestedCount: number;
  countsByGroup: Record<string, number>;
  compatibleApps: CompatibleAppId[];
}

export type CompatibleAppId =
  | "explorer"
  | "haven-media"
  | "fairhaven"
  | "redhaven"
  | "feetonfire"
  | "planet";

export function makeGateKey(gate?: HavenGateRef): string {
  if (!gate) return "public";
  return `gate:${gate.chainId}:${gate.tokenAddress.toLowerCase()}:${gate.threshold}`;
}

export function implicitBoardSlug(gate?: HavenGateRef): string {
  if (!gate) return "public";
  const shortTok = gate.tokenAddress.toLowerCase().replace(/^0x/, "").slice(0, 12);
  return `g.${gate.chainId}.${shortTok}`;
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr || "unknown";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function shortKey(key: string): string {
  if (!key) return "";
  const clean = key.startsWith("0x") ? key.slice(2) : key;
  return clean.slice(0, 8);
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function currentEpochNow(): number {
  return Math.floor(Date.now() / 1000 / EPOCH_LENGTH_SECONDS);
}

export function epochSecondsRemaining(): number {
  const nowS = Math.floor(Date.now() / 1000);
  const nextEpochStart = (Math.floor(nowS / EPOCH_LENGTH_SECONDS) + 1) * EPOCH_LENGTH_SECONDS;
  return Math.max(0, nextEpochStart - nowS);
}

/**
 * The heart of the "Apps Over Data" thesis:
 * Given ANY Haven Arkiv entity, return every desktop app capable of rendering or acting on it.
 */
export function getCompatibleApps(entity: HavenEntity): CompatibleAppId[] {
  const apps: CompatibleAppId[] = [];
  if (entity.dance || (entity.grp === "haven.file.full" && entity.title.toLowerCase().includes("pack"))) {
    apps.push("feetonfire");
  }
  if (
    entity.grp.startsWith("haven.video") ||
    entity.grp === "haven.audio.full" ||
    entity.grp === "haven.image.full" ||
    (entity.media && (entity.mime >= 1 && entity.mime <= 11))
  ) {
    apps.push("haven-media");
  }
  if (
    entity.grp.startsWith("haven.board") ||
    HAVEN_FULL_GROUPS.has(entity.grp)
  ) {
    apps.push("fairhaven", "redhaven");
  }
  if (!apps.includes("explorer")) apps.push("explorer");
  return [...new Set(apps)];
}

export function buildGateDirectory(entities: HavenEntity[]): GateDirectoryEntry[] {
  const map = new Map<string, GateDirectoryEntry>();
  const uploadersByGate = new Map<string, Set<string>>();

  for (const e of entities) {
    const isPublic = !e.gate || e.gate.threshold === "0";
    const ownerLower = (e.owner || "0x0").toLowerCase();
    const existing = map.get(e.gateKey);
    if (!existing) {
      const upSet = new Set<string>([ownerLower]);
      uploadersByGate.set(e.gateKey, upSet);
      map.set(e.gateKey, {
        gateKey: e.gateKey,
        slug: e.board || implicitBoardSlug(e.gate),
        title: e.grp === "haven.board.def" ? e.title : e.board || implicitBoardSlug(e.gate),
        about: e.boardDef?.about,
        gate: e.gate,
        isPublic,
        defEntity: e.grp === "haven.board.def" ? e : undefined,
        entities: [e],
        uniqueUploaders: [ownerLower],
        attestedCount: e.hasAttestation ? 1 : 0,
        countsByGroup: { [e.grp]: 1 },
        compatibleApps: getCompatibleApps(e),
      });
    } else {
      existing.entities.push(e);
      const upSet = uploadersByGate.get(e.gateKey)!;
      if (!upSet.has(ownerLower)) {
        upSet.add(ownerLower);
        existing.uniqueUploaders.push(ownerLower);
      }
      if (e.hasAttestation) existing.attestedCount += 1;
      existing.countsByGroup[e.grp] = (existing.countsByGroup[e.grp] ?? 0) + 1;
      if (e.grp === "haven.board.def" && (!existing.defEntity || e.createdAt < existing.defEntity.createdAt)) {
        existing.defEntity = e;
        existing.slug = e.board || existing.slug;
        existing.title = e.title || existing.title;
        existing.about = e.boardDef?.about;
      } else if (e.board && existing.slug.startsWith("g.")) {
        existing.slug = e.board;
      }
      for (const app of getCompatibleApps(e)) {
        if (!existing.compatibleApps.includes(app)) existing.compatibleApps.push(app);
      }
    }
  }

  return [...map.values()].sort((a, b) => b.entities.length - a.entities.length || a.slug.localeCompare(b.slug));
}

export function classifyGateStanding(
  entry: GateDirectoryEntry,
  meta: GateTokenMetadata | undefined,
  hasUnlockedKey: boolean,
): GateStanding {
  if (entry.isPublic || !entry.gate) return "public";
  if (hasUnlockedKey) return "member-unlocked";
  if (meta?.isHolder === true) return "member-eligible";
  if (meta?.isHolder === false) return "locked";
  return "unchecked";
}

export function formatTokenAmount(raw: bigint | undefined, decimals: number): string {
  if (raw === undefined) return "—";
  if (decimals <= 0) return raw.toString();
  const base = 10n ** BigInt(Math.min(decimals, 18));
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(Math.min(decimals, 18), "0").slice(0, 3).replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export function partitionGatesByStanding(
  gates: GateDirectoryEntry[],
  getMeta: (entry: GateDirectoryEntry) => GateTokenMetadata | undefined,
  isUnlocked: (entry: GateDirectoryEntry) => boolean,
): {
  myDaos: GateDirectoryEntry[];
  lockedDaos: GateDirectoryEntry[];
  publicDrives: GateDirectoryEntry[];
} {
  const myDaos: GateDirectoryEntry[] = [];
  const lockedDaos: GateDirectoryEntry[] = [];
  const publicDrives: GateDirectoryEntry[] = [];

  for (const g of gates) {
    const standing = classifyGateStanding(g, getMeta(g), isUnlocked(g));
    if (standing === "public") {
      publicDrives.push(g);
    } else if (standing === "member-unlocked" || standing === "member-eligible") {
      myDaos.push(g);
    } else {
      lockedDaos.push(g);
    }
  }

  return { myDaos, lockedDaos, publicDrives };
}
