import React, { useState, useRef, useEffect } from 'react';
import {IconMessageCircle as MessageCircle, IconMessage2 as MessageSquare, IconUsers as Users, IconRadio as Radio, IconSparkles as Sparkles, IconPlus as Plus, IconUser as User, IconUserPlus as UserPlus, IconUpload as Upload, IconHandClick as Hand, IconFolderPlus as FolderPlus, IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight} from '@tabler/icons-react';
import { useLanguage } from '../context/LanguageContext';
import { createPortal } from 'react-dom';
import type { BottomTab } from '../types/navigation';
import { requestFolderManager, useChatFolders } from '../lib/chat/folders';
import {
  FAB_SIDE_EVENT,
  isFabSide,
  readFabSide,
  saveFabSide,
  type FabSide} from '../lib/ui/appearance';

interface BottomNavProps {
  activeTab: BottomTab;
  onTabChange: (tab: BottomNavProps['activeTab']) => void;

  onNewChat?: () => void;
  unreadChats?: number;
  unreadChannels?: number;
  unreadContacts?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,

  onNewChat,
  unreadChats = 0,
  unreadChannels = 0,
  unreadContacts = 0,
}) => {
  const { t } = useLanguage();
  const { folders, activeFolderId, unreadByFolder, selectFolder: selectChatFolder } = useChatFolders();
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [fabSide, setFabSide] = useState<FabSide>(() => readFabSide());
  const fabMenuRef = useRef<HTMLDivElement>(null);
  const folderStripRef = useRef<HTMLDivElement>(null);
  const [folderEdges, setFolderEdges] = useState({ start: false, end: false });

  const tabs = [
    { id: 'chats' as const, icon: MessageSquare, label: t('common.chats'), unread: unreadChats },
    { id: 'contacts' as const, icon: Users, label: t('common.contacts'), unread: unreadContacts },
    { id: 'channels' as const, icon: Radio, label: t('common.channels'), unread: unreadChannels },
    { id: 'premium' as const, icon: Sparkles, label: t('premium.title'), unread: 0 },
  ];

  // Close FAB menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fabMenuRef.current && !fabMenuRef.current.contains(event.target as Node)) {
        setIsFabMenuOpen(false);
      }
    };
    if (isFabMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFabMenuOpen]);

  // Surface the folder strip's scrollable overflow with edge fades.
  useEffect(() => {
    if (activeTab !== 'chats') return;
    const strip = folderStripRef.current;
    if (!strip) return;
    const updateEdges = () => {
      const maxScroll = strip.scrollWidth - strip.clientWidth;
      setFolderEdges({
        start: strip.scrollLeft > 2,
        end: maxScroll > 2 && strip.scrollLeft < maxScroll - 2,
      });
    };
    updateEdges();
    // Widths settle after fonts and unread badges render, so re-measure a frame later.
    const frame = requestAnimationFrame(updateEdges);
    strip.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateEdges) : null;
    observer?.observe(strip);
    return () => {
      cancelAnimationFrame(frame);
      strip.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
      observer?.disconnect();
    };
  }, [activeTab, folders, unreadByFolder]);

  // Keep every mounted FAB on the persisted side, including after a change
  // made by another component or tab (saveFabSide also fires FAB_SIDE_EVENT).
  useEffect(() => {
    const syncFromStorage = () => setFabSide(readFabSide());
    const syncFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setFabSide(isFabSide(detail) ? detail : readFabSide());
    };
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(FAB_SIDE_EVENT, syncFromEvent);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(FAB_SIDE_EVENT, syncFromEvent);
    };
  }, []);

  const handleFabClick = () => setIsFabMenuOpen((prev) => !prev);

  const moveFabToOtherSide = () => {
    const next: FabSide = fabSide === 'right' ? 'left' : 'right';
    setFabSide(next);
    saveFabSide(next);
  };

  const renderFabMenu = () => {
    if (!isFabMenuOpen) return null;

    const menuContent = (
      <div
        ref={fabMenuRef}
        role="dialog"
        aria-label={t('chats.quickActions', { defaultValue: 'Quick Actions' })}
        className="w-56 rounded-3xl border border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)]/98 p-2 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-5 zoom-in-95 duration-200 space-y-1"
      >
        <button
          type="button"
          onClick={() => {
            setIsFabMenuOpen(false);
            onNewChat?.();
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left text-xs font-semibold text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] flex items-center justify-center">
            <UserPlus className="w-4 h-4" />
          </div>
          <span>{t('chats.newChat', { defaultValue: 'New Chat' })}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsFabMenuOpen(false);
            onNewChat?.();
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left text-xs font-semibold text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <span>{t('chats.newGroup', { defaultValue: 'New Group' })}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsFabMenuOpen(false);
            document.getElementById('vcf-file-input')?.click();
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left text-xs font-semibold text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
            <Upload className="w-4 h-4" />
          </div>
          <span>{t('contacts.import', { defaultValue: 'Import VCF' })}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsFabMenuOpen(false);
            moveFabToOtherSide();
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left text-xs font-semibold text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
          aria-label={t('chats.fabOtherSide', { defaultValue: 'Move button to the other side' })}
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Hand className="w-4 h-4" />
          </div>
          <span>
            {fabSide === 'right'
              ? t('chats.fabMoveLeft', { defaultValue: 'Move button left (left hand)' })
              : t('chats.fabMoveRight', { defaultValue: 'Move button right (right hand)' })}
          </span>
        </button>
      </div>
    );

    // Portal the menu to body for proper stacking
    return createPortal(
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pointer-events-none">
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsFabMenuOpen(false)}
        />
        <div
          className={`flex justify-${fabSide === 'right' ? 'end' : 'start'} ${activeTab === 'chats' ? 'pb-36' : 'pb-20'} px-4 pointer-events-auto`}
        >
          {menuContent}
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[var(--nova-surface)] border-t border-[var(--nova-border-subtle)] safe-area-screen"
        role="navigation"
        aria-label={t('common.navigation')}
      >
        {activeTab === 'chats' && (
          <div className="relative border-b border-[var(--nova-border-subtle)]">
          <div
            ref={folderStripRef}
            data-testid="nav-folders"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar px-3 pt-2 pb-1.5 scroll-smooth"
          >
            {folders.map((folder) => {
              const isActive = folder.id === activeFolderId;
              const unread = unreadByFolder[folder.id] ?? 0;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    selectChatFolder(folder.id);
                    if (activeTab !== 'chats') onTabChange('chats');
                  }}
                  className={`shrink-0 inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition active:scale-95 cursor-pointer min-h-[32px] ${
                    isActive
                      ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-sm shadow-[var(--nova-accent-color)]/25'
                      : 'bg-[var(--nova-surface-raised)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] border border-[var(--nova-border-subtle)]'
                  }`}
                  aria-pressed={isActive}
                  aria-label={unread > 0 ? `${folder.name}: ${unread} ${t('chats.unreadCount')}` : folder.name}
                >
                  <span>{folder.name}</span>
                  {unread > 0 && (
                    <span
                      data-testid={`folder-unread-${folder.id}`}
                      aria-hidden="true"
                      className={`ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-[16px] ${
                        isActive
                          ? 'bg-[var(--nova-on-accent)] text-[var(--nova-accent-color)]'
                          : 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)]'
                      }`}
                    >
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={requestFolderManager}
              className="shrink-0 w-8 h-8 rounded-full bg-[var(--nova-surface-raised)] hover:bg-[var(--nova-accent-color)] hover:text-[var(--nova-on-accent)] border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] flex items-center justify-center transition active:scale-95 cursor-pointer"
              aria-label={t('foldersObj.addAnother', { defaultValue: 'Manage folders' })}
              title={t('foldersObj.title', { defaultValue: 'Chat Folders' })}
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
          {folderEdges.start && (
            <div
              data-testid="nav-folders-edge-start"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 flex w-7 items-center bg-gradient-to-r from-[var(--nova-surface)] via-[var(--nova-surface)]/90 to-transparent pl-0.5 text-[var(--nova-text-muted)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </div>
          )}
          {folderEdges.end && (
            <div
              data-testid="nav-folders-edge-end"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 flex w-7 items-center justify-end bg-gradient-to-l from-[var(--nova-surface)] via-[var(--nova-surface)]/90 to-transparent pr-0.5 text-[var(--nova-text-muted)]"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          )}
          </div>
        )}

        <div className="flex items-center justify-around h-16 px-2">
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id;
            const isCenter = index === 2; // Center position (channels)

            if (isCenter) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`relative flex flex-col items-center justify-center gap-1 px-4 py-2 transition-all duration-200 cursor-pointer min-h-[44px] ${isActive ? 'text-[var(--nova-accent-color)]' : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'}`}
                  aria-label={tab.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <tab.icon className={`w-7 h-7 ${isActive ? 'fill-[var(--nova-accent-color)]' : ''}`} />
                  <span className={`text-[10px] font-medium ${isActive ? 'text-[var(--nova-accent-color)]' : 'text-[var(--nova-text-secondary)]'}`}>{tab.label}</span>
                  {tab.unread > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 min-w-[18px] rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[9px] font-bold flex items-center justify-center shadow-sm">
                      {tab.unread > 99 ? '99+' : tab.unread}
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-1 px-4 py-2 transition-all duration-200 cursor-pointer min-h-[44px] ${isActive ? 'text-[var(--nova-accent-color)]' : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'}`}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <tab.icon className={`w-7 h-7 ${isActive ? 'fill-[var(--nova-accent-color)]' : ''}`} />
                <span className={`text-[10px] font-medium ${isActive ? 'text-[var(--nova-accent-color)]' : 'text-[var(--nova-text-secondary)]'}`}>{tab.label}</span>
                {tab.unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 min-w-[18px] rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[9px] font-bold flex items-center justify-center shadow-sm">
                    {tab.unread > 99 ? '99+' : tab.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Integrated FAB - positioned above the nav bar, not overlapping tabs */}
      <div
        className={`fixed safe-bottom-fab lg:hidden z-35 flex flex-col items-center pointer-events-auto transition-all duration-200 ${fabSide === 'right' ? 'right-4' : 'left-4'}`}
        data-fab-side={fabSide}
        style={
          activeTab === 'chats'
            ? { bottom: 'calc(7.75rem + var(--nova-safe-bottom, 0px))' }
            : undefined
        }
      >
        {renderFabMenu()}

        <button
          type="button"
          onClick={handleFabClick}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 active:scale-90 cursor-pointer ${
            isFabMenuOpen
              ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-[var(--nova-accent-color)]/50 rotate-45'
              : 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-[var(--nova-accent-color)]/40'
          }`}
          aria-label={t('chats.fabLabel', { defaultValue: 'New Action' })}
          aria-expanded={isFabMenuOpen}
          aria-haspopup="dialog"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </>
  );
};

export default BottomNav;











