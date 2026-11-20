/**
 * In-memory read-through cache for localStorage keys.
 *
 * localStorage is synchronous but blocks the main thread and, on mobile
 * WebViews, can be surprisingly slow. Frequently-read keys (read-chat state,
 * PIN attempt counter, privacy prefs, biometric credential id) are cached in
 * memory with a short TTL so repeated reads within the same event loop tick
 * or UI frame hit RAM instead of disk.
 *
 * Writes invalidate the cache entry so the next read re-fetches from
 * localStorage. The cache is intentionally small and scoped to known keys;
 * it is not a general localStorage wrapper.
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

const CACHE_TTL_MS = 2_000; // 2 s — short enough to stay fresh
const cache = new Map<string, CacheEntry<unknown>>();

function isExpired<T>(entry: CacheEntry<T>, now: number): boolean {
  return now > entry.expiry;
}

export function getCachedItem<T>(key: string, now = Date.now()): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && !isExpired(entry, now)) return entry.value;
  return null;
}

export function setCachedItem<T>(key: string, value: T, now = Date.now()): void {
  cache.set(key, { value, expiry: now + CACHE_TTL_MS });
}

export function invalidateCachedItem(key: string): void {
  cache.delete(key);
}

export function clearCache(): void {
  cache.clear();
}
