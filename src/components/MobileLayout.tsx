import React, { Suspense } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { pendingConsent, sanitizeManifest, type InstalledBot } from '../lib/bots/runtime';
import type { BotManifest, BotPermission } from '../lib/bots/types';
import { createAnonymousIdentity } from '../lib/crypto/identity';
import { usePremium } from '../hooks/usePremium';
import { resetOnboarding } from '../lib/onboarding';
import { PIN_HASH_KEY, PIN_ENABLED_KEY } from '../context/SecurityContext';
import { createKeychain } from '../lib/storage/keychain';
import { downloadEncryptedBackup, uploadEncryptedBackup } from '../lib/storage/cloudBackup';
import { downloadMyDataExport } from '../lib/dataExport';
import { localAnalytics } from '../lib/analytics/localAnalytics';
import {
  loadPrivacyPrefs,
  readBatteryStatus,
  savePrivacyPrefs,
  shouldEmitCoverTraffic,
  probeTor,
  type BatteryStatus,
  type PrivacyPrefs,
} from '../lib/network/privacyMode';
import { loadJoinOutbox, retryJoinOutboxNow } from '../lib/social/joinRequestRelay';
import {
  getSocialPrivacy,
  setSocialPrivacy,
  setContactBlocked,
  getBlockedContactsWithProfiles,
  type SocialPrivacySettings,
  type PrivacyScope,
} from '../lib/social/socialPrivacy';
import {
  clearLocalAdPrefs,
  loadAdPreferences,
  restoreHiddenAd,
  unblockAdvertiser,
  type LocalAdPreferences,
} from '../lib/ads/localAds';
import { loadSoundId, playSound, saveSoundId, SOUND_IDS, SOUNDS, type SoundId } from '../lib/notifications/sounds';
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
  type MuteDurationKey,
} from '../lib/notifications/notificationPrefs';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { CryptoCheckoutModal } from './CryptoCheckoutModal';
import { LegalModal } from './LegalModal';
import { SanctionScreen } from './SanctionScreen';
import { AccountSwitcher } from './AccountSwitcher';
import { BottomNav } from './BottomNav';
import { ChatsScreen } from './ChatsScreen';
import { AnonymousMessengerScreen } from './AnonymousMessengerScreen';
import { ChannelListPanel } from './ChannelListPanel';
import { ChannelScreen } from './ChannelScreen';
import { ProfileScreen } from './ProfileScreen';
import { SettingsModal } from './SettingsModal';
import { SettingsModalTabbed } from './SettingsModalTabbed';
import { NovaIconButton } from '../lib/ui/NovaIconButton';
import { LazyMedia } from './LazyMedia';
import { JoinRequestNotice, type JoinRequestNoticeData } from './JoinRequestNotice';
import { PinLockScreen } from './PinLockScreen';
import { SanctionGate } from './SanctionGate';
import { EncryptedBotStorage, NOVA_BOTS } from '../lib/bots/runtime';
import { dbInstance } from '../lib/storage/db';
import { botSession } from '../lib/bots/session';
import { ThreadSidebar } from './ThreadSidebar';

import { movieCatalogBotManifest } from '../../examples/bots/movie-catalog/manifest';
import { novafatherManifest } from '../../examples/bots/novafather/manifest';
import { echoBotManifest } from '../../examples/bots/echo/manifest';

import type { BotSession } from '../lib/bots/session';

const AVAILABLE_BUILTIN_BOTS: BotManifest[] = [
  movieCatalogBotManifest,
  novafatherManifest,
  echoBotManifest,
];

interface MobileLayoutProps {
  currentScreen: string;
  activeChatId: string | null;
  activeProfileId: string | null;
  activeChannelId: string | null;
  activeBottomTab: 'chats' | 'contacts' | 'channels' | 'profile' | 'premium';
  onNavigate: (screen: string, opts?: { chatId?: string; profileId?: string; channelId?: string }) => void;
  onGoBack: () => void;
  onSetActiveBottomTab: (tab: 'chats' | 'contacts' | 'channels' | 'profile' | 'premium') => void;
  getBotSession?: () => any;
  pendingBotInstall?: { id: string; startPayload?: string } | null;
  onBotInstallHandled?: () => void;
  onOpenBotChat?: (botId: string) => void;
  onOpenMeshMap?: () => void;
}

const ScreenFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-[var(--bg-app)]">
    <div className="text-center text-[var(--nova-text-muted)]">Loading…</div>
  </div>
);

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  currentScreen,
  activeChatId,
  activeProfileId,
  activeChannelId,
  activeBottomTab,
  onNavigate,
  onGoBack,
  onSetActiveBottomTab,
  getBotSession,
  pendingBotInstall,
  onBotInstallHandled,
  onOpenBotChat,
  onOpenMeshMap,
}) => {
  const { t, language } = useLanguage();
  const { isInitialized, identity, clearLocalEncryptedData, verifyPinWithFeedback, pinHash, pinEnabled } = useSecurity();
  const { premium, checkout, minSubscriptionCost, freeDaysRemaining, setCryptoModalOpen, loading } = usePremium();
  const { account } = (() => ({ account: { id: 'me', displayName: 'You', nickname: 'You', avatar: undefined } }))();
  const [mobileChannelListOpen, setMobileChannelListOpen] = useState(true);
  const [pendingCommentsPostId, setPendingCommentsPostId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [stories, setStories] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [activeNavTab, setActiveNavTab] = useState<string>('chats');
  const [fabSide, setFabSide] = useState<'left' | 'right'>('right');

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const onOpenChannel = (channelId: string) => {
    onNavigate('channel-kyiv', { channelId });
  };
  const handleCreateChannel = () => onSetActiveBottomTab('channels');
  const handleToggleChannelPopular = () => {};
  const handleDeleteChannels = () => {};
  const createStory = () => {};
  const deleteStory = () => {};
  const viewStory = () => {};
  const toggleStoryReaction = () => {};

  const renderMobileScreen = () => {
    const mobileScreen = activeBottomTab === 'channels' ? 'channel-kyiv' : activeBottomTab;

    switch (mobileScreen) {
      case 'channel-kyiv':
        if (mobileChannelListOpen || !activeChannelId) {
          return (
            <ChannelListPanel
              key="channel-list"
              channels={channels}
              activeChannelId={activeChannelId}
              onSelectChannel={onOpenChannel}
              onCreateChannel={handleCreateChannel}
              onTogglePopular={handleToggleChannelPopular}
              onDeleteChannels={handleDeleteChannels}
              onBack={onGoBack}
            />
          );
        }
        return (
          <ChannelScreen
            key={`${activeChannelId}:${pendingCommentsPostId ?? ''}`}
            channel={channels.find(c => c.id === activeChannelId)}
            onBack={() => {
              setMobileChannelListOpen(true);
              onGoBack();
            }}
          />
        );
      case 'chats':
        return (
          <ChatsScreen
            onSelectChat={(id) => {
              onNavigate('chat-katie', { chatId: id });
            }}
            onOpenChannel={onOpenChannel}
            onOpenProfile={() => onNavigate('profile', { profileId: account.id })}
            onOpenAnonymous={() => onNavigate('anonymous')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenPremium={() => setIsPremiumOpen(true)}
            activeChatId={activeChatId}
            activeNavTab={activeNavTab}
            stories={stories}
            channels={channels}
            localFingerprint={identity?.fingerprint}
            getBotSession={getBotSession}
            now={now}
            onCreateStory={createStory}
            onDeleteStory={deleteStory}
            onViewStory={viewStory}
            onToggleStoryReaction={toggleStoryReaction}
          />
        );
      case 'contacts':
        return (
          <AnonymousMessengerScreen
            onBack={onGoBack}
            initialInvite={pendingContactInvite}
            onInviteConsumed={() => setPendingContactInvite(null)}
          />
        );
      case 'profile':
        return (
          <SettingsModalTabbed
            isOpen={true}
            onClose={() => onSetActiveBottomTab('chats')}
            onOpenAnalytics={onOpenAnalytics}
            onOpenSites={onOpenSites}
            getBotSession={getBotSession}
            pendingBotInstall={pendingBotInstall}
            onBotInstallHandled={onBotInstallHandled}
            onOpenBotChat={onOpenBotChat}
            onOpenMeshMap={onOpenMeshMap}
          />
        );
      case 'premium':
        return (
          <CryptoCheckoutModal
            isOpen={true}
            onClose={() => onSetActiveBottomTab('chats')}
            onSuccess={() => onSetActiveBottomTab('chats')}
          />
        );
      case 'chat-katie': {
        return (
          <ChatScreen
            key={activeChatId}
            chatId={activeChatId}
            onBack={onGoBack}
            onOpenProfile={(id) => onNavigate('profile', { profileId: id })}
            onOpenAnonymous={() => onNavigate('anonymous')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenPremium={() => setIsPremiumOpen(true)}
            activeNavTab={activeNavTab}
            stories={stories}
            channels={channels}
            localFingerprint={identity?.fingerprint}
            getBotSession={getBotSession}
            now={now}
            onCreateStory={createStory}
            onDeleteStory={deleteStory}
            onViewStory={viewStory}
            onToggleStoryReaction={toggleStoryReaction}
          />
        );
      }
      default:
        return <div className="flex-1 items-center justify-center">Screen not found</div>;
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-hidden flex flex-col relative bg-[var(--bg-app)]">
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<ScreenFallback />}>{renderMobileScreen()}</Suspense>
      </div>
      <BottomNav
        activeTab={activeBottomTab}
        onTabChange={onSetActiveBottomTab}
        fabSide={fabSide}
        onNewChat={() => onNavigate('chat-katie', { chatId: 'new' })}
        unreadChats={0}
        unreadChannels={0}
        unreadContacts={0}
        premium={premium}
      />
    </div>
  );
};

export default MobileLayout;