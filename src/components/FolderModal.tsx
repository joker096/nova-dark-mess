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
} from 'lucide-react';
import { usePremium } from '../hooks/usePremium';
import { useWheelScroll } from '../lib/ui/useWheelScroll';
import { ChatFolder, ChatItem } from '../types/messenger';
import { LazyMedia } from './LazyMedia';

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
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>(
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

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-modal-title"
        className="bg-[#151621] border border-white/10 rounded-3xl w-full max-w-sm p-4 text-white shadow-2xl space-y-4 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-3 duration-250"
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

        {/* Tab switch: New Folder vs Manage All */}
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
          </div>
        )}

        {/* TAB 1: CREATE / EDIT FOLDER FORM */}
        {activeTab === 'create' ? (
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
              <label className="block text-[11px] font-semibold text-[#868b98] mb-1.5">
                {t('foldersObj.iconLabel')}
              </label>
              <div
                ref={iconRowRef}
                data-testid="folder-icon-list"
                className="w-full min-w-0 max-w-full flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain no-scrollbar pb-1 touch-pan-x"
                onWheel={(e) => {
                  if (e.deltaX === 0 && e.deltaY !== 0) {
                    e.preventDefault();
                    iconRowRef.current?.scrollBy({ left: e.deltaY, behavior: 'smooth' });
                  }
                }}
              >
                {FOLDER_ICONS.map((item) => {
                  const IconComp = item.icon;
                  const isSelected = selectedIcon === item.id;
                  const isLocked = item.premium && !premium;

                  const handleIconClick = () => {
                    if (isLocked) {
                      checkout();
                      return;
                    }
                    setSelectedIcon(item.id);
                  };

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={handleIconClick}
                      className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--nova-accent-color)] text-white shadow-md shadow-[var(--nova-accent-color)]/30 scale-105'
                          : isLocked
                          ? 'bg-[#1b1c28] text-white/40 border border-white/5 opacity-60 cursor-not-allowed hover:bg-[#1b1c28]'
                          : 'bg-[#1b1c28] text-white/60 hover:text-white border border-white/5'
                      }`}
                      title={
                        isLocked ? t('premium.lockedIcon') : item.label
                      }
                      disabled={isLocked}
                    >
                      <IconComp className="w-5 h-5" />
                      {isLocked && (
                        <Lock className="w-[10px] h-[10px] text-white/70 absolute bottom-1 right-1" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Preset Filters */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-[#868b98]">
                  {t('foldersObj.includedChats', { selected: selectedChatIds.length, total: chats.length })}
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={selectOnlyDirect}
                    className="text-[9px] text-[var(--nova-accent-color)] hover:underline cursor-pointer"
                  >
                    {t('foldersObj.selectPersonal')}
                  </button>
                  <span className="text-white/20 text-[9px]">·</span>
                  <button
                    type="button"
                    onClick={selectOnlyChannels}
                    className="text-[9px] text-[var(--nova-accent-color)] hover:underline cursor-pointer"
                  >
                    {t('foldersObj.selectChannels')}
                  </button>
                  <span className="text-white/20 text-[9px]">·</span>
                  <button
                    type="button"
                    onClick={selectOnlyGroups}
                    className="text-[9px] text-[var(--nova-accent-color)] hover:underline cursor-pointer"
                  >
                    {t('foldersObj.selectGroups')}
                  </button>
                </div>
              </div>

              {/* Chats Selection List */}
              <div className="bg-[#12131b] border border-white/5 rounded-2xl p-1.5 space-y-1 max-h-48 overflow-y-auto no-scrollbar">
                {chats.map((chat) => {
                  const isChecked = selectedChatIds.includes(chat.id);
                  return (
                    <div
                      key={chat.id}
                      onClick={() => toggleChatSelection(chat.id)}
                      className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                        isChecked
                          ? 'bg-[#1e202c] border border-white/10'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-[#20222a] shrink-0 border border-white/10 flex items-center justify-center text-[10px] font-bold">
                          {chat.avatar && !chat.isChannel ? (
                            <LazyMedia
                              src={chat.avatar}
                              alt=""
                              className="w-full h-full object-cover"
                              eager
                            />
                          ) : (
                            <span>{chat.name.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-semibold text-white truncate">
                            {chat.name}
                          </p>
                          <p className="text-[10px] text-[#717682] truncate">
                              {chat.type === 'channel'
                                ? t('foldersObj.chatTypeChannel')
                                : chat.type === 'group'
                                ? t('foldersObj.chatTypeGroup')
                                : t('foldersObj.chatTypeDirect')}
                          </p>
                        </div>
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
                    </div>
                  );
                })}
              </div>
            </div>

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
        ) : (
          /* TAB 2: MANAGE ALL FOLDERS */
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
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-[#1b1c28] border border-white/5"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#252838] flex items-center justify-center text-[var(--nova-accent-color)]">
                        <FolderIconComp className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <span>{f.name}</span>
                          {f.isDefault && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/5 text-[#828795]">
                              {t('foldersObj.defaultBadge')}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-[#717682]">{t('foldersObj.chatsIncluded', { count })}</p>
                      </div>
                    </div>

                    {!f.isDefault && (
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
        )}
      </div>
    </div>
  );
};
