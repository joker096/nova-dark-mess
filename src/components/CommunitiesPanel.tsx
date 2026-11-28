import { useMemo, useState } from 'react';
import {IconPlus as Plus, IconRadio as Radio, IconMessageShare as MessageShare, IconShieldCheck as ShieldCheck, IconX as X, IconPencil as Pencil, IconTrashX as Trash2} from '@tabler/icons-react';
import { ChannelInfo } from '../types/messenger';
import { MOCK_CHATS, loadCreatedGroups } from '../data/mockMessengerData';
import {
  Community,
  createCommunity,
  deleteCommunity,
  isAdmin,
  listCommunities,
  updateCommunity} from '../lib/social/communities';
import { useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';

export interface CommunitiesPanelProps {
  channels?: ChannelInfo[];
  localFingerprint?: string;
  onOpenChannel?: (channelId?: string) => void;
  onOpenChat?: (chatId: string) => void;
}

interface DiscussionOption {
  id: string;
  name: string;
}

function discussionOptions(): DiscussionOption[] {
  const created = loadCreatedGroups();
  const all = [...MOCK_CHATS, ...created];
  const seen = new Set<string>();
  const options: DiscussionOption[] = [];
  for (const chat of all) {
    if (chat.isChannel || chat.type === 'channel') continue;
    if (seen.has(chat.id)) continue;
    seen.add(chat.id);
    options.push({ id: chat.id, name: chat.name });
  }
  return options;
}

/**
 * Communities: a channel paired with a linked discussion group, moderated by
 * locally recorded admin fingerprints. Stored on-device, no server involved.
 */
export function CommunitiesPanel({
  channels = [],
  localFingerprint,
  onOpenChannel,
  onOpenChat,
}: CommunitiesPanelProps) {
  const { t } = useLanguage();
  const [communities, setCommunities] = useState<Community[]>(() => listCommunities());
  const [isCreating, setIsCreating] = useState(false);
  const createDialogRef = useFocusTrap<HTMLDivElement>(isCreating, () => setIsCreating(false));
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [discussionGroupId, setDiscussionGroupId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const discussions = useMemo(() => discussionOptions(), [isCreating]);
  const availableChannels = channels;
  const channelNames = useMemo(
    () => new Map(availableChannels.map((channel) => [channel.id, channel.name])),
    [availableChannels],
  );
  const discussionNames = useMemo(
    () => new Map(discussions.map((option) => [option.id, option.name])),
    [discussions],
  );

  const openCreate = () => {
    setName('');
    setChannelId(availableChannels[0]?.id ?? '');
    setDiscussionGroupId(discussions[0]?.id ?? '');
    setError(null);
    setEditingId(null);
    setIsCreating(true);
  };

  const openEdit = (community: Community) => {
    setName(community.name);
    setChannelId(community.channelId);
    setDiscussionGroupId(community.discussionGroupId);
    setError(null);
    setEditingId(community.id);
    setIsCreating(true);
  };

  const handleDelete = (communityId: string) => {
    deleteCommunity(communityId);
    setCommunities(listCommunities());
    setConfirmingDeleteId(null);
  };

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('communities.nameRequired'));
      return;
    }
    if (!channelId || !discussionGroupId) {
      setError(t('communities.targetRequired'));
      return;
    }
    if (editingId) {
      updateCommunity(editingId, {
        name: trimmed,
        channelId,
        discussionGroupId,
      });
    } else {
      createCommunity(
        trimmed,
        channelId,
        discussionGroupId,
        localFingerprint ? [localFingerprint] : [],
      );
    }
    setCommunities(listCommunities());
    setEditingId(null);
    setIsCreating(false);
  };

  return (
    <section
      aria-label={t('communities.title')}
      data-testid="communities-panel"
      className="rounded-2xl border border-white/[0.06] bg-[#12131a] px-3 py-2.5 space-y-2"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-white/90 truncate">{t('communities.title')}</h3>
          <p className="text-[10px] text-[#7d8290] truncate">{t('communities.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          aria-label={t('communities.create')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition active:scale-95 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </header>

      {communities.length === 0 ? (
        <p className="text-[11px] text-[#7d8290] py-1">{t('communities.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {communities.map((community) => {
            const admin = localFingerprint ? isAdmin(community, localFingerprint) : false;
            return (
              <li
                key={community.id}
                className="rounded-xl bg-[#191b23] border border-white/[0.04] px-2.5 py-2 space-y-1"
                data-testid={`community-${community.id}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white truncate">{community.name}</span>
                  {admin && (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--nova-accent-color)]">
                      <ShieldCheck className="w-3 h-3" />
                      {t('communities.admin')}
                    </span>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => openEdit(community)}
                    aria-label={`${t('communities.edit')}: ${community.name}`}
                    className="h-6 w-6 shrink-0 rounded-full text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmingDeleteId((current) =>
                        current === community.id ? null : community.id,
                      )
                    }
                    aria-label={`${t('communities.delete')}: ${community.name}`}
                    className="h-6 w-6 shrink-0 rounded-full text-white/40 hover:text-red-400 hover:bg-white/10 flex items-center justify-center transition cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {confirmingDeleteId === community.id && (
                  <div className="flex items-center gap-1.5 pt-0.5" role="group" aria-label={t('communities.deletePrompt')}>
                    <span className="text-[10px] text-[#8c919d]">{t('communities.deletePrompt')}</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(community.id)}
                      className="text-[10px] font-semibold text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      {t('communities.delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                      className="text-[10px] text-white/50 hover:text-white cursor-pointer"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenChannel?.(community.channelId)}
                    className="flex items-center gap-1 text-[10px] text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full px-2 py-0.5 transition cursor-pointer"
                    aria-label={`${t('communities.openChannel')}: ${
                      channelNames.get(community.channelId) ?? community.channelId
                    }`}
                  >
                    <Radio className="w-3 h-3" />
                    {channelNames.get(community.channelId) ?? community.channelId}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChat?.(community.discussionGroupId)}
                    className="flex items-center gap-1 text-[10px] text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full px-2 py-0.5 transition cursor-pointer"
                    aria-label={`${t('communities.openDiscussion')}: ${
                      discussionNames.get(community.discussionGroupId) ?? community.discussionGroupId
                    }`}
                  >
                    <MessageShare className="w-3 h-3" />
                    {discussionNames.get(community.discussionGroupId) ??
                      community.discussionGroupId}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isCreating && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={t('communities.create')}
        >
          <div ref={createDialogRef} className="bg-[#181922] border border-white/10 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white">
                {editingId ? t('communities.editTitle') : t('communities.create')}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                aria-label={t('common.cancel')}
                className="text-white/50 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block text-[11px] text-[#8c919d]">
              {t('communities.nameLabel')}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('communities.namePlaceholder')}
                aria-label={t('communities.nameLabel')}
                className="mt-1 w-full bg-[#20222b] text-white text-xs rounded-xl px-3 py-2.5 border border-white/10 focus:border-[var(--nova-accent-color)] outline-none"
              />
            </label>

            <label className="block text-[11px] text-[#8c919d]">
              {t('communities.channelLabel')}
              <select
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                aria-label={t('communities.channelLabel')}
                className="mt-1 w-full bg-[#20222b] text-white text-xs rounded-xl px-3 py-2.5 border border-white/10 focus:border-[var(--nova-accent-color)] outline-none"
              >
                {availableChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[11px] text-[#8c919d]">
              {t('communities.discussionLabel')}
              <select
                value={discussionGroupId}
                onChange={(event) => setDiscussionGroupId(event.target.value)}
                aria-label={t('communities.discussionLabel')}
                className="mt-1 w-full bg-[#20222b] text-white text-xs rounded-xl px-3 py-2.5 border border-white/10 focus:border-[var(--nova-accent-color)] outline-none"
              >
                {discussions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <p role="alert" className="text-[11px] text-red-400">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleCreate}
              className="w-full py-2.5 rounded-xl bg-[var(--nova-accent-color)] text-white text-xs font-semibold hover:opacity-90 transition cursor-pointer"
            >
              {editingId ? t('communities.save') : t('communities.createAction')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}




















