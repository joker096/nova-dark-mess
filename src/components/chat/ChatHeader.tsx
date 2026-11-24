import React from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ListFilter,
  Mic,
  MoreHorizontal,
  Pin,
  Phone,
  Search,
  ShieldCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { ChatMessage } from '../../types/messenger';
import { PremiumFeature } from '../../hooks/usePremium';
import { useLanguage } from '../../context/LanguageContext';
import { ChatTheme } from './chatTheme';
import { LazyMedia } from '../LazyMedia';
import type { GroupJoinRequest } from '../../lib/social/groupJoinRequests';

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
  checkout: () => void | Promise<any>;
  pinnedMessages: ChatMessage[];
  isPinnedCarouselOpen: boolean;
  setIsPinnedCarouselOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenProtection?: () => void;

  // Enhanced features from ChatScreen inline header
  avatarPosition?: 'left' | 'right';
  roomPeerCount?: number;
  isGroupChat?: boolean;
  groupMembers?: string[];
  botId?: string;
  handleStartVoiceCall?: () => void;
  handleStartGroupCall?: (mode: 'voice' | 'video') => void;
  isGroupCallOpen?: boolean;
  callMode?: 'voice' | 'video';
  pendingJoinRequests?: GroupJoinRequest[];
  currentUserIsGroupAdmin?: boolean;
  isMoreMenuOpen?: boolean;
  setIsMoreMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  moreMenuAnchorRef?: React.RefObject<HTMLButtonElement | null>;
  onOpenMoreMenu?: () => void;
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
  pinnedMessages,
  isPinnedCarouselOpen,
  setIsPinnedCarouselOpen,
  onOpenProtection,
  // Enhanced features
  avatarPosition = 'right',
  roomPeerCount = 0,
  isGroupChat = false,
  groupMembers = [],
  botId,
  handleStartVoiceCall,
  handleStartGroupCall,
  isGroupCallOpen = false,
  callMode = 'video',
  pendingJoinRequests = [],
  currentUserIsGroupAdmin = false,
  isMoreMenuOpen = false,
  setIsMoreMenuOpen,
  moreMenuAnchorRef,
  onOpenMoreMenu,
}) => {
  const { t } = useLanguage();

  return (
<>
    {/* Floating Header Pill */}
    <div className="p-2 shrink-0 relative z-20">
      <div className="bg-[var(--nova-surface)]/90 backdrop-blur-xl border border-[var(--nova-border-subtle)] rounded-2xl px-2.5 py-1.5 flex items-center justify-between shadow-xl shadow-black/60 min-h-[44px]">
        {isSearchOpen ? (
          /* ACTIVE SEARCH BAR HEADER WITH WORD STEPPER & CONTROLS */
          <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-200">
            <button
              onClick={handleCloseSearch}
              className="w-11 h-11 rounded-full bg-[var(--nova-surface-raised)]/80 hover:bg-[var(--nova-surface-high)] border border-[var(--nova-border-subtle)] flex items-center justify-center text-[var(--nova-text-primary)] active:scale-95 transition cursor-pointer shrink-0"
              aria-label={t('common.back')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 bg-[var(--nova-surface-raised)] border border-[var(--nova-accent-color,#ff4e18)]/50 focus-within:border-[var(--nova-accent-color,#ff4e18)] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 shadow-inner min-w-0">
              <Search className="w-4 h-4 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
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
                className="w-full bg-transparent text-xs text-[var(--nova-text-primary)] placeholder-white/40 focus:outline-none py-0.5 min-w-0"
              />

              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveMatchIndex(0);
                    searchInputRef.current?.focus();
                  }}
                  className="w-11 h-11 rounded-full hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] transition cursor-pointer shrink-0 flex items-center justify-center"
                  aria-label={t('common.close')}
                >
                  <X className="w-5 h-5" />
                </button>
              )}

              {/* Match counter badge */}
              {searchQuery.trim() && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 text-[var(--nova-accent-color,#ff4e18)] shrink-0 border border-[var(--nova-accent-color,#ff4e18)]/30 font-semibold whitespace-nowrap">
                  {matchingMessages.length > 0
                    ? `${activeMatchIndex + 1}/${matchingMessages.length}`
                    : '0/0'}
                </span>
              )}
            </div>

{/* Stepper buttons: Jump Up / Down through matches */}
              {searchQuery.trim() && matchingMessages.length > 0 && (
                <div className="flex items-center gap-0.5 bg-[var(--nova-surface-raised)] border border-[var(--nova-border-subtle)] rounded-xl p-0.5 shrink-0">
                  <button
                    onClick={handlePrevMatch}
                    className="w-11 h-11 rounded-lg hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color,#ff4e18)] transition cursor-pointer active:scale-95"
                    aria-label={t('common.previous')}
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNextMatch}
                    className="w-11 h-11 rounded-lg hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color,#ff4e18)] transition cursor-pointer active:scale-95"
                    aria-label={t('common.next')}
                  >
                    <ChevronDown className="w-5 h-5" />
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
                    ? 'bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 border border-[var(--nova-accent-color,#ff4e18)]'
                    : 'bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] border border-[var(--nova-border-subtle)]'
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
              className="px-2.5 py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-xs font-semibold text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-95 shrink-0"
            >
              Done
            </button>
          </div>
        ) : (
          /* STANDARD CONTACT HEADER - Enhanced with ChatScreen inline header features */
          <>
            {/* Mobile back button */}
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-full bg-[var(--nova-surface-raised)]/80 hover:bg-[var(--nova-surface-high)] border border-[var(--nova-border-subtle)] flex items-center justify-center text-[var(--nova-text-primary)] active:scale-95 transition cursor-pointer lg:hidden shrink-0"
              aria-label={t('a11y.backToChats')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Header content - avatar position controlled by avatarPosition prop */}
            <div className={`flex items-center gap-2 min-w-0 flex-1 mx-0.5 ${avatarPosition === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
              {avatarPosition === 'left' && (
                <button
                  onClick={onOpenProfile}
                  className="relative w-11 h-11 rounded-full overflow-hidden border transition-all duration-300 cursor-pointer active:scale-95 shrink-0"
                  aria-label={t('common.profile')}
                >
                  <LazyMedia
                    src={profile.avatar}
                    alt={profile.name}
                    eager
                    className="w-full h-full object-cover"
                  />
                  {isTyping ? (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] border-2 border-[var(--nova-border-color)] flex items-center justify-center animate-pulse shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-on-accent)] animate-ping" />
                    </span>
                  ) : (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--nova-border-color)] shadow-sm shadow-emerald-500/50" />
                  )}
                </button>
              )}

              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div
                  onClick={onOpenProfile}
                  className="flex flex-col items-center min-w-0 cursor-pointer focus:outline-none group"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenProfile();
                    }
                  }}
                >
                  <span className="max-w-full font-bold text-[14.5px] text-[var(--nova-text-primary)] tracking-tight group-hover:text-[var(--nova-accent-color,#ff4e18)] transition truncate">
                    {profile.name}
                  </span>

                  {/* P2P peer count badge */}
                  {roomPeerCount > 0 && (
                    <span
                      data-testid="p2p-peer-count"
                      title={`P2P · ${roomPeerCount}`}
                      className="hidden @min-[400px]:inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30"
                    >
                      P2P · {roomPeerCount}
                    </span>
                  )}

                  {/* Typing/Recording indicator */}
                  {isTyping ? (
                    <div className="flex items-center gap-1 mt-0.5 px-1.5 py-px rounded-full bg-[var(--nova-accent-color,#ff4e18)]/15 border border-[var(--nova-accent-color,#ff4e18)]/30 animate-in fade-in zoom-in-95 duration-200 shadow-sm shadow-[var(--nova-accent-color,#ff4e18)]/20 select-none">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--nova-accent-color,#ff4e18)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--nova-accent-color,#ff4e18)]"></span>
                      </span>
                      {typingActivity === 'recording' ? (
                        <>
                          <Mic className="w-2 h-2 text-[var(--nova-accent-color,#ff4e18)] animate-pulse" />
                          <span className="text-[10px] font-semibold text-[var(--nova-accent-color,#ff4e18)] tracking-tight">recording</span>
                          <div className="flex items-center gap-0.5 h-1.5">
                            <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-0.5" />
                            <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.2s] h-1" />
                            <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.4s] h-1" />
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] font-semibold text-[var(--nova-accent-color,#ff4e18)] tracking-tight">typing</span>
                          <div className="flex items-center gap-0.5 pt-px">
                            <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce [animation-delay:-0.32s]" />
                            <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce [animation-delay:-0.16s]" />
                            <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce" />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                      <span className="max-w-[132px] truncate whitespace-nowrap text-[10px] text-[var(--nova-text-muted)] font-normal leading-none">
                        {profile.status}
                      </span>
                    </div>
                  )}
                </div>

                {/* E2EE shield lives outside the name button: interactive
                    elements cannot nest, and a click must not open the profile. */}
                <button
                  type="button"
                  data-testid="e2ee-badge"
                  onClick={() => onOpenProtection?.()}
                  className="hidden @min-[380px]:inline-flex w-7 h-7 shrink-0 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 items-center justify-center transition cursor-pointer active:scale-95"
                  title={t('chat.e2eeBadgeTitle')}
                  aria-label={t('chat.e2eeCardTitle')}
                >
                  <ShieldCheck className="w-3 h-3" />
                </button>

                {/* Header Menu Tabs: [ Chat | Gallery ] */}
                <div className="hidden sm:flex items-center gap-0.5 p-0.5 bg-[var(--nova-surface-raised)] rounded-lg border border-[var(--nova-border-subtle)] select-none shrink-0">
                  <button
                    onClick={() => setActiveHeaderTab('chat')}
                    className={`min-h-6 px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                      activeHeaderTab === 'chat'
                        ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-sm'
                        : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
                    }`}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setActiveHeaderTab('gallery')}
                    className={`min-h-6 px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer flex items-center gap-0.5 ${
                      activeHeaderTab === 'gallery'
                        ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-sm'
                        : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
                    }`}
                  >
                    <ImageIcon className="w-2.5 h-2.5" />
                    <span>Gallery</span>
                    <span className="text-[9px] opacity-80 font-mono">({sharedMediaCount})</span>
                  </button>
                </div>
              </div>

              {avatarPosition === 'right' && (
                <button
                  onClick={onOpenProfile}
                  className={`relative w-11 h-11 rounded-full overflow-hidden border transition-all duration-300 cursor-pointer active:scale-95 shrink-0 ${
                    isTyping
                      ? 'border-[var(--nova-accent-color,#ff4e18)] ring-2 ring-[var(--nova-accent-color,#ff4e18)]/60 shadow-[0_0_16px_rgba(255,78,24,0.6)]'
                      : 'border-[var(--nova-border-color)] ring-2 ring-[var(--nova-accent-color,#ff4e18)]/20'
                  }`}
                  aria-label={t('common.profile')}
                >
                  <LazyMedia
                    src={profile.avatar}
                    alt={profile.name}
                    eager
                    className="w-full h-full object-cover"
                  />
                  {/* Real-time live status beacon on avatar */}
                  {isTyping ? (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] border-2 border-[var(--nova-border-color)] flex items-center justify-center animate-pulse shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-on-accent)] animate-ping" />
                    </span>
                  ) : (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--nova-border-color)] shadow-sm shadow-emerald-500/50" />
                  )}
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {/* Bot /start button */}
              {botId && (
                <button
                  type="button"
                  onClick={() => handleSimulateTypingActivity?.('typing')}
                  className="w-11 h-11 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/10 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border border-[var(--nova-accent-color,#ff4e18)]/30 text-[var(--nova-accent-color,#ff4e18)] flex items-center justify-center transition cursor-pointer active:scale-95"
                  title={t('bot.start')}
                  aria-label={t('bot.start')}
                >
                  <span className="text-[10px] font-bold">{t('bot.start')}</span>
                </button>
              )}

              {/* P2P peer count (visible on wider screens) */}
              {roomPeerCount > 0 && (
                <span
                  data-testid="p2p-peer-count"
                  title={`P2P · ${roomPeerCount}`}
                  className="hidden @min-[400px]:inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30"
                >
                  P2P · {roomPeerCount}
                </span>
              )}

              {/* The E2EE shield is rendered once, next to the contact name. */}

              {/* Voice Call Toggle Button */}
              {handleStartVoiceCall && (
                <button
                  onClick={handleStartVoiceCall}
                  className={`w-11 h-11 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                    isVideoCallOpen && callMode === 'voice'
                      ? 'bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 animate-pulse'
                      : 'bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border-[var(--nova-border-subtle)] hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color,#ff4e18)]'
                  }`}
                  aria-label={
                    isVideoCallOpen && callMode === 'voice'
                      ? 'Voice call in progress (click to view)'
                      : `Start voice call with ${profile.name}`
                  }
                >
                  <Phone className="w-5 h-5" />
                </button>
              )}

              {/* Video Call Toggle Button */}
              <button
                onClick={handleStartVideoCall}
                className={`w-11 h-11 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                  isVideoCallOpen && callMode === 'video'
                    ? 'bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 animate-pulse'
                    : 'bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border-[var(--nova-border-subtle)] hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color,#ff4e18)]'
                }`}
                aria-label={
                  isVideoCallOpen && callMode === 'video'
                    ? 'Video call in progress (click to view)'
                    : `Start video call with ${profile.name}`
                }
              >
                <Video className="w-5 h-5" />
              </button>

              {/* Group Call Buttons (for group chats) */}
              {isGroupChat && handleStartGroupCall && groupMembers.length > 0 && (
                <>
                  <button
                    onClick={() => handleStartGroupCall('voice')}
                    className={`w-11 h-11 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ml-1 ${
                      isGroupCallOpen && callMode === 'voice'
                        ? 'bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 animate-pulse'
                        : 'bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border-[var(--nova-border-subtle)] hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color,#ff4e18)]'
                    }`}
                    aria-label={isGroupCallOpen && callMode === 'voice' ? 'Group voice call in progress' : `Start group voice call (${groupMembers.length + 1} participants)`}
                  >
                    <Phone className="w-5 h-5" />
                    <Users className="w-4 h-4 absolute -top-1 -right-1" />
                  </button>

                  <button
                    onClick={() => handleStartGroupCall('video')}
                    className={`w-11 h-11 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ml-1 ${
                      isGroupCallOpen && callMode === 'video'
                        ? 'bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 animate-pulse'
                        : 'bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border-[var(--nova-border-subtle)] hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color,#ff4e18)]'
                    }`}
                    aria-label={isGroupCallOpen && callMode === 'video' ? 'Group video call in progress' : `Start group video call (${groupMembers.length + 1} participants)`}
                  >
                    <Video className="w-5 h-5" />
                    <Users className="w-4 h-4 absolute -top-1 -right-1" />
                  </button>
                </>
              )}

              {/* Search Messages in Chat Button */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="w-11 h-11 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border border-[var(--nova-border-subtle)] hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color,#ff4e18)] flex items-center justify-center transition cursor-pointer active:scale-95"
                title={t('common.search')}
                aria-label={t('common.search')}
              >
                <Search className="w-5 h-5" />
              </button>

              {/* Pinned Messages Header Button */}
              {pinnedMessages.length > 0 && (
                <button
                  onClick={() => setIsPinnedCarouselOpen((prev) => !prev)}
                  className={`relative w-11 h-11 rounded-full flex items-center justify-center transition cursor-pointer active:scale-95 ${
                    isPinnedCarouselOpen
                      ? 'bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30'
                      : 'bg-[var(--nova-accent-color,#ff4e18)]/20 border border-[var(--nova-accent-color,#ff4e18)]/50 text-[var(--nova-accent-color,#ff4e18)] hover:bg-[var(--nova-accent-color,#ff4e18)]/30'
                  }`}
                  aria-label={isPinnedCarouselOpen ? 'Close pinned messages' : 'View pinned messages'}
                >
                  <Pin className={`w-5 h-5 ${isPinnedCarouselOpen ? 'fill-current' : ''}`} />
                  <span
                    className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center ${
                      isPinnedCarouselOpen
                        ? 'bg-[var(--nova-on-accent)] text-[var(--nova-accent-color,#ff4e18)]'
                        : 'bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] shadow-sm'
                    }`}
                  >
                    {pinnedMessages.length}
                  </span>
                </button>
              )}

              {/* More menu with pending join requests badge */}
              {(isGroupChat || pendingJoinRequests.length > 0) && (
                <div className="relative">
                  <button
                    ref={moreMenuAnchorRef}
                    onClick={() => {
                      setIsMoreMenuOpen?.((prev) => !prev);
                      onOpenMoreMenu?.();
                    }}
                    aria-haspopup="menu"
                    aria-expanded={isMoreMenuOpen}
                    aria-label={t('chat.chatActions')}
                    data-pending-requests={pendingJoinRequests.length || undefined}
                    className={`w-11 h-11 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                      isMoreMenuOpen
                        ? 'bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30'
                        : 'bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border-[var(--nova-border-subtle)] hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color,#ff4e18)]'
                    }`}
                  >
                    <MoreHorizontal className="w-5 h-5" />
                    {isGroupChat && currentUserIsGroupAdmin && pendingJoinRequests.length > 0 && (
                      <span
                        data-testid="join-request-badge"
                        className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-text-primary)] text-[9px] font-bold flex items-center justify-center"
                      >
                        {pendingJoinRequests.length}
                      </span>
                    )}
                  </button>
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
</>
  );
};
