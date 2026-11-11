import { useEffect, useCallback } from 'react';
import { localAnalytics, type AnalyticsEvent } from '../lib/analytics/localAnalytics';

export function useAnalytics() {
  const track = useCallback((event: AnalyticsEvent) => {
    localAnalytics.track(event);
  }, []);

  useEffect(() => {
    localAnalytics.track({ type: 'app_open', timestamp: Date.now() });
    return () => {
      localAnalytics.track({ type: 'app_close', timestamp: Date.now() });
      localAnalytics.save();
    };
  }, []);

  return {
    track,
    getEvents: () => localAnalytics.getEvents(),
    getStats: () => localAnalytics.getEventCountsByType(),
  };
}
