import React, { useState } from 'react';
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
} from 'lucide-react';
import { usePremium } from '../hooks/usePremium';
import { useWheelScroll } from '../lib/ui/useWheelScroll';
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

interface FolderModalProps {
  isOpen: boolean;
  folders: ChatFolder[];
  chats: ChatItem[];
  editingFolder: ChatFolder | null;
  onSave: (folder: ChatFolder) => void;
  onDelete: (folderId: string) => void;
  onClose: () => void;
}

const FOLDER_ICONS: Array<{
  id: string;
  icon: React.ElementType;
  label: string;
  premium?: boolean;
}> = [
  { id: 'folder', icon: Folder, label: 'Folder' },
  { id: 'user', icon: User, label: 'Personal' },
  { id: 'briefcase', icon: Briefcase, label: 'Work' },
  { id: 'radio', icon: Radio, label: 'Channel' },
  { id: 'star', icon: Star, label: 'Favorite' },
  { id: 'users', icon: Users, label: 'Group' },
  { id: 'shield', icon: Shield, label: 'Shield', premium: true },
  { id: 'crown', icon: Crown, label: 'Crown', premium: true },
  { id: 'gift', icon: Gift, label: 'Gift', premium: true },
  { id: 'rocket', icon: Rocket, label: 'Rocket', premium: true },
  { id: 'sparkles', icon: Sparkles, label: 'Sparkles', premium: true },
  { id: 'heart', icon: Heart, label: 'Heart', premium: true },
];

