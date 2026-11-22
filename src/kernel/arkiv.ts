import { createPublicClient } from "@arkiv-network/sdk";
import { localhost, rabdi } from "@arkiv-network/sdk/chains";
import { asc, startsWith } from "@arkiv-network/sdk/query";
import { http } from "viem";
import type { HavenOsConfig } from "./config";
import {
  CHAINS,
  ENUM_TO_MIME,
  VARIANT_TO_CHAIN_ID,
  makeGateKey,
  type DancePackInfo,
  type HavenEntity,
  type HavenGateRef,
  type HavenMediaLocator,
} from "./protocol";

export interface ArkivProbeResult {
  online: boolean;
  blockNumber: number | null;
  entityCount: number | null;
  rttMs: number;
  error?: string;
  checkedAt: number;
}

const SELECTION = {
  $key: true,
  $owner: true,
  $creator: true,
  $createdAt: true,
  $expiresAt: true,
  $attributes: true,
  payload: true,
} as const;

const CACHE_KEY = "haven-os:arkiv-entities:v2";
const MAX_CONCURRENT = 2;
const COOLDOWN_MS = 30_000;

let inFlight = 0;
const waitQueue: (() => void)[] = [];
let cooldownUntil = 0;

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT && Date.now() >= cooldownUntil) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitQueue.push(resolve));
}

function releaseSlot(): void {
  inFlight--;
  const next = waitQueue.shift();
  if (next) {
    inFlight++;
    next();
  }
}

async function boundedFetch(
  config: HavenOsConfig,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  await acquireSlot();
  try {
    const headers = new Headers(init?.headers);
    if (config.arkivApiKey) headers.set("X-API-KEY", config.arkivApiKey);
    const res = await fetch(input, { ...init, headers });
    if (res.status === 429) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      throw new Error(
        "Arkiv RPC rate-limited (429). Wait 30s or add a free API key in Control Panel → Networks.",
      );
    }
    return res;
  } finally {
    releaseSlot();
  }
}

const clientCache = new Map<string, ReturnType<typeof createPublicClient>>();

function getArkivClient(config: HavenOsConfig) {
  const key = `${config.arkivRpcUrl}|${config.arkivApiKey}`;
  let client = clientCache.get(key);
  if (!client) {
    const isLocal = /localhost|127\.0\.0\.1/.test(config.arkivRpcUrl);
    client = createPublicClient({
      chain: isLocal ? localhost : rabdi({ accessKey: config.arkivApiKey }),
      transport: http(config.arkivRpcUrl, {
        retryCount: 0,
        fetchFn: (url, init) => boundedFetch(config, url, init),
      }),
    });
    clientCache.set(key, client);
  }
  return client;
}

export async function probeArkiv(config: HavenOsConfig): Promise<ArkivProbeResult> {
  const t0 = performance.now();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.arkivApiKey) headers["X-API-KEY"] = config.arkivApiKey;

    const [blockRes, countRes] = await Promise.all([
      fetch(config.arkivRpcUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      }),
      fetch(config.arkivRpcUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "arkiv_getEntityCount", params: [] }),
      }),
    ]);

    if (!blockRes.ok) throw new Error(`HTTP ${blockRes.status}`);
    const blockJson = (await blockRes.json()) as { result?: string; error?: { message?: string } };
    const countJson = (await countRes.json()) as { result?: number | string };
    if (blockJson.error) throw new Error(blockJson.error.message || "RPC error");

    const blockNumber = blockJson.result ? parseInt(blockJson.result, 16) : null;
    const entityCount =
      typeof countJson.result === "number"
        ? countJson.result
        : typeof countJson.result === "string"
          ? parseInt(countJson.result, countJson.result.startsWith("0x") ? 16 : 10)
          : null;

    return {
      online: true,
      blockNumber: Number.isFinite(blockNumber) ? blockNumber : null,
      entityCount: Number.isFinite(entityCount) ? entityCount : null,
      rttMs: Math.round(performance.now() - t0),
      checkedAt: Date.now(),
    };
  } catch (err) {
    return {
      online: false,
      blockNumber: null,
      entityCount: null,
      rttMs: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
      checkedAt: Date.now(),
    };
  }
}

type TaggedAttr = { type?: string; value?: unknown };

