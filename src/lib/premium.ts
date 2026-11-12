const PREMIUM_KEY = 'nova_premium_active';
const PREMIUM_EXPIRY_KEY = 'nova_premium_expiry';
const PREMIUM_FREE_UNTIL_KEY = 'nova_premium_free_until';
const FIRST_INSTALL_KEY = 'nova_first_install_ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_TRIAL_DAYS = 30;

/**
 * Minimum subscription price (in cents / smallest currency unit).
 * Kept deliberately low so early users are not put off.
 */
export const MIN_SUBSCRIPTION_COST = 49; // ~0.49 USD/EUR equivalent

export function isPremium(): boolean {
  try {
    // 1. Free trial period (first month for everyone)
    const freeUntil = localStorage.getItem(PREMIUM_FREE_UNTIL_KEY);
    if (freeUntil) {
      const exp = parseInt(freeUntil, 10);
      if (!isNaN(exp) && Date.now() <= exp) {
        return true;
      }
      localStorage.removeItem(PREMIUM_FREE_UNTIL_KEY);
    }

    // 2. Paid premium flag
    const flag = localStorage.getItem(PREMIUM_KEY);
    const expiry = localStorage.getItem(PREMIUM_EXPIRY_KEY);
    if (flag === 'true') {
      if (expiry) {
        const exp = parseInt(expiry, 10);
        if (!isNaN(exp) && Date.now() > exp) {
          localStorage.removeItem(PREMIUM_KEY);
          localStorage.removeItem(PREMIUM_EXPIRY_KEY);
          return false;
        }
      }
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export function setPremium(active: boolean, expiryMs?: number) {
  try {
    if (active) {
      localStorage.setItem(PREMIUM_KEY, 'true');
      if (expiryMs) localStorage.setItem(PREMIUM_EXPIRY_KEY, String(expiryMs));
    } else {
      localStorage.removeItem(PREMIUM_KEY);
      localStorage.removeItem(PREMIUM_EXPIRY_KEY);
    }
  } catch { /* ignore */ }
}

/**
 * Marks the first install timestamp and activates a 30-day free trial.
 * Safe to call on every app start — idempotent.
 */
export function ensureFirstMonthFree() {
  try {
    const already = localStorage.getItem(FIRST_INSTALL_KEY);
    if (already) return;
    const now = Date.now();
    localStorage.setItem(FIRST_INSTALL_KEY, String(now));
    localStorage.setItem(PREMIUM_FREE_UNTIL_KEY, String(now + FREE_TRIAL_DAYS * DAY_MS));
  } catch { /* ignore */ }
}

export function freeDaysRemaining(): number {
  try {
    const freeUntil = localStorage.getItem(PREMIUM_FREE_UNTIL_KEY);
    if (!freeUntil) return 0;
    const exp = parseInt(freeUntil, 10);
    if (isNaN(exp)) return 0;
    const remaining = Math.max(0, exp - Date.now());
    return Math.ceil(remaining / DAY_MS);
  } catch {
    return 0;
  }
}

export function canUseFeature(
  _feature:
    | 'chat_themes'
    | 'wallpaper'
    | 'date_picker'
    | 'location_sharing'
    | 'premium_stickers'
    | 'all',
): boolean {
  return isPremium();
}

export async function checkoutPremium(): Promise<boolean> {
  try {
    const paymento = (window as any).paymento;
    if (!paymento) {
      // Dev fallback: activate premium for 30 days
      setPremium(true, Date.now() + 30 * DAY_MS);
      return true;
    }
    const result = await paymento.checkout({
      plan: 'premium',
      amount: MIN_SUBSCRIPTION_COST,
      currency: 'usd',
    });
    if (result?.ok) {
      setPremium(true, Date.now() + 30 * DAY_MS);
      localStorage.removeItem(PREMIUM_FREE_UNTIL_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function getMinSubscriptionCost(): number {
  return MIN_SUBSCRIPTION_COST;
}
