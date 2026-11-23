import { describe, expect, it, vi } from 'vitest';
import { cachedFetch, clearCache } from './cache';

describe('cachedFetch stale-while-revalidate', () => {
  it('keeps the stale value when the background refresh rejects', async () => {
    clearCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('refresh failed'));

    await expect(cachedFetch('preview:test', fetcher, { ttl: 0 })).resolves.toBe('first');
    await expect(cachedFetch('preview:test', fetcher, { ttl: 0 })).resolves.toBe('first');

    // Let the unobserved refresh settle. A rethrown rejection here would surface
    // as an unhandled rejection and fail the test run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