const ICON_BY_ID: Record<string, React.ElementType> = Object.fromEntries(
  FOLDER_ICONS.map((i) => [i.id, i.icon])
);

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
  const [selectedIcon, setSelectedIcon] = useState(editingFolder?.icon || 'folder');
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>(
    editingFolder?.chatIds || []
  );
  const [errorMsg, setErrorMsg] = useState('');
  const iconRowRef = useWheelScroll();

  if (!isOpen) return null;

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

  // Render active tab content to avoid complex ternary chain in JSX
  const tabContent = (() => {
    // Helper to get folder icon component for a chat
    const getChatIcon = (chat: ChatItem) => {
      if (chat.type === 'channel') return Radio;
      if (chat.type === 'group') return Users;
      return User;
    };

    if (activeTab === 'create') {
      return (
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto no-scrollbar space-y-3.5">
          {/* Folder Name Input */}
          <div>
            <label className="block text-[11px] font-semibold text-[#868b98] mb-1">
              {t('foldersObj.nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMsg('');
              }}
              placeholder={t('foldersObj.namePlaceholder')}
              className="w-full bg-[#1b1c28] border border-white/10 focus:border-[var(--nova-accent-color)] rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none transition shadow-inner"
              autoFocus
            />
            {errorMsg && (
              <p className="text-[10px] text-red-400 mt-1 font-medium">{errorMsg}</p>
            )}
          </div>

          {/* Folder Icon Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[#868b98] mb-1">
              {t('foldersObj.iconLabel')}
            </label>
            <div data-testid="folder-icon-list" className="flex gap-2 overflow-x-auto touch-pan-x no-scrollbar pb-2">
              {FOLDER_ICONS.map((item) => {
                const IconComp = ICON_BY_ID[item.id];
                const isSelected = selectedIcon === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedIcon(item.id)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/40 shadow-sm shadow-[var(--nova-accent-color)]/25'
                        : 'bg-[#1b1c28] border border-white/10 hover:border-white/20'
                    }`}
                  >
                    {IconComp && <IconComp className="w-5 h-5 text-[var(--nova-accent-color)]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat Selection */}
          {!editingFolder && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[11px] font-semibold text-[#868b98]">
                  {t('foldersObj.chatsLabel')}
                </label>
                <span className="text-[10px] text-[#717682]">{t('foldersObj.chatsIncluded', { selected: selectedChatIds.length, total: chats.length })}</span>
              </div>
              <div className="max-h-48 overflow-y-auto no-scrollbar space-y-1.5">
                {chats.map((chat) => {
                  const isChecked = selectedChatIds.includes(chat.id);
                  const ChatIconComp = getChatIcon(chat);
                  return (
                    <label key={chat.id} className="flex items-center gap-3 p-2 rounded-xl bg-[#1b1c28] border border-white/5 hover:border-white/10 cursor-pointer transition">
                      <div className="w-8 h-8 rounded-lg bg-[#252838] flex items-center justify-center shrink-0">
                        <ChatIconComp className="w-4 h-4 text-[var(--nova-accent-color)]" />
                      </div>
                      <div className="truncate flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{chat.name}</p>
                        <p className="text-[10px] text-[#717682] truncate">
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
                            ? 'bg-[var(--nova-accent-color)] text-white shadow-sm'
                            : 'border border-white/20 bg-black/20'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5d2b)] text-white font-semibold text-xs transition cursor-pointer shadow-lg shadow-[var(--nova-accent-color)]/25 active:scale-95 text-center"
            >
              {editingFolder ? t('foldersObj.saveButton') : t('foldersObj.createButton')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-semibold text-xs transition cursor-pointer"
            >
              {t('foldersObj.cancelButton')}
            </button>
          </div>
        </form>
      );
    }

    if (activeTab === 'manage') {
      return (
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
          <p className="text-[11px] text-[#868b98] px-1">
            {t('foldersObj.manageDescription')}
          </p>

          <div className="space-y-1.5">
            {folders.map((f) => {
              const count = f.id === 'all' ? chats.length : f.chatIds.length;
              const FolderIconComp = ICON_BY_ID[f.icon] || Folder;
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-3 p-2 rounded-xl bg-[#1b1c28] border border-white/5 transition hover:bg-[#222430]"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#252838] flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                    <FolderIconComp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{f.name}</p>
                    <p className="text-[10px] text-[#717682]">{t('foldersObj.chatsIncluded', { count })}</p>
                  </div>

                  {f.isDefault ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/40 shrink-0">
                      {t('foldersObj.defaultBadge')}
                    </span>
                  ) : (
                    <button
                      onClick={() => onDelete(f.id)}
                      className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition cursor-pointer"
                      title={t('foldersObj.deleteFolder')}
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
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
              <span>{t('foldersObj.addAnother')}</span>
            </button>
          </div>
        </div>
      );
    }

    // notifications tab
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
        <p className="text-[11px] text-[#868b98] px-1">
          {t('foldersObj.notificationsDescription')}
        </p>

        <div className="space-y-3">
          {folders.filter((f) => !f.isDefault).map((folder) => {
            const level = getFolderNotificationLevel(folder.id);
            const muteUntil = getFolderMuteUntil(folder.id);
            const isMuted = muteUntil && muteUntil > Date.now();
            const effectiveLevel = getEffectiveFolderNotificationLevel(folder.id);
            const FolderIconComp = ICON_BY_ID[folder.icon] || Folder;

            return (
              <div
                key={folder.id}
                className="p-3 rounded-2xl bg-[#1b1c28] border border-white/5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#252838] flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                    <FolderIconComp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{folder.name}</p>
                    <p className="text-[10px] text-[#717682]">
                      {isMuted
                        ? t('foldersObj.mutedUntil', {
                            time: new Date(muteUntil).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          })
                        : t('foldersObj.notificationLevel', {
                            level: effectiveLevel,
                          })}
                    </p>
                  </div>
                </div>

                {/* Notification Level Selector */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-[#868b98] shrink-0">
                    {t('foldersObj.notifyLevel')}
                  </span>
                  {(['all', 'mentions', 'none'] as NotificationLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setFolderNotificationLevel(folder.id, lvl)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                        effectiveLevel === lvl
                          ? 'bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/40 text-[var(--nova-accent-color)] shadow-sm'
                          : 'bg-[#101118] border border-white/10 text-white/70 hover:border-white/20'
                      }`}
                    >
                      {t(`foldersObj.level.${lvl}`)}
                    </button>
                  ))}
                </div>

                {/* Mute Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isMuted ? (
                    <button
                      type="button"
                      onClick={() => muteFolder(folder.id, 0)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-400 transition cursor-pointer"
                    >
                      {t('foldersObj.unmute')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => muteFolder(folder.id, 60 * 60 * 1000)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-400 transition cursor-pointer"
                      >
                        {t('foldersObj.mute1h')}
                      </button>
                      <button
                        type="button"
                        onClick={() => muteFolder(folder.id, 8 * 60 * 60 * 1000)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-400 transition cursor-pointer"
                      >
                        {t('foldersObj.mute8h')}
                      </button>
                      <button
                        type="button"
                        onClick={() => muteFolder(folder.id, 24 * 60 * 60 * 1000)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 transition cursor-pointer"
                      >
                        {t('foldersObj.mute24h')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {folders.filter((f) => !f.isDefault).length === 0 && (
          <div className="text-center py-12 text-[#717682]">
            <p className="text-sm font-medium mb-1">{t('foldersObj.noCustomFolders')}</p>
            <p className="text-[11px]">{t('foldersObj.createFolderFirst')}</p>
          </div>
        )}
      </div>
    );
  })();

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
        className="bg-[#151621] border border-white/10 rounded-3xl w-full max-w-lg p-4 text-white shadow-2xl space-y-4 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)]">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 id="folder-modal-title" className="font-bold text-sm text-white leading-tight">
                {editingFolder ? t('foldersObj.editTitle') : t('foldersObj.title')}
              </h3>
              <p className="text-[10px] text-[#828795]">
                {t('foldersObj.subtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch: New Folder vs Manage All vs Notifications */}
        {!editingFolder && (
          <div className="flex bg-[#101118] p-1 rounded-xl border border-white/5 shrink-0">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-[#222430] text-white shadow'
                  : 'text-[#828795] hover:text-white'
              }`}
            >
              {t('foldersObj.newTab')}
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                activeTab === 'manage'
                  ? 'bg-[#222430] text-white shadow'
                  : 'text-[#828795] hover:text-white'
              }`}
            >
              {t('foldersObj.manageTab', { count: folders.length })}
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-[#222430] text-white shadow'
                  : 'text-[#828795] hover:text-white'
              }`}
            >
              {t('foldersObj.notificationsTab')}
            </button>
          </div>
        )}
        {tabContent}
      </div>
    </div>
  );
};