interface RawArkivEntity {
  key?: string;
  $key?: string;
  owner?: string;
  $owner?: string;
  creator?: string;
  $creator?: string;
  createdAt?: number | bigint;
  $createdAt?: number | bigint;
  expiresAt?: number | bigint;
  $expiresAt?: number | bigint;
  attributes?: Array<{ key: string; value: unknown }> | Record<string, TaggedAttr | unknown>;
  $attributes?: Array<{ key: string; value: unknown }> | Record<string, TaggedAttr | unknown>;
  payload?: Uint8Array | string | TaggedAttr | Record<string, unknown>;
}

function hexStringToUtf8(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function decodePayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    // Handle @arkiv-network/sdk@1.0.1 tagged bytes object: { type: "bytes", value: "0x7b22..." }
    if (typeof raw === "object" && !(raw instanceof Uint8Array)) {
      const obj = raw as Record<string, unknown>;
      if (obj.type === "bytes" && typeof obj.value === "string") {
        const text = obj.value.startsWith("0x") ? hexStringToUtf8(obj.value) : obj.value;
        return JSON.parse(text) as Record<string, unknown>;
      }
      if (obj.type === "bytes" && obj.value instanceof Uint8Array) {
        return JSON.parse(new TextDecoder().decode(obj.value)) as Record<string, unknown>;
      }
      if (!("type" in obj && "value" in obj)) {
        return obj;
      }
    }
    if (raw instanceof Uint8Array) {
      return JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.startsWith("{")) return JSON.parse(trimmed) as Record<string, unknown>;
      if (trimmed.startsWith("0x")) return JSON.parse(hexStringToUtf8(trimmed)) as Record<string, unknown>;
      const bin = atob(trimmed);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function unwrapAttrValue(v: unknown): string | number | boolean | undefined {
  if (v == null) return undefined;
  if (typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return unwrapAttrValue((v as Record<string, unknown>).value);
  }
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return undefined;
}

function extractAttributes(row: RawArkivEntity): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const raw = row.$attributes ?? row.attributes;
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const a of raw) {
      if (!a || typeof a.key !== "string") continue;
      const val = unwrapAttrValue(a.value);
      if (val !== undefined) out[a.key] = val;
    }
    return out;
  }
  if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (k === "payload") continue;
      const val = unwrapAttrValue(v);
      if (val !== undefined) out[k] = val;
    }
  }
  return out;
}

