import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  MessageSquare,
  Radio,
  BarChart3,
  Settings,
  Folder,
} from 'lucide-react';
import { ChatsScreen } from './components/ChatsScreen';
import { ChatScreen } from './components/ChatScreen';
import { ChannelScreen } from './components/ChannelScreen';
import { ChannelListPanel } from './components/ChannelListPanel';
import { PinLockScreen } from './components/PinLockScreen';

// Secondary screens and the settings modal are loaded on demand, so their code
// (qr-code rendering, analytics charts, crypto backup UI) stays out of the
// initial bundle.
const ProfileScreen = lazy(() =>
  import('./components/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
);
const AnalyticsScreen = lazy(() =>
  import('./components/AnalyticsScreen').then((m) => ({ default: m.AnalyticsScreen })),
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);

const ScreenFallback: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center bg-[#090a0e]">
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-[var(--nova-accent-color)]" />
  </div>
);
import { CURRENT_USER } from './data/mockMessengerData';
import { useLanguage } from './context/LanguageContext';
import { useSecurity } from './hooks/useSecurity';
import { useSocialData } from './hooks/useSocialData';
import { KYIV_CHANNEL_ID } from './lib/social/store';
import { applyAppTheme, applyFontSize, readAppTheme, readFontSize } from './lib/ui/appearance';

type ScreenId = 'chats' | 'chat-katie' | 'channel-kyiv' | 'profile-katie' | 'analytics';

export default function App() {
  const { t } = useLanguage();
  const { isLocked, pinHash, unlock } = useSecurity();
  const {
    stories,
    channels,
    posts,
    now,
    createStory,
    deleteStory,
    viewStory,
    toggleStoryReaction,
    createChannel,
    deleteChannel,
    setChannelSound,
    createChannelPost,
    voteChannelPoll,
    deleteChannelPost,
    togglePostReaction,
    toggleChannelPopular,
  } = useSocialData();
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('chats');
  const [activeChatId, setActiveChatId] = useState<string>('katie');
  const [activeProfileId, setActiveProfileId] = useState<string>('katie');
  const [activeChannelId, setActiveChannelId] = useState<string>(KYIV_CHANNEL_ID);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const foldersRef = useRef<{ openFolderModal: () => void } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nova_accent_color');
      if (saved) {
        document.documentElement.style.setProperty('--nova-accent-color', saved);
      } else {
        document.documentElement.style.setProperty('--nova-accent-color', '#ff4e18');
      }
      } catch {
        void 0;
      }
    applyAppTheme(readAppTheme());
    applyFontSize(readFontSize());
  }, []);

  const openProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    setCurrentScreen('profile-katie');
  };

  const openChannel = (channelId?: string) => {
    if (typeof channelId === 'string' && channelId) {
      setActiveChannelId(channelId);
    }
    setCurrentScreen('channel-kyiv');
  };

  const handleDeleteChannel = (channelId: string) => {
    deleteChannel(channelId);
    if (channelId === activeChannelId) {
      setActiveChannelId(KYIV_CHANNEL_ID);
    }
  };

  const handleCreateChannel = (draft: Parameters<typeof createChannel>[0]) => {
    const channel = createChannel(draft);
    setActiveChannelId(channel.id);
    return channel;
  };

  const handleToggleChannelPopular = (channelId: string) => {
    toggleChannelPopular(channelId);
  };

  const channelScreenProps = {
    channelId: activeChannelId,
    channels,
    posts,
    now,
    onCreateChannel: handleCreateChannel,
    onSelectChannel: setActiveChannelId,
    onDeleteChannel: handleDeleteChannel,
    onCreatePost: createChannelPost,
    onVotePoll: voteChannelPoll,
    onDeletePost: deleteChannelPost,
    onToggleReaction: togglePostReaction,
    onToggleSound: setChannelSound,
  };

  // Desktop Main Panel renderer
  const renderDesktopMainScreen = () => {
    switch (currentScreen) {
      case 'channel-kyiv':
        return (
          <ChannelScreen
            key={activeChannelId}
            {...channelScreenProps}
            onBack={() => {
              setActiveChatId('katie');
              setCurrentScreen('chat-katie');
            }}
          />
        );
      case 'profile-katie':
        return (
          <ProfileScreen
            profileId={activeProfileId}
            onBack={() => {
              setCurrentScreen('chat-katie');
            }}
            onOpenChat={() => {
              setCurrentScreen('chat-katie');
            }}
          />
        );
      case 'analytics':
        return <AnalyticsScreen />;
      case 'chat-katie':
      case 'chats':
      default:
        return (
          <ChatScreen
            chatId={activeChatId}
            onBack={() => {
              setCurrentScreen('chats');
            }}
            onOpenProfile={() => openProfile(activeChatId)}
          />
        );
    }
  };

  // Mobile Single-Pane Screen renderer
  const renderMobileScreen = () => {
    switch (currentScreen) {
      case 'chats':
        return (
          <ChatsScreen
            onSelectChat={(id) => {
              setActiveChatId(id);
              setCurrentScreen('chat-katie');
            }}
            onOpenChannel={openChannel}
            onOpenProfile={() => openProfile(CURRENT_USER.id)}
            onOpenAnalytics={() => setCurrentScreen('analytics')}
            activeChatId={activeChatId}
            activeNavTab={currentScreen === 'chats' ? 'chats' : undefined}
            stories={stories}
            channels={channels}
            now={now}
            onCreateStory={createStory}
            onDeleteStory={deleteStory}
            onViewStory={viewStory}
            onToggleStoryReaction={toggleStoryReaction}
          />
        );
      case 'chat-katie':
        return (
          <ChatScreen
            chatId={activeChatId}
            onBack={() => setCurrentScreen('chats')}
            onOpenProfile={() => openProfile(activeChatId)}
          />
        );
      case 'channel-kyiv':
        return (
          <ChannelScreen
            key={activeChannelId}
            {...channelScreenProps}
            onBack={() => setCurrentScreen('chats')}
          />
        );
      case 'profile-katie':
        return (
          <ProfileScreen
            profileId={activeProfileId}
            onBack={() => setCurrentScreen('chat-katie')}
            onOpenChat={() => setCurrentScreen('chat-katie')}
          />
        );
      case 'analytics':
        return <AnalyticsScreen onBack={() => setCurrentScreen('chats')} />;
      default:
        return null;
    }
  };

  const isDesktopChatActive = currentScreen === 'chats' || currentScreen === 'chat-katie';
  const isDesktopChannelActive = currentScreen === 'channel-kyiv';


  return (
    <>
      {isLocked && pinHash ? (
        <PinLockScreen onUnlock={unlock} />
      ) : (
        <div className="h-screen h-[100dvh] w-screen overflow-hidden bg-[#090a0e] text-white flex flex-col md:flex-row font-sans selection:bg-[var(--nova-accent-color)]/30 select-none">
      {/* ======================================================== */}
      {/* 1. DESKTOP LAYOUT (>= 768px md: breakpoint)               */}
      {/* ======================================================== */}

      {/* Left Navigation Rail (Desktop Only) */}
      <aside className="hidden md:flex w-[72px] shrink-0 bg-[#0b0c11] border-r border-white/[0.06] flex-col items-center justify-between py-4 z-30 select-none shadow-xl">
        {/* Primary Navigation Icons */}
        <nav className="flex flex-col items-center gap-2.5 w-full px-2">
          {/* Chats tab */}
          <button
            onClick={() => {
              setActiveChatId('katie');
              setCurrentScreen('chat-katie');
            }}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
              isDesktopChatActive
                ? 'bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30'
                : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
            }`}
            title={t('common.chats')}
          >
            <MessageSquare className="w-5 h-5 fill-[var(--nova-accent-color)]" />
            {/* Active Pill Indicator on left edge */}
            {isDesktopChatActive && (
              <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-[var(--nova-accent-color)]" />
            )}
          </button>

          {/* Kyiv Channel tab */}
          <button
            onClick={() => {
              setActiveChatId('kyiv-channel');
              setCurrentScreen('channel-kyiv');
            }}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
              isDesktopChannelActive
                ? 'bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30'
                : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
            }`}
            title={t('common.channels')}
          >
            <Radio className={`w-5 h-5 ${isDesktopChannelActive ? 'fill-[var(--nova-accent-color)]' : ''}`} />
            {isDesktopChannelActive && (
              <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-[var(--nova-accent-color)]" />
            )}
          </button>

          {/* Folders tab */}
          <button
            onClick={() => foldersRef.current?.openFolderModal()}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group text-white/45 hover:text-white hover:bg-white/[0.08]`}
            title={t('folders')}
          >
            <Folder className="w-5 h-5" />
          </button>



          {/* Analytics tab */}
          <button
            onClick={() => setCurrentScreen('analytics')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
              currentScreen === 'analytics'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30'
                : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
            }`}
            title={t('analytics.title')}
          >
            <BarChart3 className={`w-5 h-5 ${currentScreen === 'analytics' ? 'fill-[var(--nova-accent-color)]' : ''}`} />
          {currentScreen === 'analytics' && (
            <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-[var(--nova-accent-color)]" />
          )}
        </button>

        </nav>

        <div className="flex flex-col items-center gap-2">
          {/* Settings Trigger (language switch moved into Settings) */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-11 h-11 rounded-2xl text-white/45 hover:text-[var(--nova-accent-color)] hover:bg-white/[0.08] flex items-center justify-center transition cursor-pointer"
            title={t('settings.title')}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* User Avatar with Status indicator */}
          <button
            onClick={() => openProfile(CURRENT_USER.id)}
            className="w-10 h-10 rounded-full border border-white/15 overflow-hidden relative cursor-pointer active:scale-95 transition hover:ring-2 hover:ring-[var(--nova-accent-color)]/60 group"
            title={`${CURRENT_USER.name} (Online)`}
          >
            <img
              src={CURRENT_USER.avatar}
              alt={CURRENT_USER.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="w-full h-full bg-[var(--nova-accent-color)] text-white font-bold text-xs flex items-center justify-center">
              ME
            </div>
            {/* Online Green Beacon */}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0b0c11]" />
          </button>
        </div>
      </aside>

      {/* Left Column (Desktop Only) */}
      <section className="hidden md:flex w-[340px] lg:w-[380px] xl:w-[410px] shrink-0 border-r border-white/[0.06] bg-[#0c0d11] h-full flex-col overflow-hidden">
        {isDesktopChannelActive ? (
          <ChannelListPanel
            channels={channels}
            activeChannelId={activeChannelId}
            onSelectChannel={openChannel}
            onCreateChannel={handleCreateChannel}
            onTogglePopular={handleToggleChannelPopular}
          />
        ) : (
          <ChatsScreen
            ref={foldersRef}
            onSelectChat={(id) => {
              setActiveChatId(id);
              setCurrentScreen('chat-katie');
            }}
            onOpenChannel={openChannel}
            onOpenProfile={() => openProfile(CURRENT_USER.id)}
            activeChatId={activeChatId}
            activeNavTab={currentScreen === 'chats' ? 'chats' : undefined}
            stories={stories}
            channels={channels}
            now={now}
            onCreateStory={createStory}
            onDeleteStory={deleteStory}
            onViewStory={viewStory}
            onToggleStoryReaction={toggleStoryReaction}
          />
        )}
      </section>

      {/* Right Main Content Stage (Desktop Only) */}
      <main className="hidden md:flex flex-1 min-w-0 h-full overflow-hidden bg-[#090a0e] flex-col relative">
        <Suspense fallback={<ScreenFallback />}>{renderDesktopMainScreen()}</Suspense>
      </main>

      {/* ======================================================== */}
      {/* 2. MOBILE VIEW (< 768px md: breakpoint)                   */}
      {/* ======================================================== */}
      <div className="flex-1 w-full h-full md:hidden overflow-hidden flex flex-col relative bg-[#0c0d11]">
        <Suspense fallback={<ScreenFallback />}>{renderMobileScreen()}</Suspense>
      </div>



      {/* App Settings Modal (language switch lives here) */}
      <Suspense fallback={null}>
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </Suspense>
        </div>
      )}
    </>
  );
}
