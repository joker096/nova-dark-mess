import React, { useEffect, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { useLanguage } from '../context/LanguageContext';
import { ChannelAvatar } from './ChannelAvatar';
import type { ChannelInfo } from '../types/messenger';

interface ChannelSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: ChannelInfo[];
  activeChannelId: string;
  onSelect: (channelId: string) => void;
  onCreateRequest: () => void;
  onDelete: (channelId: string) => void;
}

export const ChannelSwitcherModal: React.FC<ChannelSwitcherModalProps> = ({
  isOpen,
  onClose,
  channels,
  activeChannelId,
  onSelect,
  onCreateRequest,
  onDelete,
}) => {
  const { t, language } = useLanguage();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setConfirmId(null);
  }, [isOpen]);

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
        {channels.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#101118] p-6 text-center">
            <p className="text-sm font-semibold text-white/80">{t('channel.noChannels')}</p>
            <p className="mt-1 text-xs text-[#828795]">{t('channel.noChannelsSubtitle')}</p>
          </div>
        )}

        {channels.map((channel) => {
          const isActive = channel.id === activeChannelId;
          return (
            <div key={channel.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelect(channel.id);
                  onClose();
                }}
                className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                  isActive
                    ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/10'
                    : 'border-white/5 bg-[#171820] hover:border-white/10 hover:bg-[#1e1f27]'
                }`}
              >
                <ChannelAvatar avatar={channel.avatar} name={channel.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-white">
                      {channel.name}
                    </span>
                    {channel.isOwned && (
                      <span className="shrink-0 rounded-full border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--nova-accent-color)]">
                        {t('channel.owned')}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-white/45">
                    {channel.description ||
                      t('channel.subscribersCompact', {
                        value: formatSubscribers(channel.subscribers),
                      })}
                  </p>
                </div>
                {isActive && (
                  <Check className="h-4 w-4 shrink-0 text-[var(--nova-accent-color)]" />
                )}
              </button>

              {channel.isOwned && (
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
                  className={`flex h-9 shrink-0 items-center justify-center rounded-full transition ${
                    confirmId === channel.id
                      ? 'w-14 border border-red-500/40 bg-red-500/15 px-1 text-[9px] font-bold text-red-300'
                      : 'w-9 border border-white/5 bg-white/[0.03] text-white/35 hover:text-red-400'
                  }`}
                  aria-label={t('channel.deleteChannel')}
                  title={
                    confirmId === channel.id
                      ? t('channel.confirmDelete')
                      : t('channel.deleteChannel')
                  }
                >
                  {confirmId === channel.id ? t('common.delete') : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onCreateRequest}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/5 py-2.5 text-xs font-semibold text-[var(--nova-accent-color)] transition hover:bg-[var(--nova-accent-color)]/10 active:scale-[0.99]"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('channel.createChannel')}
        </button>
      </div>
    </NovaModal>
  );
};
