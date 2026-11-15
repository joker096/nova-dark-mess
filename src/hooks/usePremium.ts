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
} from '../lib/premium';

export type { PremiumFeature };

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

  const checkout = useCallback(async () => {
    setLoading(true);
    const ok = await checkoutPremium();
    setLoading(false);
    setPremiumState(isPremium());
    return ok;
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