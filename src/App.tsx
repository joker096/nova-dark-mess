import React, { useState, useEffect, useRef } from 'react';
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
import { ProfileScreen } from './components/ProfileScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { AppIcon } from './components/AppIcon';
import { PinLockScreen } from './components/PinLockScreen';

import { SettingsModal } from './components/SettingsModal';
import { CURRENT_USER } from './data/mockMessengerData';
import { useLanguage } from './context/LanguageContext';
import { useSecurity } from './hooks/useSecurity';
import { applyAppTheme, applyFontSize, readAppTheme, readFontSize } from './lib/ui/appearance';

type ScreenId = 'chats' | 'chat-katie' | 'channel-kyiv' | 'profile-katie' | 'analytics';

export default function App() {
  const { t } = useLanguage();
  const { isLocked, pinHash, unlock } = useSecurity();
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('chats');
  const [activeChatId, setActiveChatId] = useState<string>('katie');
  const [activeProfileId, setActiveProfileId] = useState<string>('katie');

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

  // Desktop Main Panel renderer
  const renderDesktopMainScreen = () => {
    switch (currentScreen) {
      case 'channel-kyiv':
        return (
          <ChannelScreen
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
            onOpenChannel={() => {
              setActiveChatId('kyiv-channel');
              setCurrentScreen('channel-kyiv');
            }}
            onOpenProfile={() => openProfile(CURRENT_USER.id)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenAnalytics={() => setCurrentScreen('analytics')}
            activeChatId={activeChatId}
            activeNavTab={currentScreen === 'chats' ? 'chats' : undefined}
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
          <ChannelScreen onBack={() => setCurrentScreen('chats')} />
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
        {/* Brand Logo Lockup */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => {
              setCurrentScreen('chats');
              setActiveChatId('');
              setActiveProfileId('');
            }}
            className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[var(--nova-accent-color)] to-[var(--nova-accent-color, #ff6b3d)] flex items-center justify-center shadow-lg shadow-[var(--nova-accent-color)]/35 active:scale-90 transition cursor-pointer group relative"
            title={t('app.name')}
          >
            <AppIcon size={20} variant="light" className="group-hover:scale-110 transition-transform" />
          </button>
          <div className="w-7 h-[1px] bg-white/10" />
        </div>

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

        {/* Settings Trigger (language switch moved into Settings) */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-11 h-11 rounded-2xl text-white/45 hover:text-[var(--nova-accent-color)] hover:bg-white/[0.08] flex items-center justify-center transition cursor-pointer"
          title={t('settings.title')}
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* User Avatar with Status indicator */}
        <div className="flex flex-col items-center gap-2">
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

      {/* Chats Column (Desktop Only) */}
      <section className="hidden md:flex w-[340px] lg:w-[380px] xl:w-[410px] shrink-0 border-r border-white/[0.06] bg-[#0c0d11] h-full flex-col overflow-hidden">
        <ChatsScreen
          ref={foldersRef}
          onSelectChat={(id) => {
            setActiveChatId(id);
            setCurrentScreen('chat-katie');
          }}
          onOpenChannel={() => {
            setActiveChatId('kyiv-channel');
            setCurrentScreen('channel-kyiv');
          }}
          onOpenProfile={() => openProfile(CURRENT_USER.id)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeChatId={activeChatId}
          activeNavTab={currentScreen === 'chats' ? 'chats' : undefined}
        />
      </section>

      {/* Right Main Content Stage (Desktop Only) */}
      <main className="hidden md:flex flex-1 min-w-0 h-full overflow-hidden bg-[#090a0e] flex-col relative">
        {renderDesktopMainScreen()}
      </main>

      {/* ======================================================== */}
      {/* 2. MOBILE VIEW (< 768px md: breakpoint)                   */}
      {/* ======================================================== */}
      <div className="flex-1 w-full h-full md:hidden overflow-hidden flex flex-col relative bg-[#0c0d11]">
        {renderMobileScreen()}
      </div>



      {/* App Settings Modal (language switch lives here) */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
      )}
    </>
  );
}
