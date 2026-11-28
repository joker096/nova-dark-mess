import React, { useEffect, useState } from 'react';
import {IconCheck as Check, IconPlus as Plus, IconTrash as TrashX} from '@tabler/icons-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from '../lib/ui';
import type { ChannelInfo } from '../types/messenger';

interface ChannelSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: ChannelInfo[];
  activeChannelId: string;
  onSelect: (channelId: string) => void;
  onCreateRequest: () => void;
  onDelete: (channelId: string) => void;
  onDeleteMany?: (channelIds: string[]) => void;
}

export const ChannelSwitcherModal: React.FC<ChannelSwitcherModalProps> = ({
  isOpen,
  onClose,
  channels,
  activeChannelId,
  onSelect,
  onCreateRequest,
  onDelete,
  onDeleteMany,
}) => {
  const { t, language } = useLanguage();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingBulk, setConfirmingBulk] = useState(false);

  const ownedChannels = channels.filter((channel) => channel.isOwned);
  const canBulkDelete = Boolean(onDeleteMany) && ownedChannels.length > 0;
  const allSelected =
    ownedChannels.length > 0 && selectedIds.length === ownedChannels.length;

  useEffect(() => {
    if (!isOpen) {
      setConfirmId(null);
      setSelecting(false);
      setSelectedIds([]);
      setConfirmingBulk(false);
    }
  }, [isOpen]);

  const exitSelection = () => {
    setSelecting(false);
    setSelectedIds([]);
    setConfirmingBulk(false);
  };

  const toggleSelected = (channelId: string) => {
    setConfirmingBulk(false);
    setSelectedIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId],
    );
  };

  const deleteSelected = () => {
    if (!onDeleteMany || selectedIds.length === 0) return;
    onDeleteMany(selectedIds);
    exitSelection();
    onClose();
  };

  const formatSubscribers = (count: number): string =>
    new Intl.NumberFormat(language, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(count);

  return (
    <NovaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('channel.channels')}
      maxWidth="sm"
    >
      <div className="space-y-2">
        {canBulkDelete && (
          <div className="flex items-center justify-between rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] px-3 py-2">
            {selecting ? (
              <>
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
              </>
            ) : (
              <>
                <span className="text-[11px] text-[var(--nova-text-muted)]">
                  {t('channel.channels')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelecting(true);
                    setSelectedIds([]);
                    setConfirmId(null);
                  }}
                  className="text-[11px] font-semibold text-[var(--nova-accent-color)] transition hover:brightness-110"
                >
                  {t('common.select')}
                </button>
              </>
            )}
          </div>
        )}

        {channels.length === 0 && (
          <div className="rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] p-6 text-center">
            <p className="text-sm font-semibold text-[var(--nova-text-primary)]">{t('channel.noChannels')}</p>
            <p className="mt-1 text-xs text-[var(--nova-text-muted)]">{t('channel.noChannelsSubtitle')}</p>
          </div>
        )}

        {channels.map((channel) => {
          const isActive = channel.id === activeChannelId;
          const isSelected = selectedIds.includes(channel.id);
          return (
            <div key={channel.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (selecting) {
                    if (channel.isOwned) toggleSelected(channel.id);
                    return;
                  }
                  onSelect(channel.id);
                  onClose();
                }}
                className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-2 text-left transition ${
                  selecting && isSelected
                    ? 'border-red-500/50 bg-red-500/10'
                    : isActive && !selecting
                      ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/10'
                      : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] hover:border-[var(--nova-border-color)] hover:bg-[var(--nova-surface-high)]'
                } ${selecting && !channel.isOwned ? 'opacity-45' : ''}`}
              >
                <Avatar src={channel.avatar} name={channel.name} size="md" channelType="default" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-[var(--nova-text-primary)]">
                      {channel.name}
                    </span>
                    {channel.isOwned && (
                      <span className="shrink-0 rounded-full border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--nova-accent-color)]">
                        {t('channel.owned')}
                      </span>
                    )}
                    {channel.visibility === 'private' && (
                      <span className="shrink-0 rounded-full border border-[var(--nova-border-color)] bg-[var(--nova-surface)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--nova-text-muted)]">
                        {t('channel.privateBadge')}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-[var(--nova-text-muted)]">
                    {channel.description ||
                      t('channel.subscribersCompact', {
                        value: formatSubscribers(channel.subscribers),
                        count: channel.subscribers,
                      })}
                  </p>
                </div>
                {selecting ? (
                  channel.isOwned && (
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                        isSelected
                          ? 'border-red-400 bg-red-500 text-[var(--nova-on-accent)]'
                          : 'border-[var(--nova-border-color)] text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  )
                ) : (
                  isActive && (
                    <Check className="h-4 w-4 shrink-0 text-[var(--nova-accent-color)]" />
                  )
                )}
              </button>

              {channel.isOwned && !selecting && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirmId === channel.id) {
                      onDelete(channel.id);
                      setConfirmId(null);
                    } else {
                      setConfirmId(channel.id);
                    }
                  }}
                  className={`flex h-8 shrink-0 items-center justify-center rounded-full transition ${
                    confirmId === channel.id
                      ? 'w-14 border border-red-500/40 bg-red-500/15 px-1 text-[9px] font-bold text-red-300'
                      : 'w-8 border border-[var(--nova-border-color)] bg-[var(--nova-surface)] text-[var(--nova-text-muted)] hover:text-red-400'
                  }`}
                  aria-label={t('channel.deleteChannel')}
                  title={
                    confirmId === channel.id
                      ? t('channel.confirmDelete')
                      : t('channel.deleteChannel')
                  }
                >
                  {confirmId === channel.id ? t('common.delete') : <TrashX className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          );
        })}

        {selecting ? (
          confirmingBulk ? (
            <div className="mt-1 space-y-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-2.5">
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
                  onClick={() => setConfirmingBulk(false)}
                  className="flex-1 rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] py-2 text-xs font-semibold text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-surface-high)] active:scale-[0.99]"
                >
                  {t('common.no')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingBulk(true)}
                disabled={selectedIds.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/90 py-2 text-xs font-semibold text-white transition hover:bg-red-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <TrashX className="h-3.5 w-3.5" />
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
            onClick={onCreateRequest}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/5 py-2 text-xs font-semibold text-[var(--nova-accent-color)] transition hover:bg-[var(--nova-accent-color)]/10 active:scale-[0.99]"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('channel.createChannel')}
          </button>
        )}
      </div>
    </NovaModal>
  );
};



















