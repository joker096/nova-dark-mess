import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isPremium,
  setPremium,
  canUseFeature,
  checkoutPremium,
  ensureFirstMonthFree,
  freeDaysRemaining,
  MIN_SUBSCRIPTION_COST,
  getMinSubscriptionCost,
} from '../lib/premium';

const PREMIUM_KEY = 'nova_premium_active';
const PREMIUM_EXPIRY_KEY = 'nova_premium_expiry';
const PREMIUM_FREE_UNTIL_KEY = 'nova_premium_free_until';
const FIRST_INSTALL_KEY = 'nova_first_install_ts';

beforeEach(() => {
  localStorage.removeItem(PREMIUM_KEY);
  localStorage.removeItem(PREMIUM_EXPIRY_KEY);
  localStorage.removeItem(PREMIUM_FREE_UNTIL_KEY);
  localStorage.removeItem(FIRST_INSTALL_KEY);
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.removeItem(PREMIUM_KEY);
  localStorage.removeItem(PREMIUM_EXPIRY_KEY);
  localStorage.removeItem(PREMIUM_FREE_UNTIL_KEY);
  localStorage.removeItem(FIRST_INSTALL_KEY);
});

describe('premium lib', () => {
  it('isPremium returns false when no flag set', () => {
    expect(isPremium()).toBe(false);
  });

  it('setPremium(true) activates and isPremium returns true', () => {
    setPremium(true);
    expect(isPremium()).toBe(true);
    expect(localStorage.getItem(PREMIUM_KEY)).toBe('true');
  });

  it('setPremium(false) deactivates', () => {
    setPremium(true);
    setPremium(false);
    expect(isPremium()).toBe(false);
  });

  it('expired premium is treated as inactive', () => {
    const past = Date.now() - 1000;
    setPremium(true, past);
    expect(isPremium()).toBe(false);
  });

  it('future expiry stays active', () => {
    const future = Date.now() + 30 * 24 * 60 * 60 * 1000;
    setPremium(true, future);
    expect(isPremium()).toBe(true);
  });

  it('canUseFeature returns false without premium', () => {
    expect(canUseFeature('chat_themes')).toBe(false);
  });

  it('canUseFeature returns true with premium', () => {
    setPremium(true);
    expect(canUseFeature('chat_themes')).toBe(true);
  });

  it('checkoutPremium activates premium without paymento', async () => {
    const ok = await checkoutPremium();
    expect(ok).toBe(true);
    expect(isPremium()).toBe(true);
  });

  it('checkoutPremium uses paymento when available', async () => {
    const mockCheckout = vi.fn().mockResolvedValue({ ok: true });
    (window as any).paymento = { checkout: mockCheckout };
    const ok = await checkoutPremium();
    expect(mockCheckout).toHaveBeenCalledWith({
      plan: 'premium',
      amount: MIN_SUBSCRIPTION_COST,
      currency: 'usd',
    });
    expect(ok).toBe(true);
    expect(isPremium()).toBe(true);
  });

  it('ensureFirstMonthFree activates free trial and sets first install', () => {
    expect(localStorage.getItem(FIRST_INSTALL_KEY)).toBeNull();
    expect(localStorage.getItem(PREMIUM_FREE_UNTIL_KEY)).toBeNull();

    ensureFirstMonthFree();

    const firstInstall = localStorage.getItem(FIRST_INSTALL_KEY);
    const freeUntil = localStorage.getItem(PREMIUM_FREE_UNTIL_KEY);
    expect(firstInstall).not.toBeNull();
    expect(freeUntil).not.toBeNull();
    expect(parseInt(freeUntil!, 10)).toBeGreaterThan(Date.now());
  });

  it('ensureFirstMonthFree is idempotent', () => {
    ensureFirstMonthFree();
    const first = localStorage.getItem(FIRST_INSTALL_KEY);
    ensureFirstMonthFree();
    expect(localStorage.getItem(FIRST_INSTALL_KEY)).toBe(first);
  });

  it('isPremium returns true during free trial without paid flag', () => {
    const now = Date.now();
    localStorage.setItem(PREMIUM_FREE_UNTIL_KEY, String(now + 10 * 24 * 60 * 60 * 1000));
    expect(isPremium()).toBe(true);
  });

  it('isPremium returns false after free trial expired', () => {
    const past = Date.now() - 1000;
    localStorage.setItem(PREMIUM_FREE_UNTIL_KEY, String(past));
    expect(isPremium()).toBe(false);
  });

  it('freeDaysRemaining returns days left in trial', () => {
    const now = Date.now();
    localStorage.setItem(PREMIUM_FREE_UNTIL_KEY, String(now + 5 * 24 * 60 * 60 * 1000));
    expect(freeDaysRemaining()).toBeGreaterThanOrEqual(5);
  });

  it('freeDaysRemaining returns 0 when no trial', () => {
    expect(freeDaysRemaining()).toBe(0);
  });

  it('MIN_SUBSCRIPTION_COST is a low minimum price', () => {
    expect(MIN_SUBSCRIPTION_COST).toBeGreaterThan(0);
    expect(MIN_SUBSCRIPTION_COST).toBeLessThanOrEqual(99);
  });

  it('getMinSubscriptionCost returns the constant', () => {
    expect(getMinSubscriptionCost()).toBe(MIN_SUBSCRIPTION_COST);
  });
});
