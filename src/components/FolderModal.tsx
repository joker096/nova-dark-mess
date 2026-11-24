import React, { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import {
  X,
  Check,
  FolderPlus,
  Trash2,
  Folder,
  User,
  Briefcase,
  Radio,
  Star,
  Users,
  Shield,
  Crown,
  Gift,
  Rocket,
  Sparkles,
  Heart,
  Lock,
  Bell,
  BellOff,
  VolumeX,
  Volume2,
  Plus,
  MessageSquare,
} from 'lucide-react';
import { usePremium } from '../hooks/usePremium';
import { ChatFolder, ChatItem } from '../types/messenger';
import { LazyMedia } from './LazyMedia';
import {
  getFolderNotificationLevel,
  setFolderNotificationLevel,
  muteFolder,
  getFolderMuteUntil,
  getEffectiveFolderNotificationLevel,
  type NotificationLevel,
} from '../lib/notifications/notificationPrefs';
import {
  SettingsTabs,
  SettingsSection,
  SettingsTile,
  IconCycleButton,
  SettingsSheet,
} from './settings/settingsPrimitives';
import { NovaIconButton } from '../lib/ui/NovaIconButton';

const FOLDER_ICONS = [
  { id: 'folder', icon: Folder, label: 'Folder', premium: false },
  { id: 'user', icon: User, label: 'Personal', premium: false },
  { id: 'briefcase', icon: Briefcase, label: 'Work', premium: false },
  { id: 'radio', icon: Radio, label: 'Channel', premium: false },
  { id: 'star', icon: Star, label: 'Favorite', premium: false },
  { id: 'users', icon: Users, label: 'Group', premium: false },
  { id: 'shield', icon: Shield, label: 'Shield', premium: true },
  { id: 'crown', icon: Crown, label: 'Crown', premium: true },
  { id: 'gift', icon: Gift, label: 'Gift', premium: true },
  { id: 'rocket', icon: Rocket, label: 'Rocket', premium: true },
  { id: 'sparkles', icon: Sparkles, label: 'Sparkles', premium: true },
  { id: 'heart', icon: Heart, label: 'Heart', premium: true },
] as const;

type FolderIconId = (typeof FOLDER_ICONS)[number]['id'];

const ICON_BY_ID: Record<FolderIconId, React.ElementType> = FOLDER_ICONS.reduce(
  (acc, item) => {
    acc[item.id] = item.icon;
    return acc;
  },
  {} as Record<FolderIconId, React.ElementType>
);

const NOTIFICATION_LEVELS: Array<{ value: NotificationLevel; label: string; icon: React.ReactNode }> = [
  { value: 'all', label: 'All', icon: <Bell className="w-3.5 h-3.5" /> },
  { value: 'mentions', label: 'Mentions', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { value: 'none', label: 'None', icon: <VolumeX className="w-3.5 h-3.5" /> },
];

const MUTE_OPTIONS = [
  { value: 60 * 60 * 1000, label: '1 hour' },
  { value: 8 * 60 * 60 * 1000, label: '8 hours' },
  { value: 24 * 60 * 60 * 1000, label: '24 hours' },
] as const;

interface FolderModalProps {
  isOpen: boolean;
  folders: ChatFolder[];
  chats: ChatItem[];
  editingFolder: ChatFolder | null;
  onSave: (folder: ChatFolder) => void;
  onDelete: (folderId: string) => void;
  onClose: () => void;
}

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  folders,
  chats,
  editingFolder,
  onSave,
  onDelete,
  onClose,
}) => {
  const { t } = useLanguage();
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
  const { premium, checkout } = usePremium();

  const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'notifications'>(
    editingFolder ? 'create' : 'create'
  );
  const [name, setName] = useState(editingFolder?.name || '');
  const [selectedIcon, setSelectedIcon] = useState<FolderIconId>((editingFolder?.icon as FolderIconId) || 'folder');
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>(editingFolder?.chatIds || []);
  const [errorMsg, setErrorMsg] = useState('');

  const toggleChatSelection = (chatId: string) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
  };

  const selectOnlyDirect = () => {
    const directIds = chats.filter((c) => c.type === 'direct').map((c) => c.id);
    setSelectedChatIds(directIds);
  };

  const selectOnlyChannels = () => {
    const channelIds = chats.filter((c) => c.isChannel || c.type === 'channel').map((c) => c.id);
    setSelectedChatIds(channelIds);
  };

  const selectOnlyGroups = () => {
    const groupIds = chats.filter((c) => c.type === 'group').map((c) => c.id);
    setSelectedChatIds(groupIds);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg(t('foldersObj.nameError'));
      return;
    }

    const folderToSave: ChatFolder = {
      id: editingFolder ? editingFolder.id : 'folder-' + Date.now(),
      name: trimmed,
      icon: selectedIcon,
      chatIds: selectedChatIds,
      filterType: 'custom',
      isDefault: false,
    };

    onSave(folderToSave);
    onClose();
  };

  const getChatIcon = useMemo(() => {
    return (chat: ChatItem) => {
      if (chat.type === 'channel') return Radio;
      if (chat.type === 'group') return Users;
      return User;
    };
  }, []);

  const tabs = useMemo(
    () => [
      { key: 'create' as const, label: t('foldersObj.newTab'), icon: <FolderPlus className="w-4 h-4" /> },
      { key: 'manage' as const, label: t('foldersObj.manageTab', { count: folders.length }), icon: <Folder className="w-4 h-4" /> },
      { key: 'notifications' as const, label: t('foldersObj.notificationsTab'), icon: <Bell className="w-4 h-4" /> },
    ],
    [t, folders.length]
  );

  // Create Tab Content
  const createTabContent = (
    <form onSubmit={handleSave} className="flex-1 overflow-y-auto no-scrollbar space-y-4">
      <SettingsSection title={t('foldersObj.nameLabel')}>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrorMsg('');
          }}
          placeholder={t('foldersObj.namePlaceholder')}
          className="w-full bg-[var(--nova-surface-high)] border border-[var(--nova-border-subtle)] focus:border-[var(--nova-accent-color)] rounded-xl px-3 py-2 text-sm text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] focus:outline-none transition"
          autoFocus
        />
        {errorMsg && <p className="mt-1 text-[11px] text-red-400 font-medium">{errorMsg}</p>}
      </SettingsSection>

      <SettingsSection title={t('foldersObj.iconLabel')}>
        <div data-testid="folder-icon-list" className="flex gap-2 overflow-x-auto touch-pan-x no-scrollbar pb-2">
          {FOLDER_ICONS.map((item) => {
            const IconComp = ICON_BY_ID[item.id];
            const isSelected = selectedIcon === item.id;
            const isLocked = item.premium && !premium;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (isLocked) {
                    checkout();
                    return;
                  }
                  setSelectedIcon(item.id);
                }}
                disabled={isLocked}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition cursor-pointer ${isLocked ? 'opacity-50 cursor-not-allowed' : ''} ${
                  isSelected
                    ? 'bg-[var(--nova-accent-color)]/20 border-2 border-[var(--nova-accent-color)]/40 shadow-sm shadow-[var(--nova-accent-color)]/25'
                    : 'bg-[var(--nova-surface-high)] border border-[var(--nova-border-subtle)] hover:border-[var(--nova-accent-color)]/30'
                }`}
                aria-label={t(item.label)}
                aria-pressed={isSelected}
              >
                {IconComp && <IconComp className="w-5 h-5 text-[var(--nova-accent-color)]" />}
                {isLocked && <Lock className="absolute -top-1 -right-1 w-4 h-4 text-amber-400" />}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {!editingFolder && (
        <SettingsSection title={t('foldersObj.chatsLabel')}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[var(--nova-text-muted)]">
              {t('foldersObj.includedChats', { selected: selectedChatIds.length, total: chats.length })}
            </span>
            <div className="flex gap-1">
              <NovaIconButton
                icon={<User className="w-3.5 h-3.5" />}
                label={t('foldersObj.directChats')}
                onClick={selectOnlyDirect}
                size={32}
              />
              <NovaIconButton
                icon={<Users className="w-3.5 h-3.5" />}
                label={t('foldersObj.groups')}
                onClick={selectOnlyGroups}
                size={32}
              />
              <NovaIconButton
                icon={<Radio className="w-3.5 h-3.5" />}
                label={t('foldersObj.channels')}
                onClick={selectOnlyChannels}
                size={32}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto no-scrollbar space-y-1.5">
            {chats.map((chat) => {
              const isChecked = selectedChatIds.includes(chat.id);
              const ChatIconComp = getChatIcon(chat);
              return (
                <label key={chat.id} className="flex items-center gap-3 p-2 rounded-xl bg-[var(--nova-surface-high)] border border-[var(--nova-border-subtle)] hover:border-[var(--nova-accent-color)]/30 cursor-pointer transition">
                  <div className="w-8 h-8 rounded-lg bg-[var(--nova-accent-color)]/15 flex items-center justify-center shrink-0">
                    <ChatIconComp className="w-4 h-4 text-[var(--nova-accent-color)]" />
                  </div>
                  <div className="truncate flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--nova-text-primary)] truncate">{chat.name}</p>
                    <p className="text-[10px] text-[var(--nova-text-muted)] truncate">
                      {chat.type === 'channel'
                        ? t('foldersObj.chatTypeChannel')
                        : chat.type === 'group'
                        ? t('foldersObj.chatTypeGroup')
                        : t('foldersObj.chatTypeDirect')}
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition ${
                      isChecked
                        ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-sm'
                        : 'border border-[var(--nova-border-subtle)] bg-[var(--nova-surface)]'
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </label>
              );
            })}
          </div>
        </SettingsSection>
      )}

      <div className="pt-2 flex gap-2">
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-xl bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/90 text-[var(--nova-on-accent)] font-semibold text-xs transition cursor-pointer shadow-lg shadow-[var(--nova-accent-color)]/25 active:scale-95 text-center"
        >
          {editingFolder ? t('foldersObj.saveButton') : t('foldersObj.createButton')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] font-semibold text-xs transition cursor-pointer"
        >
          {t('foldersObj.cancelButton')}
        </button>
      </div>
    </form>
  );

  // Manage Tab Content
  const manageTabContent = (
    <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
      <p className="text-[11px] text-[var(--nova-text-muted)] px-1">{t('foldersObj.manageDescription')}</p>

      <div className="space-y-1.5">
        {folders.map((f) => {
          const count = f.id === 'all' ? chats.length : f.chatIds.length;
          const FolderIconComp = ICON_BY_ID[f.icon as FolderIconId] || Folder;
          return (
            <div key={f.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SettingsTile
                  icon={<FolderIconComp className="w-4 h-4" />}
                  label={f.name}
                  description={t('foldersObj.chatsIncluded', { count })}
                  tone={f.isDefault ? 'default' : 'danger'}
                  badge={f.isDefault ? t('foldersObj.defaultBadge') : undefined}
                  onClick={() => !f.isDefault && onDelete(f.id)}
                  disabled={f.isDefault}
                  testId={`folder-manage-${f.id}`}
                />
              </div>
              {!f.isDefault && (
                <button
                  type="button"
                  onClick={() => onDelete(f.id)}
                  title={t('foldersObj.deleteFolder')}
                  aria-label={t('foldersObj.deleteFolder')}
                  className="w-11 h-11 shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <button
          onClick={() => setActiveTab('create')}
          className="w-full py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] border border-[var(--nova-border-subtle)] text-[var(--nova-text-primary)] text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
        >
          <FolderPlus className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
          <span>{t('foldersObj.addAnother')}</span>
        </button>
      </div>
    </div>
  );

  // Notifications Tab Content
  const notificationsTabContent = (
    <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
      <p className="text-[11px] text-[var(--nova-text-muted)] px-1">{t('foldersObj.notificationsDescription')}</p>

      <div className="space-y-3">
        {folders.filter((f) => !f.isDefault).map((folder) => {
          const level = getFolderNotificationLevel(folder.id);
          const muteUntil = getFolderMuteUntil(folder.id);
          const isMuted = muteUntil && muteUntil > Date.now();
          const effectiveLevel = getEffectiveFolderNotificationLevel(folder.id);
          const FolderIconComp = ICON_BY_ID[folder.icon as FolderIconId] || Folder;

          return (
            <div key={folder.id} className="p-3 rounded-2xl bg-[var(--nova-surface-high)] border border-[var(--nova-border-subtle)] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--nova-accent-color)]/15 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                  <FolderIconComp className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--nova-text-primary)] truncate">{folder.name}</p>
                  <p className="text-[10px] text-[var(--nova-text-muted)]">
                    {isMuted
                      ? t('foldersObj.mutedUntil', {
                          time: new Date(muteUntil).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        })
                      : t('foldersObj.notificationLevel', { level: effectiveLevel })}
                  </p>
                </div>
              </div>

              <SettingsSection title={t('foldersObj.notifyLevel')}>
                <div className="flex items-center gap-2 flex-wrap">
                  {NOTIFICATION_LEVELS.map((lvl) => (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => setFolderNotificationLevel(folder.id, lvl.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                        effectiveLevel === lvl.value
                          ? 'bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/40 text-[var(--nova-accent-color)] shadow-sm'
                          : 'bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]'
                      }`}
                    >
                      {lvl.icon}
                      <span>{t(`foldersObj.level.${lvl.value}`)}</span>
                    </button>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection title={isMuted ? t('foldersObj.muted') : t('foldersObj.muteFor')}>
                <div className="flex items-center gap-2 flex-wrap">
                  {isMuted ? (
                    <button
                      type="button"
                      onClick={() => muteFolder(folder.id, 0)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 transition cursor-pointer"
                    >
                      {t('foldersObj.unmute')}
                    </button>
                  ) : (
                    <>
                      {MUTE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => muteFolder(folder.id, opt.value)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-400 transition cursor-pointer"
                        >
                          {t(`foldersObj.mute${opt.label.replace(' ', '')}`)}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </SettingsSection>
            </div>
          );
        })}
      </div>

      {folders.filter((f) => !f.isDefault).length === 0 && (
        <div className="text-center py-12 text-[var(--nova-text-muted)]">
          <p className="text-sm font-medium mb-1">{t('foldersObj.noCustomFolders')}</p>
          <p className="text-[11px]">{t('foldersObj.createFolderFirst')}</p>
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-modal-title"
        className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-lg p-4 text-[var(--nova-text-primary)] shadow-2xl space-y-4 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-[var(--nova-border-subtle)] pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)]">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 id="folder-modal-title" className="font-bold text-sm text-[var(--nova-text-primary)] leading-tight">
                {editingFolder ? t('foldersObj.editTitle') : t('foldersObj.title')}
              </h3>
              <p className="text-[10px] text-[var(--nova-text-muted)]">{t('foldersObj.subtitle')}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!editingFolder && (
          <SettingsTabs
            tabs={tabs}
            active={activeTab}
            onChange={(key) => setActiveTab(key as 'create' | 'manage' | 'notifications')}
            className="border-b border-[var(--nova-border-subtle)] shrink-0"
          />
        )}

        {activeTab === 'create' && createTabContent}
        {activeTab === 'manage' && manageTabContent}
        {activeTab === 'notifications' && notificationsTabContent}
      </div>
    </div>
  );
};