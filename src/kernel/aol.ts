import { Actor, AnonymousIdentity, HttpAgent } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { DerivedPublicKey, EncryptedVetKey, IbeCiphertext, TransportSecretKey, VetKey } from "@icp-sdk/vetkeys";
import type { Chain as HavenAolChain } from "haven-aol";
import type { HavenOsConfig } from "./config";
import type { Eip1193Provider } from "./evm";
import { signEip712TypedData } from "./evm";
import { currentEpochNow, type HavenEntity, type HavenGateRef } from "./protocol";

export interface UnlockedEpochEntry {
  cacheKey: string;
  gateKey: string;
  chainVariant: HavenAolChain;
  tokenAddress: string;
  threshold: string;
  epoch: number;
  unlockedBy: string;
  unlockedAt: number;
  vetKey: VetKey;
}

const FRAME_MAGIC_MIN = 12;

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out as `0x${string}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function epochKeyringId(gate: HavenGateRef, epoch: number): string {
  return `${gate.chainVariant}:${gate.tokenAddress.toLowerCase()}:${gate.threshold}:${epoch}`;
}

async function computeDerivationInputV3(
  chain: HavenAolChain,
  tokenAddress: string,
  threshold: string,
  epoch: number,
): Promise<Uint8Array> {
  const effectiveEpoch = threshold === "0" ? 0 : epoch;
  const preimage = `accessol_v3:${chain}:${tokenAddress.toLowerCase()}:${threshold}:${effectiveEpoch}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage));
  return new Uint8Array(digest);
}

