/**
 * Bounded LRU cache for media blobs (thumbnails, previews, file data).
 *
 * Media is stored in memory only and evicted on an LRU basis when the cache
 * reaches its entry or byte cap. This keeps memory usage predictable on
 * low-end Android devices where the WebView heap is limited.
 *
 * Entries are keyed by an opaque string (URL, transferId, or content hash).
 * Values are `Uint8Array` payloads. The cache tracks both entry count and
 * total byte size, evicting the least recently used entries when either cap
 * is exceeded.
 */

export interface MediaCacheEntry {
  /** The media payload. */
  data: Uint8Array;
  /** MIME type of the payload. */
  mime: string;
  /** Size in bytes. */
  size: number;
  /** Last access timestamp (ms). */
  lastAccessed: number;
}

export interface MediaCacheOptions {
  /** Maximum number of entries. Defaults to 100. */
  maxEntries?: number;
  /** Maximum total bytes. Defaults to 20 MiB. */
  maxBytes?: number;
}

/**
 * Creates a bounded LRU media cache.
 *
 * When either `maxEntries` or `maxBytes` is exceeded, the least recently
 * used entries are evicted until both caps are satisfied.
 */
export function createMediaCache(options: MediaCacheOptions = {}) {
  const maxEntries = options.maxEntries ?? 100;
  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;

  const entries = new Map<string, MediaCacheEntry>();
  let totalBytes = 0;

  function evictIfNeeded(): void {
    // Never evict the last entry: a single oversized payload is still stored.
    while (
      entries.size > 1 &&
      (entries.size > maxEntries || totalBytes > maxBytes)
    ) {
      const first = entries.keys().next().value;
      if (first === undefined) break;
      const entry = entries.get(first)!;
      totalBytes -= entry.size;
      entries.delete(first);
    }
  }

  /**
   * Stores media data under `key`. Overwrites any existing entry for the same
   * key. Evicts LRU entries if caps are exceeded.
   */
  function set(key: string, data: Uint8Array, mime: string): void {
    const size = data.byteLength;
    if (size > maxBytes) {
      // A single entry larger than the byte cap is still stored (it is the
      // only entry), but everything else is evicted.
      entries.clear();
      totalBytes = 0;
    } else {
      // Remove any existing entry for this key first.
      const existing = entries.get(key);
      if (existing) {
        totalBytes -= existing.size;
        entries.delete(key);
      }
      // Evict LRU entries until there is room.
      while (entries.size >= maxEntries || totalBytes + size > maxBytes) {
        const first = entries.keys().next().value;
        if (first === undefined) break;
        const old = entries.get(first)!;
        totalBytes -= old.size;
        entries.delete(first);
      }
    }
    entries.set(key, { data, mime, size, lastAccessed: Date.now() });
    totalBytes += size;
    evictIfNeeded();
  }

  /**
   * Retrieves media data by key and marks it as recently used. Returns null
   * when no entry exists for the key.
   */
  function get(key: string): MediaCacheEntry | null {
    const entry = entries.get(key);
    if (!entry) return null;
    entry.lastAccessed = Date.now();
    // Move to end of insertion order (most recently used).
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }

  /** Returns true when an entry exists for the key. */
  function has(key: string): boolean {
    return entries.has(key);
  }

  /** Removes an entry by key. */
  function remove(key: string): void {
    const entry = entries.get(key);
    if (entry) {
      totalBytes -= entry.size;
      entries.delete(key);
    }
  }

  /** Clears all entries. */
  function clear(): void {
    entries.clear();
    totalBytes = 0;
  }

  /** Returns the current number of entries. */
  function size(): number {
    return entries.size;
  }

  /** Returns the current total bytes stored. */
  function byteSize(): number {
    return totalBytes;
  }

  /** Returns all keys ordered from least to most recently used. */
  function keys(): string[] {
    return Array.from(entries.keys());
  }

  return {
    set,
    get,
    has,
    remove,
    clear,
    size,
    byteSize,
    keys,
    maxEntries,
    maxBytes,
  };
}

export type MediaCache = ReturnType<typeof createMediaCache>;
