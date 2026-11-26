import React, { useState, useRef, useEffect } from 'react';
import {
  IconArrowLeft as ArrowLeft,
  IconChevronDown as ChevronDown,
  IconChevronUp as ChevronUp,
  IconFilter as ListFilter,
  IconMicrophone as Mic,
  IconPhone as Phone,
  IconPhoto as ImageIcon,
  IconPin as Pin,
  IconSearch as Search,
  IconShieldCheck as ShieldCheck,
  IconUsers as Users,
  IconVideo as Video,
  IconX as X,
  IconDotsVertical as MoreVertical,
} from '@tabler/icons-react';
import { ChatMessage } from '../../types/messenger';
import { PremiumFeature } from '../../hooks/usePremium';
import { useLanguage } from '../../context/LanguageContext';
import { ChatTheme } from './chatTheme';
import { LazyMedia } from '../LazyMedia';
import type { GroupJoinRequest } from '../../lib/social/groupJoinRequests';
import { NovaIconButton } from '../../lib/ui';

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
  onOpenGroupMembers?: () => void;
}

type ActionItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: number;
  variant?: 'default' | 'danger';
};

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
  activeHeaderTab,
  setActiveHeaderTab,
  sharedMediaCount,
  isVideoCallOpen,
  handleStartVideoCall,
  pinnedMessages,
  setIsPinnedCarouselOpen,
  onOpenProtection,
  // Enhanced features
  avatarPosition = 'left',
  roomPeerCount = 0,
  isGroupChat = false,
  groupMembers = [],
  handleStartVoiceCall,
  handleStartGroupCall,
  callMode = 'video',
  pendingJoinRequests = [],
  currentUserIsGroupAdmin = false,
  setIsMoreMenuOpen,
  moreMenuAnchorRef,
  onOpenMoreMenu,
  onOpenGroupMembers,
}) => {
  const { t } = useLanguage();
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const primaryActions = React.useMemo<ActionItem[]>(() => {
    const actions: ActionItem[] = [];

    if (handleStartVoiceCall) {
      actions.push({
        key: 'voice-call',
        label: t('chat.voiceCall'),
        icon: <Phone className="w-[19px] h-[19px]" />,
        onClick: handleStartVoiceCall,
      });
    }

    actions.push({
      key: 'video-call',
      label: t('chat.videoCall'),
      icon: <Video className="w-[19px] h-[19px]" />,
      onClick: handleStartVideoCall,
    });

    actions.push({
      key: 'search',
      label: t('common.search'),
      icon: <Search className="w-[19px] h-[19px]" />,
      onClick: () => setIsSearchOpen(true),
    });

    if (pinnedMessages.length > 0) {
      actions.push({
        key: 'pinned',
        label: t('chat.pinnedMessages'),
        icon: <Pin className="w-[19px] h-[19px]" />,
        onClick: () => setIsPinnedCarouselOpen((prev) => !prev),
        badge: pinnedMessages.length,
      });
    }

    return actions;
  }, [handleStartVoiceCall, handleStartVideoCall, pinnedMessages.length, setIsSearchOpen, setIsPinnedCarouselOpen, t]);

  const secondaryActions = React.useMemo<ActionItem[]>(() => {
    const actions: ActionItem[] = [];

    // Contact/Group info (opens full chat actions / profile sheet)
    actions.push({
      key: 'info',
      label: isGroupChat ? t('chat.groupInfo') : t('chat.contactInfo'),
      icon: <Users className="w-[18px] h-[18px]" />,
      onClick: () => {
        onOpenMoreMenu?.();
        setIsMoreMenuOpen?.(true);
      },
    });

    // Media, files, links (opens Gallery)
    actions.push({
      key: 'media',
      label: t('chat.mediaFilesLinks'),
      icon: <ImageIcon className="w-[18px] h-[18px]" />,
      badge: sharedMediaCount > 0 ? sharedMediaCount : undefined,
      onClick: () => setActiveHeaderTab(activeHeaderTab === 'gallery' ? 'chat' : 'gallery'),
    });

    // Group voice/video calls
    if (isGroupChat && handleStartGroupCall && groupMembers.length > 0) {
      actions.push({
        key: 'group-voice',
        label: t('chat.groupVoiceCall', { count: groupMembers.length + 1 }),
        icon: <Phone className="w-[18px] h-[18px]" />,
        onClick: () => handleStartGroupCall('voice'),
      });
      actions.push({
        key: 'group-video',
        label: t('chat.groupVideoCall', { count: groupMembers.length + 1 }),
        icon: <Video className="w-[18px] h-[18px]" />,
        onClick: () => handleStartGroupCall('video'),
      });
    }

    return actions;
  }, [isGroupChat, groupMembers.length, handleStartGroupCall, activeHeaderTab, setActiveHeaderTab, sharedMediaCount, onOpenMoreMenu, setIsMoreMenuOpen, t]);

  const showActionsMenu = secondaryActions.length > 0 || pendingJoinRequests.length > 0;

  return (
    <header className="shrink-0 relative z-30 bg-[var(--nova-surface)]/92 backdrop-blur-xl border-b border-[var(--nova-border-subtle)] px-2 sm:px-3 py-1.5 flex items-center justify-between gap-1.5 min-h-[54px]">
      {isSearchOpen ? (
        /* ACTIVE SEARCH BAR HEADER WITH WORD STEPPER & CONTROLS */
        <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-150">
          <NovaIconButton
            label={t('common.back')}
            icon={<ArrowLeft />}
            size={36}
            variant="ghost"
            onClick={handleCloseSearch}
          />

          <div className="flex-1 bg-[var(--nova-surface-raised)]/80 border border-[var(--nova-border-subtle)] focus-within:border-[var(--nova-accent-color)] rounded-full px-3 py-1.5 flex items-center gap-1.5 min-w-0 relative transition-colors">
            <Search className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0 pointer-events-none" />
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
              className="w-full bg-transparent text-[13px] text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] focus:outline-none py-0.5 min-w-0"
            />

            {searchQuery && (
              <NovaIconButton
                label={t('common.close')}
                icon={<X />}
                size={32}
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  setSearchQuery('');
                  setActiveMatchIndex(0);
                  searchInputRef.current?.focus();
                }}
              />
            )}

            {/* Match counter badge */}
            {searchQuery.trim() && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] shrink-0 font-semibold whitespace-nowrap">
                {matchingMessages.length > 0
                  ? `${activeMatchIndex + 1}/${matchingMessages.length}`
                  : '0/0'}
              </span>
            )}
          </div>

          {/* Stepper buttons: Jump Up / Down through matches */}
          {searchQuery.trim() && matchingMessages.length > 0 && (
            <div className="flex items-center gap-0.5 shrink-0">
              <NovaIconButton
                label={t('common.previous')}
                icon={<ChevronUp />}
                size={36}
                variant="ghost"
                onClick={handlePrevMatch}
              />
              <NovaIconButton
                label={t('common.next')}
                icon={<ChevronDown />}
                size={36}
                variant="ghost"
                onClick={handleNextMatch}
              />
            </div>
          )}

          {/* Toggle View Mode: Filter Only vs Context Stream */}
          {searchQuery.trim() && (
            <NovaIconButton
              label={searchFilterMode === 'filtered' ? 'Show context' : 'Filter only'}
              icon={<ListFilter />}
              size={36}
              variant={searchFilterMode === 'filtered' ? 'primary' : 'ghost'}
              onClick={() =>
                setSearchFilterMode((mode) =>
                  mode === 'context' ? 'filtered' : 'context'
                )
              }
              title={
                searchFilterMode === 'filtered'
                  ? 'Showing filtered matches only. Click for conversation context.'
                  : 'Showing conversation context. Click to filter only matching messages.'
              }
            />
          )}
        </div>
      ) : (
        /* STANDARD TELEGRAM-STYLE CHAT HEADER */
        <>
          {/* Mobile back button */}
          <NovaIconButton
            label={t('a11y.backToChats')}
            icon={<ArrowLeft />}
            size={36}
            variant="ghost"
            className="lg:hidden shrink-0"
            onClick={onBack}
          />

          {/* Avatar + Left-aligned 2-line identity stack */}
          <div className={`flex items-center gap-2.5 min-w-0 flex-1 ${avatarPosition === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
            {avatarPosition === 'left' && (
              <button
                type="button"
                onClick={onOpenProfile}
                className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden transition-all duration-200 cursor-pointer active:scale-95 shrink-0"
                aria-label={t('common.profile')}
              >
                <LazyMedia
                  src={profile.avatar}
                  alt={profile.name}
                  eager
                  className="w-full h-full object-cover"
                />
                {isTyping ? (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--nova-accent-color,#ff4e18)] border-2 border-[var(--nova-surface)] animate-pulse" />
                ) : (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--nova-surface)]" />
                )}
              </button>
            )}

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                onClick={onOpenProfile}
                className="flex flex-col items-start min-w-0 cursor-pointer focus:outline-none group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenProfile();
                  }
                }}
              >
                <div className="flex items-center gap-1.5 max-w-full">
                  <span className="font-semibold text-[15px] leading-tight text-[var(--nova-text-primary)] tracking-tight group-hover:text-[var(--nova-accent-color,#ff4e18)] transition truncate">
                    {profile.name}
                  </span>
                  {roomPeerCount > 0 && (
                    <span
                      data-testid="p2p-peer-count"
                      title={`P2P · ${roomPeerCount}`}
                      className="hidden @min-[400px]:inline-flex px-1.5 py-px rounded-full text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 shrink-0"
                    >
                      P2P · {roomPeerCount}
                    </span>
                  )}
                </div>

                {/* Telegram-style single-line status / typing indicator */}
                {isTyping ? (
                  <div className="flex items-center gap-1 mt-0.5 select-none">
                    {typingActivity === 'recording' ? (
                      <>
                        <Mic className="w-3 h-3 text-[var(--nova-accent-color,#ff4e18)] animate-pulse" />
                        <span className="text-[12px] leading-tight font-medium text-[var(--nova-accent-color,#ff4e18)]">
                          recording audio...
                        </span>
                      </>
                    ) : (
                      <span className="text-[12px] leading-tight font-medium text-[var(--nova-accent-color,#ff4e18)]">
                        typing...
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="max-w-[180px] sm:max-w-[260px] truncate text-[12px] leading-tight text-[var(--nova-text-muted)] font-normal mt-0.5 select-none">
                    {profile.status}
                  </span>
                )}
              </div>

              {/* E2EE shield lives outside the name button */}
              <button
                type="button"
                data-testid="e2ee-badge"
                onClick={() => onOpenProtection?.()}
                className="hidden @min-[380px]:inline-flex w-6 h-6 shrink-0 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 items-center justify-center transition cursor-pointer active:scale-95"
                title={t('chat.e2eeBadgeTitle')}
                aria-label={t('chat.e2eeCardTitle')}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>

              {/* Header Menu Tabs: [ Chat | Gallery ] (shown on md+ or when Gallery is active) */}
              <div
                className={`${activeHeaderTab === 'gallery' ? 'flex' : 'hidden md:flex'} items-center gap-0.5 p-0.5 bg-[var(--nova-surface-raised)] rounded-lg border border-[var(--nova-border-subtle)] select-none shrink-0 ml-1`}
                role="tablist"
                aria-label={t('chat.headerTabs', { defaultValue: 'Chat view' })}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeHeaderTab === 'chat'}
                  onClick={() => setActiveHeaderTab('chat')}
                  className={`min-h-6 px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                    activeHeaderTab === 'chat'
                      ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-sm'
                      : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
                  }`}
                  aria-label={t('chat.tabChat', { defaultValue: 'Chat' })}
                >
                  Chat
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeHeaderTab === 'gallery'}
                  onClick={() => setActiveHeaderTab('gallery')}
                  className={`min-h-6 px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                    activeHeaderTab === 'gallery'
                      ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-sm'
                      : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
                  }`}
                  aria-label={t('chat.tabGallery', { defaultValue: 'Gallery' })}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Gallery</span>
                  <span className="text-[10px] opacity-80 font-mono">({sharedMediaCount})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right-aligned Telegram-style ghost action icons */}
          <div className="flex items-center gap-0.5 shrink-0">
            {primaryActions.map((action) => {
              const isCallActive =
                (action.key === 'voice-call' && isVideoCallOpen && callMode === 'voice') ||
                (action.key === 'video-call' && isVideoCallOpen && callMode === 'video');
              const hideOnSmallMobile = action.key === 'video-call';
              return (
                <NovaIconButton
                  key={action.key}
                  label={action.label}
                  icon={action.icon}
                  size={36}
                  variant={isCallActive ? 'primary' : 'ghost'}
                  className={`transition cursor-pointer active:scale-95 ${
                    hideOnSmallMobile ? 'hidden sm:flex' : 'flex'
                  } ${isCallActive ? 'animate-pulse' : ''}`}
                  onClick={() => {
                    action.onClick();
                    setIsActionsMenuOpen(false);
                  }}
                  badge={action.badge}
                />
              );
            })}

            {/* Vertical More Menu (⋮) */}
            {showActionsMenu && (
              <div className="relative" ref={actionsMenuRef}>
                <NovaIconButton
                  ref={moreMenuAnchorRef}
                  label={t('chat.moreActions')}
                  icon={<MoreVertical />}
                  size={36}
                  variant="ghost"
                  className="transition cursor-pointer active:scale-95"
                  onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                  aria-expanded={isActionsMenuOpen}
                  aria-haspopup="menu"
                  badge={pendingJoinRequests.length > 0 ? pendingJoinRequests.length : undefined}
                  badgeTestId="join-request-badge"
                />

                {isActionsMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-56 bg-[var(--bg-surface)]/[0.97] backdrop-blur-xl border border-[var(--border-strong)] rounded-xl p-1.5 shadow-[var(--shadow-2)] overflow-hidden z-40 animate-in fade-in zoom-in-95 duration-100"
                    role="menu"
                  >
                    {/* Mobile-only Video Call shortcut */}
                    <button
                      type="button"
                      onClick={() => {
                        handleStartVideoCall();
                        setIsActionsMenuOpen(false);
                      }}
                      className="sm:hidden w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[13px] font-medium text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] transition cursor-pointer"
                      role="menuitem"
                    >
                      <Video className="w-[18px] h-[18px] text-[var(--nova-text-secondary)]" />
                      <span>{t('chat.videoCall')}</span>
                    </button>

                    {/* Secondary actions */}
                    {secondaryActions.map((action) => (
                      <button
                        type="button"
                        key={action.key}
                        onClick={() => {
                          action.onClick();
                          setIsActionsMenuOpen(false);
                        }}
                        className={`w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[13px] font-medium hover:bg-[var(--nova-overlay-medium)] transition cursor-pointer ${
                          action.variant === 'danger' ? 'text-red-400' : 'text-[var(--nova-text-primary)]'
                        }`}
                        role="menuitem"
                      >
                        <span className="w-[18px] h-[18px] flex items-center justify-center text-[var(--nova-text-secondary)]">{action.icon}</span>
                        <span className="flex-1 text-left truncate">{action.label}</span>
                        {action.badge !== undefined && action.badge > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[10px] font-bold flex items-center justify-center">
                            {action.badge}
                          </span>
                        )}
                      </button>
                    ))}

                    {isGroupChat && onOpenGroupMembers && (
                      <>
                        <div className="h-px bg-[var(--border-strong)] my-1" role="separator" />
                        <button
                          type="button"
                          onClick={() => {
                            onOpenGroupMembers();
                            setIsActionsMenuOpen(false);
                          }}
                          className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[13px] font-medium text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] transition cursor-pointer"
                          role="menuitem"
                        >
                          <Users className="w-[18px] h-[18px] text-[var(--nova-text-secondary)]" />
                          <span>{t('chat.groupMembers')}</span>
                        </button>
                      </>
                    )}

                    {/* Pending join requests */}
                    {isGroupChat && currentUserIsGroupAdmin && pendingJoinRequests.length > 0 && (
                      <>
                        <div className="h-px bg-[var(--border-strong)] my-1" role="separator" />
                        <button
                          type="button"
                          onClick={() => {
                            setIsMoreMenuOpen?.(true);
                            onOpenMoreMenu?.();
                            setIsActionsMenuOpen(false);
                          }}
                          className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-[13px] font-medium text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] transition cursor-pointer"
                          role="menuitem"
                        >
                          <Users className="w-[18px] h-[18px] text-[var(--nova-text-secondary)]" />
                          <span className="flex-1 text-left truncate">{t('chat.pendingRequests')}</span>
                          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[10px] font-bold flex items-center justify-center">
                            {pendingJoinRequests.length}
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </header>
  );
};
