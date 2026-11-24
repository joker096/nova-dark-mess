import React, { useState, useMemo } from 'react';
import { Plus, Radio, Search, Star, Trash2, Check, Lock, ArrowLeft } from 'lucide-react';
import type { ChannelDraft, ChannelInfo } from '../types/messenger';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from '../lib/ui';
import { ChannelCreateModal } from './ChannelCreateModal';
import { NovaBadge } from '../lib/ui';

interface ChannelListPanelProps {
  channels: ChannelInfo[];
  activeChannelId?: string;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel?: (draft: ChannelDraft) => ChannelInfo | void;
  onTogglePopular?: (channelId: string) => void;
  onDeleteChannels?: (channelIds: string[]) => void;
  onBack?: () => void;
}

export const ChannelListPanel: React.FC<ChannelListPanelProps> = ({
  channels,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  onTogglePopular,
  onDeleteChannels,
  onBack,
}) => {
  const { t, language } = useLanguage();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ownedChannels = useMemo(
    () => channels.filter((channel) => channel.isOwned),
    [channels],
  );
  const allSelected =
    ownedChannels.length > 0 && selectedIds.length === ownedChannels.length;

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
    setConfirmingDelete(false);
  };

  const toggleSelected = (channelId: string) => {
    setConfirmingDelete(false);
    setSelectedIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId],
    );
  };

  const deleteSelected = () => {
    if (!onDeleteChannels || selectedIds.length === 0) return;
    onDeleteChannels(selectedIds);
    exitSelection();
  };

  const formatSubscribers = (count: number): string =>
    new Intl.NumberFormat(language, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(count);



  const privateChannels = useMemo(
    () =>
      channels
        .filter((c) => c.visibility === 'private')
        .filter(
          (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.description?.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    [channels, searchQuery],
  );





  const isFollowed = (channel: ChannelInfo) =>
    channel.isFollowing === true || channel.isOwned === true;

  const followingChannels = useMemo(
    () =>
      channels
        .filter((c) => c.visibility !== 'private' && isFollowed(c))
        .filter(
          (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.description?.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    [channels, searchQuery],
  );

  const recommendedChannels = useMemo(
    () =>
      channels
        .filter((c) => c.visibility !== 'private' && !isFollowed(c))
        .filter(
          (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.description?.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    [channels, searchQuery],
  );

  const formatPreviewTime = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('common.justNow', 'just now');
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    return date.toLocaleDateString(language, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--nova-canvas)] text-[var(--nova-text-primary)] select-none">
      <div className="flex shrink-0 items-center gap-3 px-4 pb-1.5 pt-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)]/80 text-[var(--nova-text-secondary)] hover:bg-[var(--nova-surface-high)] hover:text-[var(--nova-text-primary)] transition active:scale-95"
            aria-label={t('common.back', 'Back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)]">
          <Radio className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-[16px] font-bold leading-tight tracking-tight text-[var(--nova-text-primary)]">
            {t('channel.channels')}
          </h1>
          <span className="shrink-0 rounded-full border border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--nova-text-muted)]">
            {channels.length}
          </span>
        </div>
        {onDeleteChannels && ownedChannels.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (selectionMode) {
                exitSelection();
              } else {
                setSelectionMode(true);
                setSelectedIds([]);
              }
            }}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
              selectionMode
                ? 'border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)]'
                : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)]/80 text-[var(--nova-text-secondary)] hover:bg-[var(--nova-surface-high)] hover:text-red-400'
            }`}
            aria-label={t('channel.deleteChannel')}
            title={selectionMode ? t('common.cancel') : t('channel.deleteChannel')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {selectionMode ? (
        <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-3 pt-1.5">
          <div className="mb-1 flex items-center justify-between rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] px-3 py-2">
            <span className="text-[11px] font-semibold text-[var(--nova-text-secondary)]">
              {selectedIds.length} / {ownedChannels.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    allSelected ? [] : ownedChannels.map((channel) => channel.id),
                  )
                }
                className="text-[11px] font-semibold text-[var(--nova-accent-color)] transition hover:brightness-110"
              >
                {allSelected ? t('common.deselectAll') : t('common.selectAll')}
              </button>
              <button
                type="button"
                onClick={exitSelection}
                className="text-[11px] font-semibold text-[var(--nova-text-muted)] transition hover:text-[var(--nova-text-primary)]"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>

          {ownedChannels.map((channel) => {
            const isSelected = selectedIds.includes(channel.id);
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => toggleSelected(channel.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition active:scale-[0.99] ${
                  isSelected
                    ? 'border-red-500/50 bg-red-500/10'
                    : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] hover:border-[var(--nova-border-color)] hover:bg-[var(--nova-surface-high)]'
                }`}
              >
                <Avatar src={channel.avatar} name={channel.name} size="md" channelType="default" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[var(--nova-text-primary)]">
                    {channel.name}
                  </span>
<p className="truncate text-[10.5px] text-[var(--nova-text-muted)]">
                    {channel.description ||
                      t('channel.subscribersCompact', {
                        value: formatSubscribers(channel.subscribers),
                        count: channel.subscribers,
                      })}
                  </p>
                </div>
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                    isSelected
                      ? 'border-red-400 bg-red-500 text-[var(--nova-on-accent)]'
                      : 'border-[var(--nova-border-color)] text-transparent'
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
      {/* Channel Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--nova-text-muted)]" />
          <input
            type="text"
            placeholder={t('channel.searchChannels', 'Search channels...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] px-3 pl-10 py-1.5 text-xs text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-3 pt-1.5">
        {privateChannels.length > 0 && (
          <section className="mb-2">
            <h2 className="mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--nova-text-muted)]">
              <Lock className="h-3 w-3" />
              {t('channel.privateChannels')}
            </h2>
            <div className="space-y-1">
              {privateChannels.map((channel) => {
                const isActive = channel.id === activeChannelId;
                return (
                  <button key={channel.id} type="button" onClick={() => onSelectChannel(channel.id)} aria-current={isActive ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition active:scale-[0.99] ${isActive ? 'border-[var(--nova-accent-color)]/50 bg-[var(--nova-accent-color)]/10' : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] hover:border-[var(--nova-border-color)] hover:bg-[var(--nova-surface-high)]'}`}>
                    <Avatar src={channel.avatar} name={channel.name} size="md" channelType="default" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-[var(--nova-text-primary)]">{channel.name}</span>
                        <span className="shrink-0 rounded-full border border-[var(--nova-border-color)] bg-[var(--nova-surface)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--nova-text-muted)]">{t('channel.privateBadge')}</span>
                      </div>
                      <p className="truncate text-[10.5px] text-[var(--nova-text-muted)]">{t('channel.inviteCode', { code: channel.inviteCode ?? '—' })}</p>
                    </div>
                    {isActive && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--nova-accent-color)] shadow-sm shadow-[var(--nova-accent-color)]" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {followingChannels.length > 0 && (
          <section className="mb-2">
            <h2 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--nova-text-muted)] mb-1.5">{t('channel.following')}</h2>
            <div className="space-y-1">
              {followingChannels.map((channel) => {
                const isActive = channel.id === activeChannelId;
                const previewTime = formatPreviewTime(channel.lastPostAt);
                return (
                  <button key={channel.id} type="button" onClick={() => onSelectChannel(channel.id)} aria-current={isActive ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition active:scale-[0.99] ${isActive ? 'border-[var(--nova-accent-color)]/50 bg-[var(--nova-accent-color)]/10' : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] hover:border-[var(--nova-border-color)] hover:bg-[var(--nova-surface-high)]'}`}>
                    <Avatar src={channel.avatar} name={channel.name} size="md" channelType="default" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-[var(--nova-text-primary)]">{channel.name}</span>
                        {channel.isOwned && <span className="shrink-0 rounded-full border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--nova-accent-color)]">{t('channel.owned')}</span>}
                      </div>
                      <p className="truncate text-[10.5px] text-[var(--nova-text-muted)]">{channel.lastPostPreview || channel.description || t('channel.subscribersCompact', { value: formatSubscribers(channel.subscribers), count: channel.subscribers })}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {previewTime && <span className="text-[9px] tabular-nums text-[var(--nova-text-muted)]">{previewTime}</span>}
                        {channel.unreadCount && channel.unreadCount > 0 && <NovaBadge value={channel.unreadCount} max={99} variant={channel.muted ? 'muted' : 'danger'} />}
                      </div>
                    </div>
                    {isActive && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--nova-accent-color)] shadow-sm shadow-[var(--nova-accent-color)]" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {recommendedChannels.length > 0 && (
          <section className="mb-2">
            <h2 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--nova-text-muted)] mb-1.5">{t('channel.recommended')}</h2>
            <div className="space-y-1">
              {recommendedChannels.map((channel) => {
                const isActive = channel.id === activeChannelId;
                const previewTime = formatPreviewTime(channel.lastPostAt);
                return (
                  <button key={channel.id} type="button" onClick={() => onSelectChannel(channel.id)} aria-current={isActive ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition active:scale-[0.99] ${isActive ? 'border-[var(--nova-accent-color)]/50 bg-[var(--nova-accent-color)]/10' : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] hover:border-[var(--nova-border-color)] hover:bg-[var(--nova-surface-high)]'}`}>
                    <Avatar src={channel.avatar} name={channel.name} size="md" channelType="default" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-[var(--nova-text-primary)]">{channel.name}</span>
                        {channel.isPopular && <Star className="w-3.5 h-3.5 fill-[var(--nova-accent-color)] text-[var(--nova-accent-color)] shrink-0" aria-label={t('channel.popular', 'Popular')} />}
                        {channel.isOwned && <span className="shrink-0 rounded-full border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--nova-accent-color)]">{t('channel.owned')}</span>}
                      </div>
                      <p className="truncate text-[10.5px] text-[var(--nova-text-muted)]">{channel.lastPostPreview || channel.description || t('channel.subscribersCompact', { value: formatSubscribers(channel.subscribers), count: channel.subscribers })}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {previewTime && <span className="text-[9px] tabular-nums text-[var(--nova-text-muted)]">{previewTime}</span>}
                        {channel.unreadCount && channel.unreadCount > 0 && <NovaBadge value={channel.unreadCount} max={99} variant={channel.muted ? 'muted' : 'danger'} />}
                      </div>
                    </div>
                    {onTogglePopular && (
                      <span role="button" onClick={(e) => { e.stopPropagation(); onTogglePopular(channel.id); }} className="w-6 h-6 rounded-full flex items-center justify-center border border-[var(--nova-border-color)] bg-[var(--nova-surface)] text-[var(--nova-text-muted)] hover:text-[var(--nova-accent-color)] hover:border-[var(--nova-accent-color)]/50 transition active:scale-95 shrink-0" aria-label={channel.isPopular ? t('channel.removePopular', 'Remove from popular') : t('channel.addPopular', 'Add to popular')}>
                        <Star className={`w-3.5 h-3.5 ${channel.isPopular ? 'fill-[var(--nova-accent-color)] text-[var(--nova-accent-color)]' : ''}`} />
                      </span>
                    )}
                    {isActive && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--nova-accent-color)] shadow-sm shadow-[var(--nova-accent-color)]" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {privateChannels.length === 0 &&
        followingChannels.length === 0 &&
        recommendedChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] text-[var(--nova-text-muted)]">
              <Radio className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-[var(--nova-text-secondary)]">
              {searchQuery ? t('channel.noSearchResults', 'No matching channels') : t('channel.noChannels')}
            </p>
            <p className="mt-1 max-w-[220px] text-xs text-[var(--nova-text-muted)]">
              {searchQuery
                ? t('channel.noSearchResultsSubtitle', 'Try a different search term.')
                : t('channel.noChannelsSubtitle')}
            </p>
          </div>        ) : null}
      </div>
        </>
      )}

      <div className="shrink-0 border-t border-[var(--nova-border-color)] p-2.5">
        {selectionMode ? (
          confirmingDelete ? (
            <div className="space-y-2">
              <p className="text-center text-[11px] font-semibold text-red-200">
                {t('channel.confirmDelete')}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-semibold text-white transition hover:bg-red-400 active:scale-[0.99]"
                >
                  {t('common.yes')} ({selectedIds.length})
                </button>
<button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] py-2 text-xs font-semibold text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-surface-high)] active:scale-[0.99]"
              >
                  {t('common.no')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={selectedIds.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/90 py-2 text-xs font-semibold text-white transition hover:bg-red-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('common.delete')} ({selectedIds.length})
              </button>
              <button
                type="button"
                onClick={exitSelection}
                className="flex-1 rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] py-2 text-xs font-semibold text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-surface-high)] active:scale-[0.99]"
              >
                {t('common.cancel')}
              </button>
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/5 py-2 text-xs font-semibold text-[var(--nova-accent-color)] transition hover:bg-[var(--nova-accent-color)]/10 active:scale-[0.99]"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('channel.createChannel')}
          </button>
        )}
      </div>

      <ChannelCreateModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(draft) => onCreateChannel?.(draft)}
      />
    </div>
  );
};

ChannelListPanel.displayName = 'ChannelListPanel';
