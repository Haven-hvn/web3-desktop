/**
 * Shared IndexedDB media / playback cache hosted by Haven OS (web3-desktop).
 *
 * Cross-origin embedded apps (*.pinme.dev iframes) share this single cache via
 * the `haven-os:v1` postMessage bridge so audio, video, images, and dance packs
 * don't have to be re-downloaded on every play or across different Haven apps.
 */

export interface CachedMediaRecord {
  key: string;
  bytes: ArrayBuffer;
  mimeType: string;
  size: number;
  encrypted: boolean;
  createdAt: number;
  lastAccessedAt: number;
  meta?: Record<string, unknown>;
}

export interface MediaCachePutInput {
  key: string;
  bytes: ArrayBuffer | Uint8Array | Blob;
  mimeType?: string;
  encrypted?: boolean;
  meta?: Record<string, unknown>;
}

export interface MediaCachePutResult {
  stored: boolean;
  size: number;
  evictedCount: number;
  reason?: string;
}

export interface MediaCacheStats {
  count: number;
  totalBytes: number;
  maxBytes: number;
}

const DB_NAME = "haven-os-media-cache";
const DB_VERSION = 1;
const STORE_NAME = "entries";

/** Default LRU cache budget: 512 MiB across all embedded Haven apps. */
export const DEFAULT_MEDIA_CACHE_MAX_BYTES = 512 * 1024 * 1024;
/** Maximum size of a single cached item: 256 MiB. */
export const MAX_MEDIA_CACHE_ENTRY_BYTES = 256 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("by_lastAccessedAt", "lastAccessedAt", { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

function normalizeKey(key: string): string {
  return key.trim();
}

async function toArrayBuffer(input: ArrayBuffer | Uint8Array | Blob): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) return input;
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return input.arrayBuffer();
  }
  const view = input as Uint8Array;
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength && view.buffer instanceof ArrayBuffer) {
    return view.buffer;
  }
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

export async function getCachedMedia(key: string): Promise<CachedMediaRecord | null> {
  const cleanKey = normalizeKey(key);
  if (!cleanKey) return null;
  const db = await openDb();
  if (!db) return null;

  return new Promise<CachedMediaRecord | null>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(cleanKey);

      getReq.onsuccess = () => {
        const record = getReq.result as CachedMediaRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        const updated: CachedMediaRecord = {
          ...record,
          lastAccessedAt: Date.now(),
        };
        try {
          store.put(updated);
        } catch {
          // Non-fatal if LRU timestamp touch fails
        }
        resolve(updated);
      };
      getReq.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function hasCachedMedia(key: string): Promise<boolean> {
  const cleanKey = normalizeKey(key);
  if (!cleanKey) return false;
  const db = await openDb();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getKey(cleanKey);
      req.onsuccess = () => resolve(req.result !== undefined);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function putCachedMedia(
  input: MediaCachePutInput,
  maxBytes = DEFAULT_MEDIA_CACHE_MAX_BYTES,
): Promise<MediaCachePutResult> {
  const cleanKey = normalizeKey(input.key);
  if (!cleanKey) {
    return { stored: false, size: 0, evictedCount: 0, reason: "Empty cache key" };
  }

  const buffer = await toArrayBuffer(input.bytes);
  const size = buffer.byteLength;
  if (size === 0) {
    return { stored: false, size: 0, evictedCount: 0, reason: "Empty payload" };
  }
  if (size > MAX_MEDIA_CACHE_ENTRY_BYTES || size > maxBytes) {
    return {
      stored: false,
      size,
      evictedCount: 0,
      reason: `Payload (${size} bytes) exceeds max cache entry size`,
    };
  }

  const db = await openDb();
  if (!db) {
    return { stored: false, size, evictedCount: 0, reason: "IndexedDB unavailable" };
  }

  return new Promise<MediaCachePutResult>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_lastAccessedAt");

      // Gather existing entries ordered oldest-accessed first for LRU eviction
      const existing: Array<{ key: string; size: number }> = [];
      let totalBytes = 0;

      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const val = cursor.value as CachedMediaRecord;
          if (val.key !== cleanKey) {
            existing.push({ key: val.key, size: val.size });
            totalBytes += val.size;
          }
          cursor.continue();
          return;
        }

        // Evict oldest entries until the new entry fits within maxBytes
        let evictedCount = 0;
        for (const item of existing) {
          if (totalBytes + size <= maxBytes) break;
          store.delete(item.key);
          totalBytes -= item.size;
          evictedCount++;
        }

        const now = Date.now();
        const record: CachedMediaRecord = {
          key: cleanKey,
          bytes: buffer,
          mimeType: input.mimeType || "application/octet-stream",
          size,
          encrypted: Boolean(input.encrypted),
          createdAt: now,
          lastAccessedAt: now,
          ...(input.meta ? { meta: input.meta } : {}),
        };
        store.put(record);

        tx.oncomplete = () => resolve({ stored: true, size, evictedCount });
        tx.onerror = () =>
          resolve({
            stored: false,
            size,
            evictedCount,
            reason: tx.error?.message || "IndexedDB write failed",
          });
        tx.onabort = () =>
          resolve({
            stored: false,
            size,
            evictedCount,
            reason: tx.error?.message || "IndexedDB transaction aborted",
          });
      };

      cursorReq.onerror = () =>
        resolve({ stored: false, size, evictedCount: 0, reason: "Failed to scan cache index" });
    } catch (err) {
      resolve({
        stored: false,
        size,
        evictedCount: 0,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export async function deleteCachedMedia(key: string): Promise<void> {
  const cleanKey = normalizeKey(key);
  if (!cleanKey) return;
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(cleanKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearMediaCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getMediaCacheStats(
  maxBytes = DEFAULT_MEDIA_CACHE_MAX_BYTES,
): Promise<MediaCacheStats> {
  const db = await openDb();
  if (!db) return { count: 0, totalBytes: 0, maxBytes };

  return new Promise<MediaCacheStats>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      let count = 0;
      let totalBytes = 0;

      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const val = cursor.value as CachedMediaRecord;
          count++;
          totalBytes += val.size || 0;
          cursor.continue();
          return;
        }
        resolve({ count, totalBytes, maxBytes });
      };
      cursorReq.onerror = () => resolve({ count: 0, totalBytes: 0, maxBytes });
    } catch {
      resolve({ count: 0, totalBytes: 0, maxBytes });
    }
  });
}
