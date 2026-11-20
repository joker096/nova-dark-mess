import React from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ListFilter,
  Lock,
  Mic,
  Palette,
  Pin,
  Search,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import { NovaButton } from '../../lib/ui/NovaButton';
import { ChatMessage } from '../../types/messenger';
import { PremiumFeature } from '../../hooks/usePremium';
import { useLanguage } from '../../context/LanguageContext';
import { CHAT_THEME_KEY, CHAT_THEME_ORDER, ChatTheme, PREMIUM_THEMES } from './chatTheme';
import { LazyMedia } from '../LazyMedia';

interface ChatHeaderProps {
  onBack: () => void;
  onOpenProfile: () => void;
  profile: { name: string; status: string; avatar: string };
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  matchingMessages: ChatMessage[];
  activeMatchIndex: number;
  setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>;
  searchFilterMode: 'context' | 'filtered';
  setSearchFilterMode: React.Dispatch<React.SetStateAction<'context' | 'filtered'>>;
  handleCloseSearch: () => void;
  handlePrevMatch: () => void;
  handleNextMatch: () => void;
  isTyping: boolean;
  typingActivity: 'typing' | 'recording';
  handleTriggerIncomingVoiceNote: () => void;
  handleSimulateTypingActivity: (activityType?: 'typing' | 'recording') => void;
  activeHeaderTab: 'chat' | 'gallery';
  setActiveHeaderTab: (tab: 'chat' | 'gallery') => void;
  sharedMediaCount: number;
  isVideoCallOpen: boolean;
  handleStartVideoCall: () => void;
  isWallpaperModalOpen: boolean;
  setIsWallpaperModalOpen: (open: boolean) => void;
  chatTheme: ChatTheme;
  setChatTheme: (theme: ChatTheme) => void;
  canUse: (feature: PremiumFeature) => boolean;
  checkout: () => Promise<boolean> | void;
  pinnedMessages: ChatMessage[];
  isPinnedCarouselOpen: boolean;
  setIsPinnedCarouselOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenProtection?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onBack,
  onOpenProfile,
  profile,
  isSearchOpen,
  setIsSearchOpen,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  matchingMessages,
  activeMatchIndex,
  setActiveMatchIndex,
  searchFilterMode,
  setSearchFilterMode,
  handleCloseSearch,
  handlePrevMatch,
  handleNextMatch,
  isTyping,
  typingActivity,
  handleTriggerIncomingVoiceNote,
  handleSimulateTypingActivity,
  activeHeaderTab,
  setActiveHeaderTab,
  sharedMediaCount,
  isVideoCallOpen,
  handleStartVideoCall,
  isWallpaperModalOpen,
  setIsWallpaperModalOpen,
  chatTheme,
  setChatTheme,
  canUse,
  checkout,
  pinnedMessages,
  isPinnedCarouselOpen,
  setIsPinnedCarouselOpen,
  onOpenProtection,
}) => {
  const { t } = useLanguage();
  const theme = PREMIUM_THEMES[chatTheme];

  return (
<>
    {/* Floating Header Pill */}
    <div className="p-2 shrink-0 relative z-20">
      <div className="bg-[#14151c]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-2.5 py-1.5 flex items-center justify-between shadow-xl shadow-black/60 min-h-[44px]">
        {isSearchOpen ? (
          /* ACTIVE SEARCH BAR HEADER WITH WORD STEPPER & CONTROLS */
          <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-200">
            <button
              onClick={handleCloseSearch}
              className="w-8 h-8 rounded-full bg-[#1f2029]/80 hover:bg-[#282a36] border border-white/5 flex items-center justify-center text-white/90 active:scale-95 transition cursor-pointer shrink-0"
              title={t('common.back')}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex-1 bg-[#1a1b26] border border-[var(--nova-accent-color, #ff4e18)]/50 focus-within:border-[var(--nova-accent-color, #ff4e18)] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 shadow-inner min-w-0">
              <Search className="w-4 h-4 text-[var(--nova-accent-color, #ff4e18)] shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleCloseSearch();
                  } else if (e.key === 'Enter') {
                    if (e.shiftKey) {
                      handlePrevMatch();
                    } else {
                      handleNextMatch();
                    }
                  } else if (e.key === 'ArrowDown') {
                    handleNextMatch();
                  } else if (e.key === 'ArrowUp') {
                    handlePrevMatch();
                  }
                }}
                placeholder={t('chat.searchInChat')}
                className="w-full bg-transparent text-xs text-white placeholder-white/40 focus:outline-none py-0.5 min-w-0"
              />

              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveMatchIndex(0);
                    searchInputRef.current?.focus();
                  }}
                  className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition cursor-pointer shrink-0"
                  title={t('common.close')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Match counter badge */}
              {searchQuery.trim() && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 text-[var(--nova-accent-color, #ff4e18)] shrink-0 border border-[var(--nova-accent-color, #ff4e18)]/30 font-semibold whitespace-nowrap">
                  {matchingMessages.length > 0
                    ? `${activeMatchIndex + 1}/${matchingMessages.length}`
                    : '0/0'}
                </span>
              )}
            </div>

            {/* Stepper buttons: Jump Up / Down through matches */}
            {searchQuery.trim() && matchingMessages.length > 0 && (
              <div className="flex items-center gap-0.5 bg-[#1a1b26] border border-white/10 rounded-xl p-0.5 shrink-0">
                <button
                  onClick={handlePrevMatch}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-[var(--nova-accent-color, #ff4e18)] transition cursor-pointer active:scale-95"
                  title={t('common.previous')}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextMatch}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-[var(--nova-accent-color, #ff4e18)] transition cursor-pointer active:scale-95"
                  title={t('common.next')}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Toggle View Mode: Filter Only vs Context Stream */}
            {searchQuery.trim() && (
              <button
                onClick={() =>
                  setSearchFilterMode((mode) =>
                    mode === 'context' ? 'filtered' : 'context'
                  )
                }
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition cursor-pointer active:scale-95 shrink-0 ${
                  searchFilterMode === 'filtered'
                    ? 'bg-[var(--nova-accent-color, #ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/30 border border-[var(--nova-accent-color, #ff4e18)]'
                    : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
                }`}
                title={
                  searchFilterMode === 'filtered'
                    ? 'Showing filtered matches only. Click for conversation context.'
                    : 'Showing conversation context. Click to filter only matching messages.'
                }
              >
                <ListFilter className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={handleCloseSearch}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 hover:text-white transition cursor-pointer active:scale-95 shrink-0"
            >
              Done
            </button>
          </div>
        ) : (
          /* STANDARD CONTACT HEADER */
          <>
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full bg-[#1f2029]/80 hover:bg-[#282a36] border border-white/5 flex items-center justify-center text-white/90 active:scale-95 transition cursor-pointer md:hidden shrink-0"
              aria-label="Back to chats"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 min-w-0 flex-1 mx-0.5">
              <button
                onClick={onOpenProfile}
                className="flex flex-col items-center min-w-0 cursor-pointer focus:outline-none group"
              >
                <span className="max-w-full font-bold text-[14.5px] text-white tracking-tight group-hover:text-[var(--nova-accent-color, #ff4e18)] transition truncate">
                  {profile.name}
                </span>
                <button
                  type="button"
                  data-testid="e2ee-badge"
                  onClick={() => onOpenProtection?.()}
                  className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-px rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-semibold text-emerald-300 select-none cursor-pointer hover:bg-emerald-500/25 transition"
                  title={t('chat.e2eeBadgeTitle')}
                >
                  <Lock className="w-2.5 h-2.5" />
                  {t('chat.e2eeBadge')}
                </button>
                {isTyping ? (
                  <div className="flex items-center gap-1 mt-0.5 px-1.5 py-px rounded-full bg-[var(--nova-accent-color, #ff4e18)]/15 border border-[var(--nova-accent-color, #ff4e18)]/30 animate-in fade-in zoom-in-95 duration-200 shadow-sm shadow-[var(--nova-accent-color, #ff4e18)]/20 select-none">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--nova-accent-color, #ff4e18)] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--nova-accent-color, #ff4e18)]"></span>
                    </span>
                    {typingActivity === 'recording' ? (
                      <>
                        <Mic className="w-2 h-2 text-[var(--nova-accent-color, #ff4e18)] animate-pulse" />
                        <span className="text-[10px] font-semibold text-[var(--nova-accent-color, #ff4e18)] tracking-tight">recording</span>
                        <div className="flex items-center gap-0.5 h-1.5">
                          <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-0.5" />
                          <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.2s] h-1" />
                          <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.4s] h-1" />
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] font-semibold text-[var(--nova-accent-color, #ff4e18)] tracking-tight">typing</span>
                        <div className="flex items-center gap-0.5 pt-px">
                          <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce [animation-delay:-0.32s]" />
                          <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce [animation-delay:-0.16s]" />
                          <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce" />
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-0.5 select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                    <span className="max-w-[132px] truncate whitespace-nowrap text-[10px] text-[#868b98] font-normal leading-none">
                      {profile.status}
                    </span>
                  </div>
                )}
              </button>

              {/* Header Menu Tabs: [ Chat | Gallery ] */}
              <div className="hidden sm:flex items-center gap-0.5 p-0.5 bg-[#181922] rounded-lg border border-white/5 select-none shrink-0">
                <button
                  onClick={() => setActiveHeaderTab('chat')}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                    activeHeaderTab === 'chat'
                      ? 'text-white shadow-sm'
                      : 'text-white/60 hover:text-white'
                  }`}
                  style={activeHeaderTab === 'chat' ? { backgroundColor: 'var(--nova-accent-color)' } : undefined}
                >
                  Chat
                </button>
                <button
                  onClick={() => setActiveHeaderTab('gallery')}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer flex items-center gap-0.5 ${
                    activeHeaderTab === 'gallery'
                      ? 'text-white shadow-sm'
                      : 'text-white/60 hover:text-white'
                  }`}
                  style={activeHeaderTab === 'gallery' ? { backgroundColor: 'var(--nova-accent-color)' } : undefined}
                >
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>Gallery</span>
                  <span className="text-[9px] opacity-80 font-mono">({sharedMediaCount})</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Video Call Toggle Button */}
              <NovaButton
                variant={isVideoCallOpen ? 'accent' : 'ghost'}
                onClick={handleStartVideoCall}
                title={isVideoCallOpen ? 'Video call in progress (click to view)' : `Start video call with ${profile.name}`}
                className={isVideoCallOpen ? 'animate-pulse' : ''}
              >
                <Video className="w-3 h-3" />
              </NovaButton>

              {/* Search Messages in Chat Button */}
              <NovaButton variant="ghost" onClick={() => setIsSearchOpen(true)} title={t('common.search')}>
                <Search className="w-3 h-3" />
              </NovaButton>

              {/* Secondary controls stay off the narrow header; the same actions
                  remain reachable from the chat action menu. */}
              <div className="hidden sm:flex items-center gap-1">
              {/* Wallpaper Settings Button */}
              <NovaButton
                variant={isWallpaperModalOpen ? 'accent' : 'ghost'}
                onClick={() => setIsWallpaperModalOpen(true)}
                title={t('settings.chatWallpaper')}
              >
                <Palette className="w-3 h-3" />
              </NovaButton>

              {/* Premium Chat Theme Toggle */}
              <NovaButton
                variant={chatTheme === 'default' ? 'ghost' : 'accent'}
                disabled={chatTheme !== 'default' && !canUse('chat_themes')}
                onClick={() => {
                  const isPremiumTheme = chatTheme !== 'default';
                  if (isPremiumTheme && !canUse('chat_themes')) {
                    checkout();
                    return;
                  }
                  const next: ChatTheme = CHAT_THEME_ORDER[
                    (CHAT_THEME_ORDER.indexOf(chatTheme) + 1) % CHAT_THEME_ORDER.length
                  ];
                  if (next !== 'default' && !canUse('chat_themes')) {
                    checkout();
                    return;
                  }
                  setChatTheme(next);
                  try {
                    localStorage.setItem(CHAT_THEME_KEY, next);
                  } catch {
                    void 0;
                  }
                }}
                title={`Chat theme: ${theme.label}${!canUse('chat_themes') && chatTheme === 'default' ? ' (Premium)' : ''}`}
              >
                {canUse('chat_themes') || chatTheme !== 'default' ? (
                  <Sparkles className={`w-3 h-3 ${chatTheme === 'default' ? '' : 'fill-white'}`} />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
              </NovaButton>

              {/* Pinned Messages Header Button */}
              <NovaButton
                variant="accent-ghost"
                badge={pinnedMessages.length > 0 ? pinnedMessages.length : undefined}
                onClick={() => setIsPinnedCarouselOpen((prev) => !prev)}
                className={isPinnedCarouselOpen ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30' : ''}
                title={isPinnedCarouselOpen ? 'Close pinned messages' : 'View pinned messages'}
              >
                <Pin className={`w-3 h-3 ${isPinnedCarouselOpen || pinnedMessages.length > 0 ? 'fill-current' : ''}`} />
              </NovaButton>

              {/* Demo: simulate incoming message */}
              <NovaButton
                variant={isTyping ? 'accent-ghost' : 'ghost'}
                disabled={isTyping}
                onClick={isTyping ? handleTriggerIncomingVoiceNote : () => handleSimulateTypingActivity('typing')}
                className={isTyping ? 'ring-1 ring-[var(--nova-accent-color,#ff4e18)]/40 animate-pulse' : ''}
                title={isTyping ? 'Receive voice note' : 'Simulate typing'}
              >
                {isTyping ? <Mic className="w-3 h-3 text-[var(--nova-accent-color,#ff4e18)]" /> : <Sparkles className="w-3 h-3 text-[var(--nova-accent-color,#ff4e18)]" />}
              </NovaButton>
              </div>

              <button
                onClick={onOpenProfile}
                className={`relative w-8 h-8 rounded-full overflow-hidden border transition-all duration-300 cursor-pointer active:scale-95 shrink-0 ${
                  isTyping
                    ? 'border-[var(--nova-accent-color, #ff4e18)] ring-2 ring-[var(--nova-accent-color, #ff4e18)]/60 shadow-[0_0_16px_rgba(255,78,24,0.6)]'
                    : 'border-white/15 ring-2 ring-[var(--nova-accent-color, #ff4e18)]/20'
                }`}
                title={t('common.profile')}
              >
                <LazyMedia
                  src={profile.avatar}
                  alt={profile.name}
                  eager
                  className="w-full h-full object-cover"
                />
                {/* Real-time live status beacon on avatar */}
                {isTyping ? (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)] border-2 border-[#12131b] flex items-center justify-center animate-pulse shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  </span>
                ) : (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#12131b] shadow-sm shadow-emerald-500/50" />
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
</>
  );
};
