import { useState, useEffect, useCallback } from 'react';
import {
  isPremium,
  setPremium,
  canUseFeature,
  checkoutPremium,
  ensureFirstMonthFree,
  freeDaysRemaining,
  getMinSubscriptionCost,
} from '../lib/premium';

export type PremiumFeature = 'chat_themes' | 'wallpaper' | 'date_picker' | 'location_sharing' | 'all';

export function usePremium() {
  const [premium, setPremiumState] = useState<boolean>(isPremium());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ensureFirstMonthFree();
    setPremiumState(isPremium());
  }, []);

  const checkout = useCallback(async () => {
    setLoading(true);
    const ok = await checkoutPremium();
    setPremiumState(ok);
    setLoading(false);
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
