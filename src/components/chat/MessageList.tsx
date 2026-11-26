import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { LazyMedia } from '../../components/LazyMedia';
import { NovaIconButton } from '../../lib/ui';
import { useLanguage } from '../../context/LanguageContext';
import { useSecurity } from '../../hooks/useSecurity';
import { pendingConsent, sanitizeManifest, type InstalledBot } from '../../lib/bots/runtime';
import type { BotManifest, BotPermission } from '../../lib/bots/types';
import { createAnonymousIdentity } from '../../lib/crypto/identity';
import { usePremium } from '../../hooks/usePremium';
import { resetOnboarding } from '../../lib/onboarding';
import { PIN_HASH_KEY, PIN_ENABLED_KEY } from '../../context/SecurityContext';
import { createKeychain } from '../../lib/storage/keychain';
import { downloadEncryptedBackup, uploadEncryptedBackup } from '../../lib/storage/cloudBackup';
import { downloadMyDataExport } from '../../lib/dataExport';
import { localAnalytics } from '../../lib/analytics/localAnalytics';
import {
  loadPrivacyPrefs,
  readBatteryStatus,
  savePrivacyPrefs,
  shouldEmitCoverTraffic,
  probeTor,
  type BatteryStatus,
  type PrivacyPrefs} from '../../lib/network/privacyMode';
import { loadJoinOutbox, retryJoinOutboxNow } from '../../lib/social/joinRequestRelay';
import {
  getSocialPrivacy,
  setSocialPrivacy,
  setContactBlocked,
  getBlockedContactsWithProfiles,
  type SocialPrivacySettings,
  type PrivacyScope} from '../../lib/social/socialPrivacy';
import {
  clearLocalAdPrefs,
  loadAdPreferences,
  restoreHiddenAd,
  unblockAdvertiser,
  type LocalAdPreferences} from '../../lib/ads/localAds';
import { loadSoundId, playSound, saveSoundId, SOUND_IDS, SOUNDS, type SoundId } from '../../lib/notifications/sounds';
import {
  getNotificationPrefs,
  setNotificationPref,
  setNotificationException,
  setNotificationSound,
  muteContact,
  getMutedContacts,
  setPriorityContact,
  getPriorityContacts,
  type NotificationPrefs,
  type NotificationLevel,
  type MuteDurationKey} from '../../lib/notifications/notificationPrefs';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { useFocusTrap } from '../../lib/ui/useFocusTrap';
import { CryptoCheckoutModal } from '../../components/CryptoCheckoutModal';
import { LegalModal } from '../../components/LegalModal';
import { SanctionScreen } from '../../components/SanctionScreen';
import { AccountSwitcher } from '../../components/AccountSwitcher';
import { BottomNav } from '../../components/BottomNav';

import type { BotSession } from '../../lib/bots/session';
import { movieCatalogBotManifest } from '../../../examples/bots/movie-catalog/manifest';
import { novafatherManifest } from '../../../examples/bots/novafather/manifest';
import { echoBotManifest } from '../../../examples/bots/echo/manifest';

const AVAILABLE_BUILTIN_BOTS: BotManifest[] = [
  movieCatalogBotManifest,
  novafatherManifest,
  echoBotManifest,
];

type SettingsTab = 'general' | 'notifications' | 'privacy' | 'data' | 'advanced' | 'about';

interface MessageListProps {
  messages: any[];
  activeThreadRootId: string | null;
  onOpenThread: (messageId: string) => void;
  onCloseThread: () => void;
  searchQuery: string;
  highlightMatch: (text: string, query: string) => React.ReactNode;
  getThreadMessages: (messages: any[], rootId: string) => any[];
  mediaLightbox: any;
  setMediaLightbox: (value: any) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  activeThreadRootId,
  onOpenThread,
  onCloseThread,
  searchQuery,
  highlightMatch,
  getThreadMessages,
  mediaLightbox,
  setMediaLightbox,
}) => {
  const { t } = useLanguage();

  // Message list rendering logic would go here
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((message) => (
        <div key={message.id} className="max-w-[75%]">
          <div className="text-sm text-[var(--nova-text-primary)]">
            {highlightMatch(message.text || '', searchQuery)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MessageList;
