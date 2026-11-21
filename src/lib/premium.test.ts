import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MIN_SUBSCRIPTION_COST,
  PREMIUM_FEATURES,
  canUseFeature,
  checkoutPremium,
  activatePremiumLicense,
  ensureFirstMonthFree,
  freeDaysRemaining,
  getMinSubscriptionCost,
  isPremium,
  purchasePremiumGiftCode,
  setPremium,
  type PremiumFeature,
} from './premium';

const KEYS = [
  'nova_premium_active',
  'nova_premium_expiry',
  'nova_premium_free_until',
  'nova_first_install_ts',
  'nova_device_id',
  'nova_premium_license',
  'nova_premium_verified_at',
  'nova_premium_pending_order',
  'nova_premium_pending_gift_order',
] as const;

beforeEach(() => {
  for (const key of KEYS) localStorage.removeItem(key);
});

afterEach(() => {
  for (const key of KEYS) localStorage.removeItem(key);
  // Remove a paymento stub installed by an individual test.
  delete (window as unknown as Record<string, unknown>).paymento;
});

describe('isPremium (negative / empty state)', () => {
  it('returns false when nothing is stored', () => {
    expect(isPremium()).toBe(false);
  });

  it('returns false when the flag holds a non-"true" value', () => {
    localStorage.setItem('nova_premium_active', 'yes');
    expect(isPremium()).toBe(false);
  });

  it('returns false and self-heals when the paid expiry is in the past', () => {
    localStorage.setItem('nova_premium_active', 'true');
    localStorage.setItem('nova_premium_expiry', String(Date.now() - 1));
    expect(isPremium()).toBe(false);
    expect(localStorage.getItem('nova_premium_active')).toBeNull();
    expect(localStorage.getItem('nova_premium_expiry')).toBeNull();
  });

  it('ignores a corrupt (non-numeric) expiry and stays active', () => {
    localStorage.setItem('nova_premium_active', 'true');
    localStorage.setItem('nova_premium_expiry', 'not-a-number');
    expect(isPremium()).toBe(true);
  });

  it('returns true while the free trial is active, without a paid flag', () => {
    localStorage.setItem('nova_premium_free_until', String(Date.now() + 60_000));
    expect(isPremium()).toBe(true);
  });

  it('returns false and removes an expired free-trial marker', () => {
    localStorage.setItem('nova_premium_free_until', String(Date.now() - 1));
    expect(isPremium()).toBe(false);
    expect(localStorage.getItem('nova_premium_free_until')).toBeNull();
  });

  it('ignores a corrupt free-trial marker', () => {
    localStorage.setItem('nova_premium_free_until', 'garbage');
    expect(isPremium()).toBe(false);
  });

  it('degrades gracefully when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(isPremium()).toBe(false);
    spy.mockRestore();
  });
});

describe('setPremium', () => {
  it('activates premium without an expiry', () => {
    setPremium(true);
    expect(localStorage.getItem('nova_premium_active')).toBe('true');
    expect(localStorage.getItem('nova_premium_expiry')).toBeNull();
    expect(isPremium()).toBe(true);
  });

  it('stores a future expiry and stays active', () => {
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    setPremium(true, expiry);
    expect(localStorage.getItem('nova_premium_expiry')).toBe(String(expiry));
    expect(isPremium()).toBe(true);
  });

  it('deactivating removes both flag and expiry', () => {
    setPremium(true, Date.now() + 1000);
    setPremium(false);
    expect(localStorage.getItem('nova_premium_active')).toBeNull();
    expect(localStorage.getItem('nova_premium_expiry')).toBeNull();
    expect(isPremium()).toBe(false);
  });

  it('deactivating after expiry keeps premium off', () => {
    setPremium(true, Date.now() - 1000);
    setPremium(false);
    expect(isPremium()).toBe(false);
  });
});

