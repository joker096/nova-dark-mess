/**
 * Lightweight API Cache Layer
 *
 * Provides:
 * - Deduplication of concurrent requests for same key
 * - TTL-based expiration with stale-while-revalidate
 * - Background refetch on stale data
 * - Manual invalidation
 * - Type-safe fetcher functions
 */

type Fetcher<T> = () => Promise<T>;
type CacheEntry<T> = { data: T; timestamp: number; promise?: Promise<T> };

export interface CacheOptions {
  ttl?: number;           // Time to live in ms (default: 30s)
  staleWhileRevalidate?: boolean; // Serve stale data while refetching (default: true)
  dedupe?: boolean;       // Deduplicate concurrent requests (default: true)
}

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  ttl: 30_000,
  staleWhileRevalidate: true,
  dedupe: true,
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Core cached fetch function
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: Fetcher<T>,
  options: CacheOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  // Return fresh cached data
  if (entry && now - entry.timestamp < opts.ttl) {
    return entry.data;
  }

  // Return stale data immediately if enabled
  if (entry && opts.staleWhileRevalidate) {
    // Trigger background refetch
    if (!entry.promise) {
      entry.promise = fetcher()
        .then((data) => {
          cache.set(key, { data, timestamp: Date.now() });
          return data;
        })
        .catch(() => {
          // This refresh has no caller to receive the rejection. Keep the
          // stale value instead, otherwise an aborted background refetch
          // (for example when a LinkPreview unmounts) becomes an unhandled
          // promise rejection.
          entry.promise = undefined;
          return entry.data;
        });
    }
    return entry.data;
  }

  // Deduplicate concurrent requests
  if (opts.dedupe) {
    const existing = inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fetcher()
      .then((data) => {
        cache.set(key, { data, timestamp: Date.now() });
        inflight.delete(key);
        return data;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });

    inflight.set(key, promise);
    return promise;
  }

  // No dedupe - just fetch
  const data = await fetcher();
  cache.set(key, { data, timestamp: now });
  return data;
}

/**
 * Invalidate a specific cache key
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
  inflight.delete(key);
}

/**
 * Invalidate all keys matching a prefix
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      inflight.delete(key);
    }
  }
}

/**
 * Clear entire cache
 */
export function clearCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Prefetch data without returning (fire-and-forget)
 */
export function prefetch<T>(key: string, fetcher: Fetcher<T>, options: CacheOptions = {}): void {
  cachedFetch(key, fetcher, options).catch(() => {
    // Silently ignore prefetch failures
  });
}

/**
 * Get cached data without fetching (synchronous)
 */
export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  return entry?.data;
}

/**
 * Check if key has fresh data
 */
export function hasFreshData(key: string, ttl = 30_000): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}

/**
 * React hook for cached data with loading/error states
 */
import { useState, useEffect, useCallback } from 'react';

export function useCachedFetch<T>(
  key: string,
  fetcher: Fetcher<T>,
  options: CacheOptions & { enabled?: boolean; initialData?: T } = {}
) {
  const { enabled = true, initialData, ...fetchOptions } = options;
  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await cachedFetch(key, fetcher, fetchOptions);
      setData(result);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [key, enabled, fetcher, fetchOptions.ttl, fetchOptions.staleWhileRevalidate, fetchOptions.dedupe]);

  useEffect(() => {
    if (enabled) {
      fetch();
    }
  }, [fetch, enabled]);

  const refetch = useCallback(async () => {
    invalidateCache(key);
    await fetch();
  }, [key, fetch]);

  return { data, isLoading, error, refetch };
}

/**
 * Mutation helper - invalidates related cache keys after mutation
 */
export async function mutateAndInvalidate<T>(
  mutation: () => Promise<T>,
  invalidateKeys: string[]
): Promise<T> {
  const result = await mutation();
  invalidateKeys.forEach(invalidateCache);
  return result;
}

/**
 * Cache statistics for debugging
 */
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
    inflight: inflight.size,
  };
}