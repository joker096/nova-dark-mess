import { useState, useEffect, useCallback } from 'react';
import {
  isPremium,
  canUseFeature,
  checkoutPremium,
  ensureFirstMonthFree,
  freeDaysRemaining,
  getMinSubscriptionCost,
  resumePremiumCheckout,
  type PremiumFeature,
  type CheckoutResult,
} from '../lib/premium';

export type { PremiumFeature, CheckoutResult };

export function usePremium() {
  const [premium, setPremiumState] = useState<boolean>(isPremium());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    ensureFirstMonthFree();
    const resumed = await resumePremiumCheckout();
    if (resumed) {
      setPremiumState(true);
      return true;
    }
    const active = isPremium();
    setPremiumState(active);
    return active;
  }, []);

  useEffect(() => {
    ensureFirstMonthFree();
    void refresh();

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const checkout = useCallback(async (): Promise<CheckoutResult> => {
    setLoading(true);
    const result = await checkoutPremium();
    setLoading(false);
    if (result.ok) setPremiumState(isPremium());
    return result;
  }, []);

  const canUse = useCallback(
    (feature: PremiumFeature) => premium && canUseFeature(feature),
    [premium],
  );

  return {
    premium,
    loading,
    checkout,
    canUse,
    freeDaysRemaining,
    minSubscriptionCost: getMinSubscriptionCost(),
  };
}