describe('ensureFirstMonthFree', () => {
  it('records the first install and starts a ~30 day trial', () => {
    const before = Date.now();
    ensureFirstMonthFree();
    const install = Number(localStorage.getItem('nova_first_install_ts'));
    const freeUntil = Number(localStorage.getItem('nova_premium_free_until'));
    expect(install).toBeGreaterThanOrEqual(before);
    expect(freeUntil).toBeGreaterThan(install);
    // 30 days, allow a small clock skew of a second.
    expect(freeUntil - install).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
    expect(isPremium()).toBe(true);
  });

  it('is idempotent — a second call does not move the timestamps', () => {
    ensureFirstMonthFree();
    const install = localStorage.getItem('nova_first_install_ts');
    const freeUntil = localStorage.getItem('nova_premium_free_until');
    ensureFirstMonthFree();
    expect(localStorage.getItem('nova_first_install_ts')).toBe(install);
    expect(localStorage.getItem('nova_premium_free_until')).toBe(freeUntil);
  });
});

describe('freeDaysRemaining', () => {
  it('returns 0 when no trial marker exists', () => {
    expect(freeDaysRemaining()).toBe(0);
  });

  it('returns 0 for a corrupt marker', () => {
    localStorage.setItem('nova_premium_free_until', 'abc');
    expect(freeDaysRemaining()).toBe(0);
  });

  it('counts remaining trial days', () => {
    localStorage.setItem(
      'nova_premium_free_until',
      String(Date.now() + 5 * 24 * 60 * 60 * 1000),
    );
    expect(freeDaysRemaining()).toBeGreaterThanOrEqual(5);
    expect(freeDaysRemaining()).toBeLessThanOrEqual(6);
  });

  it('never returns a negative number for an expired trial', () => {
    localStorage.setItem('nova_premium_free_until', String(Date.now() - 10 * 24 * 60 * 60 * 1000));
    expect(freeDaysRemaining()).toBe(0);
  });
});

describe('canUseFeature', () => {
  it('denies every sold feature without premium', () => {
    for (const feature of PREMIUM_FEATURES) {
      expect(canUseFeature(feature)).toBe(false);
    }
  });

  it('allows every sold feature with premium', () => {
    setPremium(true);
    for (const feature of PREMIUM_FEATURES) {
      expect(canUseFeature(feature)).toBe(true);
    }
  });

  it('rejects an unknown feature name even with premium', () => {
    setPremium(true);
    expect(canUseFeature('live_location' as PremiumFeature)).toBe(false);
    expect(canUseFeature('' as PremiumFeature)).toBe(false);
  });
});

describe('checkoutPremium', () => {
  beforeEach(() => {
    // jsdom window.open returns null by default; stub it to a truthy popup.
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true immediately when already premium', async () => {
    setPremium(true, Date.now() + 60_000);
    await expect(checkoutPremium()).resolves.toBe(true);
  });

  it('returns false when the checkout endpoint is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(checkoutPremium()).resolves.toBe(false);
    expect(isPremium()).toBe(false);
  });

  it('returns false when the server rejects the checkout request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 503, json: async () => ({ ok: false, error: 'payments disabled' }),
    }));
    await expect(checkoutPremium()).resolves.toBe(false);
    expect(isPremium()).toBe(false);
  });

  it('returns false when the order never reaches paid status', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, orderId: 'ord-1', url: 'https://pay.example/x' }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'pending' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkoutPremium({ pollIntervalMs: 1, pollTimeoutMs: 5 })).resolves.toBe(false);
  });
});

