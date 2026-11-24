import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Users, Radio, Sparkles, Plus, User, X, UserPlus, Upload, Hand } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { NovaIconButton } from '../lib/ui';
import { createPortal } from 'react-dom';

interface BottomNavProps {
  activeTab: 'chats' | 'contacts' | 'channels' | 'profile' | 'premium';
  onTabChange: (tab: BottomNavProps['activeTab']) => void;
  fabSide: 'left' | 'right';
  onFabToggle?: () => void;
  onNewChat?: () => void;
  unreadChats?: number;
  unreadChannels?: number;
  unreadContacts?: number;
  premium?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  fabSide,
  onFabToggle,
  onNewChat,
  unreadChats = 0,
  unreadChannels = 0,
  unreadContacts = 0,
  premium = false,
}) => {
  const { t } = useLanguage();
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const fabMenuRef = useRef<HTMLDivElement>(null);

  const tabs = [
    { id: 'chats' as const, icon: MessageSquare, label: t('common.chats'), unread: unreadChats },
    { id: 'contacts' as const, icon: Users, label: t('common.contacts'), unread: unreadContacts },
    { id: 'channels' as const, icon: Radio, label: t('common.channels'), unread: unreadChannels },
    { id: 'profile' as const, icon: User, label: t('common.profile'), unread: 0 },
    { id: 'premium' as const, icon: Sparkles, label: t('premium.title'), unread: 0 },
  ];

  const isCenterTab = activeTab === 'channels';
  const fabOffset = fabSide === 'right' ? 'pr-16' : 'pl-16';

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

  const handleFabClick = () => {
    if (onFabToggle) {
      onFabToggle();
    } else {
      setIsFabMenuOpen((prev) => !prev);
    }
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
            onFabToggle?.();
            setIsFabMenuOpen(false);
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
          className={`flex justify-${fabSide === 'right' ? 'end' : 'start'} pb-20 px-4 pointer-events-auto`}
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
        <div className={`flex items-center justify-around h-16 px-2 ${fabOffset}`}>
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
                  <span className="text-[10px] font-medium">{tab.label}</span>
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
                <span className="text-[10px] font-medium">{tab.label}</span>
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
        className={`fixed bottom-20 lg:hidden z-35 flex flex-col items-center pointer-events-auto transition-all duration-200 ${fabSide === 'right' ? 'right-4' : 'left-4'}`}
        data-fab-side={fabSide}
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