function buildGateRequestV3TypedData(args: {
  evmAddress: string;
  transportPublicKey: Uint8Array;
  epoch: number;
  nonce: bigint;
  eip712ChainId: number;
  eip712VerifyingContract: string;
}) {
  return {
    domain: {
      name: "HavenAOL",
      chainId: args.eip712ChainId,
      verifyingContract: args.eip712VerifyingContract,
    },
    primaryType: "GateRequestV3",
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      GateRequestV3: [
        { name: "evmAddress", type: "address" },
        { name: "transportPublicKey", type: "bytes" },
        { name: "epoch", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    message: {
      evmAddress: args.evmAddress,
      transportPublicKey: bytesToHex(args.transportPublicKey),
      epoch: String(args.epoch),
      nonce: args.nonce.toString(),
    },
  };
}

const ChainVariantIdl = IDL.Variant({
  EthMainnet: IDL.Null,
  EthSepolia: IDL.Null,
  ArbitrumOne: IDL.Null,
  BaseMainnet: IDL.Null,
  OptimismMainnet: IDL.Null,
});

const GateRequestV3Idl = IDL.Record({
  chain: ChainVariantIdl,
  tokenAddress: IDL.Text,
  threshold: IDL.Nat,
  epoch: IDL.Nat,
  evmAddress: IDL.Text,
  transportPublicKey: IDL.Vec(IDL.Nat8),
  nonce: IDL.Nat,
  signature: IDL.Vec(IDL.Nat8),
  eip712ChainId: IDL.Nat,
  eip712VerifyingContract: IDL.Text,
});

const GateErrorIdl = IDL.Variant({
  InsufficientBalance: IDL.Record({ required: IDL.Nat, actual: IDL.Nat }),
  InvalidAddress: IDL.Text,
  InvalidThreshold: IDL.Null,
  InvalidEpoch: IDL.Text,
  EvmRpcError: IDL.Text,
  VetKDError: IDL.Text,
  InvalidSignature: IDL.Text,
  NonceAlreadyUsed: IDL.Null,
});

const GateResultIdl = IDL.Variant({
  ok: IDL.Record({
    encrypted_key: IDL.Vec(IDL.Nat8),
    verification_key: IDL.Vec(IDL.Nat8),
  }),
  err: GateErrorIdl,
});

const v3IdlFactory = () =>
  IDL.Service({
    requestDecryptionKeyV3: IDL.Func([GateRequestV3Idl], [GateResultIdl], []),
    getCurrentEpoch: IDL.Func([], [IDL.Nat], ["query"]),
    getAttestationPublicKey: IDL.Func([], [IDL.Vec(IDL.Nat8)], ["query"]),
  });

async function createCanisterActor(config: HavenOsConfig) {
  const agent = await HttpAgent.create({
    host: config.icpHost,
    identity: new AnonymousIdentity(),
    verifyQuerySignatures: false,
  });
  if (config.havenAolFetchRootKey) {
    await agent.fetchRootKey();
  }
  return Actor.createActor(v3IdlFactory, {
    agent,
    canisterId: config.havenAolCanisterId,
  });
}

export async function probeHavenAolCanister(config: HavenOsConfig): Promise<{
  online: boolean;
  canisterEpoch: number | null;
  rttMs: number;
  error?: string;
}> {
  const t0 = performance.now();
  try {
    const actor = await createCanisterActor(config);
    const epochBig = (await actor.getCurrentEpoch()) as bigint;
    return {
      online: true,
      canisterEpoch: Number(epochBig),
      rttMs: Math.round(performance.now() - t0),
    };
  } catch (err) {
    return {
      online: false,
      canisterEpoch: null,
      rttMs: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Performs a real Haven-AOL v3 epoch unlock (EIP-712 signature -> ICP VetKD canister -> VetKey recovery).
 * Once unlocked, the VetKey is held in the OS Keyring so EVERY Haven app on the desktop can decrypt
 * sealed text and media for that (chain, token, threshold, epoch) without prompting again.
 */
export async function unlockGateEpochV3(args: {
  config: HavenOsConfig;
  gate: HavenGateRef;
  epoch?: number;
  provider: Eip1193Provider;
  evmAddress: string;
}): Promise<UnlockedEpochEntry> {
  const epoch = args.epoch ?? args.gate.epoch ?? currentEpochNow();
  const tsk = TransportSecretKey.random();
  const transportPublicKey = tsk.publicKeyBytes();

  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = BigInt(bytesToHex(nonceBytes));

  const typedData = buildGateRequestV3TypedData({
    evmAddress: args.evmAddress,
    transportPublicKey,
    epoch,
    nonce,
    eip712ChainId: args.config.eip712ChainId,
    eip712VerifyingContract: args.config.havenAolVerifyingContract,
  });

  const sigHex = await signEip712TypedData(args.provider, args.evmAddress, typedData);
  const sigBytes = hexToBytes(sigHex);
  if (sigBytes.length !== 65) {
    throw new Error(`Expected 65-byte EIP-712 signature, got ${sigBytes.length}`);
  }

  const actor = await createCanisterActor(args.config);
  const req = {
    chain: { [args.gate.chainVariant]: null },
    tokenAddress: args.gate.tokenAddress.toLowerCase(),
    threshold: BigInt(args.gate.threshold || "0"),
    epoch: BigInt(epoch),
    evmAddress: args.evmAddress,
    transportPublicKey: Array.from(transportPublicKey),
    nonce,
    signature: Array.from(sigBytes),
    eip712ChainId: BigInt(args.config.eip712ChainId),
    eip712VerifyingContract: args.config.havenAolVerifyingContract,
  };

  const result = (await actor.requestDecryptionKeyV3(req)) as
    | { ok: { encrypted_key: Uint8Array | number[]; verification_key: Uint8Array | number[] } }
    | { err: Record<string, unknown> };

  if ("err" in result) {
    const errTag = Object.keys(result.err)[0] ?? "UnknownError";
    const errVal = result.err[errTag];
    if (errTag === "InsufficientBalance" && errVal && typeof errVal === "object") {
      const b = errVal as { required?: bigint; actual?: bigint };
      throw new Error(`Insufficient balance: need ${b.required?.toString()}, wallet has ${b.actual?.toString()}`);
    }
    throw new Error(`Haven-AOL rejected unlock (${errTag}): ${String(errVal ?? "")}`);
  }

  const encKeyBytes = new Uint8Array(result.ok.encrypted_key);
  const verKeyBytes = new Uint8Array(result.ok.verification_key);
  const derivationInput = await computeDerivationInputV3(
    args.gate.chainVariant,
    args.gate.tokenAddress,
    args.gate.threshold,
    epoch,
  );

  const dpk = DerivedPublicKey.deserialize(verKeyBytes);
  const evk = EncryptedVetKey.deserialize(encKeyBytes);
  const vetKey = evk.decryptAndVerify(tsk, dpk, derivationInput);

  return {
    cacheKey: epochKeyringId(args.gate, epoch),
    gateKey: `gate:${args.gate.chainId}:${args.gate.tokenAddress.toLowerCase()}:${args.gate.threshold}`,
    chainVariant: args.gate.chainVariant,
    tokenAddress: args.gate.tokenAddress.toLowerCase(),
    threshold: args.gate.threshold,
    epoch,
    unlockedBy: args.evmAddress,
    unlockedAt: Date.now(),
    vetKey,
  };
}

/**
 * Unwraps an IBE-encrypted AES-256 key from a Haven gate JSON blob using an unlocked VetKey.
 */
export function unwrapAesKeyFromGateJson(gateJson: string, vetKey: VetKey): Uint8Array {
  const parsed = JSON.parse(gateJson) as { encryptedAesKey?: string };
  if (!parsed.encryptedAesKey) {
    throw new Error("Gate JSON missing encryptedAesKey");
  }
  const ctBytes = base64ToBytes(parsed.encryptedAesKey);
  const ibeCt = IbeCiphertext.deserialize(ctBytes);
  return ibeCt.decrypt(vetKey);
}

/**
 * Decrypts Haven's framed AES-GCM layout:
 * `[12-byte base IV][u32LE idx][u32LE len][ct+16 tag]*`
 * with fallback to legacy `[12-byte IV][ct+16 tag]`.
 */
export async function openFramedAesGcm(sealedBytes: Uint8Array, rawAesKey: Uint8Array): Promise<Uint8Array> {
  if (sealedBytes.length <= FRAME_MAGIC_MIN + 16) {
    throw new Error("Sealed payload too short");
  }
  const key = await crypto.subtle.importKey("raw", rawAesKey.slice(), { name: "AES-GCM" }, false, ["decrypt"]);
  const baseIv = sealedBytes.slice(0, 12);

  // Try framed format first
  try {
    const view = new DataView(sealedBytes.buffer, sealedBytes.byteOffset, sealedBytes.byteLength);
    let offset = 12;
    const chunks: Uint8Array[] = [];
    let expectedIdx = 0;

    while (offset + 8 <= sealedBytes.length) {
      const idx = view.getUint32(offset, true);
      const len = view.getUint32(offset + 4, true);
      offset += 8;
      if (idx !== expectedIdx || len < 16 || offset + len > sealedBytes.length) {
        throw new Error("Not framed");
      }
      const chunkCt = sealedBytes.slice(offset, offset + len);
      offset += len;

      // Chunk IV = base IV with BE64(index) XORed into bytes 4..12
      const iv = new Uint8Array(baseIv);
      const idxBig = BigInt(idx);
      for (let b = 0; b < 8; b++) {
        iv[11 - b] ^= Number((idxBig >> BigInt(b * 8)) & 0xffn);
      }

      const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, chunkCt));
      chunks.push(pt);
      expectedIdx++;
    }

    if (offset === sealedBytes.length && chunks.length > 0) {
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      const out = new Uint8Array(total);
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
      }
      return out;
    }
  } catch {
    // Fall back to legacy single-frame [12-byte IV][ciphertext+tag]
  }

  const legacyCt = sealedBytes.slice(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: baseIv }, key, legacyCt));
}

