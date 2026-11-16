import React, { useEffect, useState } from 'react';
import { loadBlockingSanction, SANCTION_CHANGED_EVENT } from '../lib/moderation/store';
import { SanctionScreen } from './SanctionScreen';
import type { SanctionRecord } from '../types/moderation';

interface SanctionGateProps {
  children: React.ReactNode;
}

/**
 * Global enforcement for sanctions that stop publishing and messaging.
 * Warnings, content removals and throttling stay in the moderation centre;
 * only relay/permanent blocks replace the app until expiry or review.
 */
export const SanctionGate: React.FC<SanctionGateProps> = ({ children }) => {
  const [sanction, setSanction] = useState<SanctionRecord | null>(() => loadBlockingSanction());

  useEffect(() => {
    const refresh = () => setSanction(loadBlockingSanction());
    window.addEventListener(SANCTION_CHANGED_EVENT, refresh);

    const expiry = sanction?.expiresAt;
    const timer =
      expiry === null || expiry === undefined
        ? undefined
        : window.setTimeout(refresh, Math.max(0, expiry - Date.now()) + 100);

    return () => {
      window.removeEventListener(SANCTION_CHANGED_EVENT, refresh);
      if (timer) window.clearTimeout(timer);
    };
  }, [sanction?.expiresAt]);

  if (!sanction) return <>{children}</>;

  return <SanctionScreen mode="blocked" onClose={() => {}} />;
};