function normalizeChainId(rawChain: unknown): number | undefined {
  if (typeof rawChain === "number" && Number.isFinite(rawChain)) return rawChain;
  if (typeof rawChain === "bigint") return Number(rawChain);
  if (typeof rawChain === "string") {
    if (rawChain in VARIANT_TO_CHAIN_ID) return VARIANT_TO_CHAIN_ID[rawChain];
    const parsed = Number(rawChain);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function parseDanceInfo(payload: Record<string, unknown> | null, title: string): DancePackInfo | undefined {
  if (!payload) return undefined;
  const x = payload.x as Record<string, unknown> | undefined;
  const dance = x?.dance as Record<string, unknown> | undefined;
  if (dance && typeof dance === "object") {
    const rawSongs = Array.isArray(dance.songs) ? dance.songs : [];
    const songs = rawSongs
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
      .map((s) => ({
        title: String(s.title ?? s.name ?? "Untitled Song"),
        artist: typeof s.artist === "string" ? s.artist : undefined,
        bpm: s.bpm != null ? String(s.bpm) : undefined,
      }));
    return {
      packName: String(dance.pack ?? dance.title ?? title),
      songCount: typeof dance.songCount === "number" ? dance.songCount : songs.length,
      songs,
      isSample: Boolean(dance.sample || dance.isSample || payload.fcid),
    };
  }
  // Recognize standalone StepMania chart files (.sm / .ssc) published on Rabdi
  const ct = typeof payload.ct === "string" ? payload.ct : "";
  const name = typeof payload.name === "string" ? payload.name : "";
  if (ct.includes("stepmania") || /\.(sm|ssc)$/i.test(name) || /\.(sm|ssc)$/i.test(title)) {
    return {
      packName: title || name || "StepMania Chart",
      songCount: 1,
      songs: [{ title: name || title }],
      isSample: Boolean(payload.fcid),
    };
  }
  return undefined;
}

export function parseArkivRow(row: RawArkivEntity): HavenEntity | null {
  const key = String(row.$key ?? row.key ?? "");
  if (!key) return null;

  const attrs = extractAttributes(row);
  const grp = String(attrs.grp ?? "");
  if (!grp) return null;

  const rawAttrsObj =
    row.$attributes && !Array.isArray(row.$attributes)
      ? (row.$attributes as Record<string, unknown>)
      : undefined;
  const payload = decodePayload(row.payload ?? rawAttrsObj?.payload);

  const owner = String(row.$owner ?? row.owner ?? "0x0");
  const creator = String(row.$creator ?? row.creator ?? owner);
  const createdAt = Number(row.$createdAt ?? row.createdAt ?? 0);
  const expiresAt = Number(row.$expiresAt ?? row.expiresAt ?? 0);

  const gateToken =
    typeof attrs.gate_token === "string" ? attrs.gate_token.toLowerCase() : undefined;
  const gateChainId = normalizeChainId(attrs.gate_chain);
  const gateType = attrs.gate_type != null ? Number(attrs.gate_type) : undefined;
  const gateThreshold = attrs.gate_threshold != null ? String(attrs.gate_threshold) : undefined;
  const gateEpoch = attrs.gate_epoch != null ? Number(attrs.gate_epoch) : undefined;

  let gate: HavenGateRef | undefined;
  if (gateToken && gateChainId) {
    const chainInfo = CHAINS[gateChainId];
    gate = {
      type: gateType ?? 3,
      chainId: gateChainId,
      chainVariant: chainInfo?.aolVariant ?? "EthMainnet",
      tokenAddress: gateToken,
      threshold: gateThreshold ?? "1",
      epoch: gateEpoch,
    };
  }

  const mime = attrs.mime != null ? Number(attrs.mime) : 0;
  const payloadCt = typeof payload?.ct === "string" ? payload.ct : undefined;
  const mimeType =
    payloadCt ??
    ENUM_TO_MIME[mime] ??
    (grp.startsWith("haven.video")
      ? "video/mp4"
      : grp.startsWith("haven.board")
        ? "text/plain"
        : "application/octet-stream");

  const title = String(attrs.subject ?? attrs.title ?? attrs.board ?? `${grp} #${key.slice(0, 10)}`);

  let clearText: string | undefined;
  let sealedTextB64: string | undefined;
  if (payload?.text && typeof payload.text === "object") {
    const txt = payload.text as Record<string, unknown>;
    if (typeof txt.clear === "string") clearText = txt.clear;
    if (typeof txt.sealed === "string") sealedTextB64 = txt.sealed;
  } else if (typeof payload?.about === "string") {
    clearText = payload.about;
  }

  const gateJson =
    typeof payload?.gate === "string"
      ? payload.gate
      : payload?.gate && typeof payload.gate === "object"
        ? JSON.stringify(payload.gate)
        : undefined;

  let media: HavenMediaLocator | undefined;
  if (payload?.media && typeof payload.media === "object") {
    const m = payload.media as Record<string, unknown>;
    media = {
      piece: typeof m.piece === "string" ? m.piece : undefined,
      fcid: typeof m.fcid === "string" ? m.fcid : undefined,
      mime: typeof m.mime === "number" ? m.mime : mime,
      size: typeof m.size === "number" ? m.size : undefined,
      name: typeof m.name === "string" ? m.name : undefined,
      hint: typeof m.hint === "string" ? m.hint : undefined,
    };
  } else if (typeof payload?.piece === "string" || typeof payload?.fcid === "string") {
    media = {
      piece: typeof payload.piece === "string" ? payload.piece : undefined,
      fcid: typeof payload.fcid === "string" ? payload.fcid : undefined,
      mime,
      size: typeof payload.size === "number" ? payload.size : undefined,
      name: typeof payload.name === "string" ? payload.name : title,
    };
  }

  const sealedMask =
    attrs.sealed != null
      ? Number(attrs.sealed)
      : gate && (media?.piece || sealedTextB64 || gateJson)
        ? 2
        : 0;

  // Parse Haven-AOL Ed25519 uploader membership attestation (payload.attn)
  let attestation: HavenEntity["attestation"];
  if (payload?.attn && typeof payload.attn === "object") {
    const a = payload.attn as Record<string, unknown>;
    const sig = typeof a.sig === "string" ? a.sig : typeof a.signature === "string" ? a.signature : "";
    attestation = {
      evmAddress: typeof a.evmAddress === "string" ? a.evmAddress : undefined,
      epoch: typeof a.epoch === "number" ? a.epoch : undefined,
      balance:
        a.bal != null
          ? String(a.bal)
          : a.balance != null
            ? String(a.balance)
            : a.balanceAtCheck != null
              ? String(a.balanceAtCheck)
              : undefined,
      isMerkle: Array.isArray(a.merkleProof),
      hasSignature: sig.length >= 64,
    };
  }

  let boardDef: HavenEntity["boardDef"];
  if (grp === "haven.board.def") {
    const defaults = (payload?.defaults as Record<string, unknown> | undefined) ?? {};
    boardDef = {
      about: typeof payload?.about === "string" ? payload.about : "",
      bumpLimit: Number(attrs.bump_limit ?? 300),
      capacity: Number(attrs.capacity ?? 150),
      pageSize: Number(attrs.page_size ?? 15),
      sealText: defaults.sealText !== false,
      sealMedia: defaults.sealMedia !== false,
    };
  }

  return {
    key,
    owner,
    creator,
    createdAt,
    expiresAt,
    grp,
    title,
    board: typeof attrs.board === "string" ? attrs.board : undefined,
    rootRef: typeof attrs.root_ref === "string" ? attrs.root_ref : undefined,
    parentRef: typeof attrs.parent_ref === "string" ? attrs.parent_ref : undefined,
    noBump: attrs.no_bump === 1 || attrs.no_bump === "1",
    mime,
    mimeType,
    durS: attrs.dur_s != null ? Number(attrs.dur_s) : undefined,
    sealedMask,
    sha256Ct: typeof attrs.sha256_ct === "string" ? attrs.sha256_ct : undefined,
    dripId: typeof attrs.drip_id === "string" ? attrs.drip_id : undefined,
    dripIdx: attrs.drip_idx != null ? Number(attrs.drip_idx) : undefined,
    seriesRef: typeof attrs.series_ref === "string" ? attrs.series_ref : undefined,
    mcapUsd: attrs.mcap_usd != null ? Number(attrs.mcap_usd) : undefined,
    gate,
    gateKey: makeGateKey(gate),
    payload,
    clearText,
    sealedTextB64,
    gateJson,
    media,
    dance: parseDanceInfo(payload, title),
    hasAttestation: Boolean(attestation?.hasSignature),
    attestation,
    boardDef,
    rawAttributes: attrs,
  };
}

export function loadCachedEntities(rpcUrl: string): HavenEntity[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { rpcUrl: string; entities: HavenEntity[] };
    if (parsed.rpcUrl !== rpcUrl) return [];
    return Array.isArray(parsed.entities) ? parsed.entities : [];
  } catch {
    return [];
  }
}

export function clearArkivCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Single prefix scan (`grp STARTSWITH "haven."`) against Arkiv (Rabdi by default).
 * Respects Arkiv's anonymous tier rate limit by scanning the entire Haven namespace in 1–2 pages.
 */
export async function fetchHavenUniverse(
  config: HavenOsConfig,
  onProgress?: (msg: string) => void,
): Promise<HavenEntity[]> {
  const client = getArkivClient(config);
  const byKey = new Map<string, HavenEntity>();
  const pageSize = 100;
  let offset = 0;

  while (byKey.size < config.maxArkivRecords) {
    onProgress?.(`Querying haven.* on ${config.arkivNetworkName} (offset ${offset})…`);
    const page = await client
      .select(SELECTION)
      .where(startsWith("grp", "haven."))
      .orderBy(asc("$key"))
      .limit(pageSize)
      .offset(offset)
      .fetch();

    const rows = (page.entities ?? []) as unknown as RawArkivEntity[];
    for (const row of rows) {
      const parsed = parseArkivRow(row);
      if (parsed && !byKey.has(parsed.key)) {
        byKey.set(parsed.key, parsed);
      }
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  const entities = [...byKey.values()].sort(
    (a, b) => b.createdAt - a.createdAt || a.key.localeCompare(b.key),
  );

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rpcUrl: config.arkivRpcUrl, entities }));
  } catch {
    // ignore quota
  }

  return entities;
}