describe('premium gifts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a gift order, polls it, and retains it until delivery is saved', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const giftCode = `NOVA-GIFT-${'A'.repeat(32)}`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, orderId: 'ord-gift-1', url: 'https://pay.example/gift' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, status: 'paid', giftCode }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(purchasePremiumGiftCode('peer-1', { pollIntervalMs: 0, pollTimeoutMs: 20 }))
      .resolves.toEqual({ ok: true, giftCode });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/premium/gift/checkout');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      device: expect.stringMatching(/^dev_[a-f0-9]{32}$/),
    });
    expect(localStorage.getItem('nova_premium_pending_gift_order')).toContain('"contactId":"peer-1"');
  });

  it('resumes an already paid gift order without reopening the payment page', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const giftCode = `NOVA-GIFT-${'D'.repeat(32)}`;
    localStorage.setItem('nova_premium_pending_gift_order', JSON.stringify({
      orderId: 'ord-gift-resume',
      url: 'https://pay.example/gift',
      contactId: 'peer-1',
      createdAt: Date.now(),
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: 'paid', giftCode }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(purchasePremiumGiftCode('peer-1')).resolves.toEqual({ ok: true, giftCode });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('redeems a gift code on the recipient device and stores only that device license', async () => {
    const device = 'dev_recipient_123';
    localStorage.setItem('nova_device_id', device);
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const payload = btoa(JSON.stringify({ v: 1, d: device, p: 'premium', o: 'gift_ord', exp: expiresAt }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const license = `MA1.${payload}.signature`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, license, expiresAt }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, expiresAt, plan: 'premium' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await activatePremiumLicense(`NOVA-GIFT-${'B'.repeat(32)}`);

    expect(result).toEqual({ ok: true, expiresAt });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/premium/gift/redeem');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      code: `NOVA-GIFT-${'B'.repeat(32)}`,
      device,
    });
    expect(localStorage.getItem('nova_premium_license')).toBe(license);
    expect(isPremium()).toBe(true);
  });

  it('extends an active recipient license instead of consuming its remaining days', async () => {
    const device = 'dev_recipient_456';
    localStorage.setItem('nova_device_id', device);
    const currentExpiresAt = Date.now() + 10 * 24 * 60 * 60 * 1000;
    const currentPayload = btoa(JSON.stringify({
      v: 1,
      d: device,
      p: 'premium',
      o: 'previous_order',
      exp: currentExpiresAt,
    }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const currentLicense = `MA1.${currentPayload}.signature`;
    localStorage.setItem('nova_premium_license', currentLicense);

    const expiresAt = currentExpiresAt + 30 * 24 * 60 * 60 * 1000;
    const giftedPayload = btoa(JSON.stringify({
      v: 1,
      d: device,
      p: 'premium',
      o: 'gift_order',
      exp: expiresAt,
    }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const license = `MA1.${giftedPayload}.signature`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, license, expiresAt }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, expiresAt, plan: 'premium' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(activatePremiumLicense(`NOVA-GIFT-${'C'.repeat(32)}`))
      .resolves.toMatchObject({ ok: true, expiresAt });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      code: `NOVA-GIFT-${'C'.repeat(32)}`,
      device,
      currentLicense,
    });
  });
});

describe('pricing constants', () => {
  it('exposes a low, positive micro-subscription price', () => {
    expect(MIN_SUBSCRIPTION_COST).toBe(390);
    expect(getMinSubscriptionCost()).toBe(MIN_SUBSCRIPTION_COST);
  });

  it('never gates safety features behind the subscription', () => {
    const sold = PREMIUM_FEATURES as readonly string[];
    for (const safety of [
      'calls',
      'messaging',
      'live_location',
      'disappearing_messages',
    ]) {
      expect(sold).not.toContain(safety);
    }
  });

  it('keeps calls and messaging working after the free plan ends', () => {
    localStorage.setItem('nova_premium_free_until', String(Date.now() - 1));
    expect(isPremium()).toBe(false);
    // Nothing a free user needs to reach people is sold as a feature.
    expect(canUseFeature('messaging' as PremiumFeature)).toBe(false);
    expect(canUseFeature('calls' as PremiumFeature)).toBe(false);
    // ...and the premium-only extras stay locked, so the plan does not leak.
    for (const feature of PREMIUM_FEATURES) {
      expect(canUseFeature(feature)).toBe(false);
    }
  });
});
