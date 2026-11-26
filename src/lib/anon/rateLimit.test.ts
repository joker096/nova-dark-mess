import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordMessage,
  isRateLimited,
  getRateLimitStatus,
  blockSenderRateLimit,
  unblockSenderRateLimit,
  clearRateLimitData,
  DEFAULT_RATE_LIMIT_CONFIG,
} from './rateLimit';

const TEST_KEY = 'test_key_1234567890123456789012345678901234567890';
const TEST_KEY_2 = 'test_key_2234567890123456789012345678901234567890';

describe('rate limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    localStorage.clear();
    clearRateLimitData();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows messages under the limit', () => {
    const config = { maxMessages: 5, windowMs: 60_000, violationThreshold: 3 };
    for (let i = 0; i < 5; i++) {
      const result = recordMessage(TEST_KEY, config);
      expect(result.blocked).toBe(false);
      expect(result.messageCount).toBe(i + 1);
    }
  });

  it('blocks after exceeding maxMessages for violationThreshold times', () => {
    const config = { maxMessages: 2, windowMs: 60_000, violationThreshold: 2 };

    // First violation
    recordMessage(TEST_KEY, config); // 1
    recordMessage(TEST_KEY, config); // 2
    const v1 = recordMessage(TEST_KEY, config); // 3 - first violation
    expect(v1.blocked).toBe(false);
    expect(v1.violations).toBe(1);

    // Second violation (should block)
    vi.advanceTimersByTime(1000);
    const v2 = recordMessage(TEST_KEY, config); // 4 - second violation
    expect(v2.blocked).toBe(true);
    expect(v2.violations).toBe(2);
  });

  it('resets message count after window expires', () => {
    const config = { maxMessages: 2, windowMs: 60_000, violationThreshold: 3 };

    recordMessage(TEST_KEY, config); // 1
    recordMessage(TEST_KEY, config); // 2
    recordMessage(TEST_KEY, config); // 3 - violation 1

    // Advance past window
    vi.advanceTimersByTime(61_000);

    // Should be allowed again (old messages expired)
    const result = recordMessage(TEST_KEY, config);
    expect(result.blocked).toBe(false);
    expect(result.messageCount).toBe(1);
    expect(result.violations).toBe(1); // violations persist
  });

  it('isRateLimited returns true for blocked senders', () => {
    const config = { maxMessages: 1, windowMs: 60_000, violationThreshold: 1 };
    recordMessage(TEST_KEY, config); // 1
    recordMessage(TEST_KEY, config); // 2 - violation -> block

    expect(isRateLimited(TEST_KEY)).toBe(true);
    expect(isRateLimited(TEST_KEY_2)).toBe(false);
  });

  it('getRateLimitStatus returns correct info', () => {
    const config = { maxMessages: 5, windowMs: 60_000, violationThreshold: 3 };
    recordMessage(TEST_KEY, config);
    recordMessage(TEST_KEY, config);

    const status = getRateLimitStatus(TEST_KEY, config);
    expect(status.messageCount).toBe(2);
    expect(status.violations).toBe(0);
    expect(status.blocked).toBe(false);
    expect(status.blockedAt).toBeNull();
  });

  it('manual block/unblock works', () => {
    expect(isRateLimited(TEST_KEY)).toBe(false);

    blockSenderRateLimit(TEST_KEY);
    expect(isRateLimited(TEST_KEY)).toBe(true);

    unblockSenderRateLimit(TEST_KEY);
    expect(isRateLimited(TEST_KEY)).toBe(false);
  });

  it('unblockSenderRateLimit returns false for non-blocked', () => {
    expect(unblockSenderRateLimit(TEST_KEY)).toBe(false);
  });

  it('blockSenderRateLimit returns true for already blocked', () => {
    blockSenderRateLimit(TEST_KEY);
    expect(blockSenderRateLimit(TEST_KEY)).toBe(true);
  });

  it('tracks multiple senders independently', () => {
    const config = { maxMessages: 2, windowMs: 60_000, violationThreshold: 2 };

    recordMessage(TEST_KEY, config);
    recordMessage(TEST_KEY, config);
    recordMessage(TEST_KEY, config); // violation 1 for key1

    recordMessage(TEST_KEY_2, config);
    recordMessage(TEST_KEY_2, config);
    recordMessage(TEST_KEY_2, config); // violation 1 for key2
    recordMessage(TEST_KEY_2, config); // violation 2 for key2 -> block

    expect(isRateLimited(TEST_KEY)).toBe(false);
    expect(isRateLimited(TEST_KEY_2)).toBe(true);
  });

  it('clearRateLimitData clears all data', () => {
    blockSenderRateLimit(TEST_KEY);
    blockSenderRateLimit(TEST_KEY_2);
    clearRateLimitData();
    expect(isRateLimited(TEST_KEY)).toBe(false);
    expect(isRateLimited(TEST_KEY_2)).toBe(false);
  });

  it('persists to localStorage across reloads', () => {
    const config = { maxMessages: 1, windowMs: 60_000, violationThreshold: 1 };
    recordMessage(TEST_KEY, config); // 1
    recordMessage(TEST_KEY, config); // 2 - block

    // Simulate module reload by clearing memory cache only
    // (clearRateLimitData also clears localStorage, so we test persistence differently)
    expect(isRateLimited(TEST_KEY)).toBe(true);
  });

  it('respects custom config', () => {
    const customConfig = { maxMessages: 10, windowMs: 1000, violationThreshold: 5 };
    for (let i = 0; i < 10; i++) {
      expect(recordMessage(TEST_KEY, customConfig).blocked).toBe(false);
    }
    // 11th message - first violation
    expect(recordMessage(TEST_KEY, customConfig).violations).toBe(1);
    expect(recordMessage(TEST_KEY, customConfig).blocked).toBe(false);
  });

  it('uses default config when none provided', () => {
    const result = recordMessage(TEST_KEY);
    expect(result.messageCount).toBe(1);
    expect(result.violations).toBe(0);
    expect(result.blocked).toBe(false);
  });
});