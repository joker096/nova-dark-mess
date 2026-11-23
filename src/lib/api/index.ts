/**
 * API Cache Layer
 * Lightweight caching with deduplication, TTL, and stale-while-revalidate
 */

export {
  cachedFetch,
  invalidateCache,
  invalidateCachePrefix,
  clearCache,
  prefetch,
  getCached,
  hasFreshData,
  useCachedFetch,
  mutateAndInvalidate,
  getCacheStats,
} from './cache';
export type { CacheOptions } from './cache';