export async function decryptEntityText(entity: HavenEntity, vetKey: VetKey): Promise<string> {
  if (entity.clearText) return entity.clearText;
  if (!entity.sealedTextB64 || !entity.gateJson) {
    throw new Error("Entity has no sealed text or gate JSON");
  }
  const aesKey = unwrapAesKeyFromGateJson(entity.gateJson, vetKey);
  const sealedBytes = base64ToBytes(entity.sealedTextB64);
  const ptBytes = await openFramedAesGcm(sealedBytes, aesKey);
  // Strip Fairhaven zero-padding bucket bytes
  let end = ptBytes.length;
  while (end > 0 && ptBytes[end - 1] === 0) end--;
  const decoded = new TextDecoder().decode(ptBytes.slice(0, end));
  try {
    const obj = JSON.parse(decoded) as { t?: string };
    if (typeof obj.t === "string") return obj.t;
  } catch {
    // Plain UTF-8
  }
  return decoded;
}

export function resolveClearMediaUrl(config: HavenOsConfig, entity: HavenEntity): string | null {
  const fcid = entity.media?.fcid;
  if (!fcid) return null;
  const gw = config.ipfsGateway.replace(/\/+$/, "");
  return `${gw}/ipfs/${fcid}`;
}

export async function fetchAndDecryptEntityMedia(
  config: HavenOsConfig,
  entity: HavenEntity,
  vetKey?: VetKey,
): Promise<{ blobUrl: string; mimeType: string; bytes: number }> {
  if (entity.media?.fcid) {
    const url = resolveClearMediaUrl(config, entity)!;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`IPFS gateway returned HTTP ${res.status}`);
    const blob = await res.blob();
    return {
      blobUrl: URL.createObjectURL(blob),
      mimeType: entity.mimeType || blob.type || "application/octet-stream",
      bytes: blob.size,
    };
  }

  if (!entity.media?.piece) {
    throw new Error("Entity has no Filecoin piece or IPFS CID");
  }
  if (!entity.gateJson || !vetKey) {
    throw new Error("Unlock this gate's 30-day epoch key first to decrypt sealed Filecoin media");
  }

  const piece = entity.media.piece;
  const urls = [
    `${config.synapseBaseUrl.replace(/\/+$/, "")}/piece/${piece}`,
    `${config.ipfsGateway.replace(/\/+$/, "")}/ipfs/${piece}`,
  ];

  let cipherBytes: Uint8Array | null = null;
  let lastErr = "Failed to fetch encrypted bytes";
  for (const url of urls) {
    try {
      const headers: Record<string, string> = {};
      if (config.synapseApiKey && url.startsWith(config.synapseBaseUrl)) {
        headers["X-API-KEY"] = config.synapseApiKey;
      }
      const res = await fetch(url, { headers });
      if (res.ok) {
        cipherBytes = new Uint8Array(await res.arrayBuffer());
        break;
      }
      lastErr = `HTTP ${res.status} from ${new URL(url).host}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  if (!cipherBytes) {
    throw new Error(`Could not retrieve piece ${piece.slice(0, 16)}… (${lastErr})`);
  }

  const aesKey = unwrapAesKeyFromGateJson(entity.gateJson, vetKey);
  const plain = await openFramedAesGcm(cipherBytes, aesKey);
  const blob = new Blob([plain.slice()], { type: entity.mimeType || "application/octet-stream" });
  return {
    blobUrl: URL.createObjectURL(blob),
    mimeType: entity.mimeType || "application/octet-stream",
    bytes: plain.byteLength,
  };
}
