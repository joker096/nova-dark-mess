import React, { useState, useMemo } from 'react';
import { Plus, Radio, Search, Star } from 'lucide-react';
import type { ChannelDraft, ChannelInfo } from '../types/messenger';
import { useLanguage } from '../context/LanguageContext';
import { ChannelAvatar } from './ChannelAvatar';
import { ChannelCreateModal } from './ChannelCreateModal';

interface ChannelListPanelProps {
  channels: ChannelInfo[];
  activeChannelId?: string;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel?: (draft: ChannelDraft) => ChannelInfo | void;
  onTogglePopular?: (channelId: string) => void;
}

export const ChannelListPanel: React.FC<ChannelListPanelProps> = ({
  channels,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  onTogglePopular,
}) => {
  const { t, language } = useLanguage();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const formatSubscribers = (count: number): string =>
    new Intl.NumberFormat(language, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(count);

  const popularChannels = useMemo(
    () =>
      channels
        .filter((c) => c.isPopular === true)
        .filter(
          (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.description?.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    [channels, searchQuery],
  );

  const regularChannels = useMemo(
    () => channels.filter((c) => c.isPopular !== true),
    [channels],
  );

  const filteredRegular = useMemo(
    () =>
      regularChannels.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [regularChannels, searchQuery],
  );

  return (
    <div className="flex h-full flex-col bg-[#0b0c10] text-white select-none">
      <div className="flex shrink-0 items-center gap-3 px-5 pb-2 pt-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)]">
          <Radio className="h-4 w-4" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-[17px] font-bold leading-tight tracking-tight text-white">
            {t('channel.channels')}
          </h1>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/45">
            {channels.length}
          </span>
        </div>
      </div>

      {/* Channel Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder={t('channel.searchChannels', 'Search channels...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#101118] px-3 pl-10 py-2 text-xs text-white placeholder-white/30 focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-4 pt-2">
        {/* Popular Channels Section */}
        {popularChannels.length > 0 && (
          <section className="mb-3">
            <h2 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[#6a6f7b] mb-1.5">
              {t('channel.popular', 'Popular channels')}
            </h2>
            <div className="space-y-1">
              {popularChannels.map((channel) => {
                const isActive = channel.id === activeChannelId;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => onSelectChannel(channel.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition active:scale-[0.99] ${
                      isActive
                        ? 'border-[var(--nova-accent-color)]/50 bg-[var(--nova-accent-color)]/10'
                        : 'border-white/5 bg-[#14151b] hover:border-white/10 hover:bg-[#191a22]'
                    }`}
                  >
                    <ChannelAvatar avatar={channel.avatar} name={channel.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-white">
                          {channel.name}
                        </span>
                        <Star
                          className="w-3.5 h-3.5 fill-[var(--nova-accent-color)] text-[var(--nova-accent-color)] shrink-0"
                          aria-label={t('channel.popular', 'Popular')}
                        />
                        {channel.isOwned && (
                          <span className="shrink-0 rounded-full border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--nova-accent-color)]">
                            {t('channel.owned')}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[10.5px] text-white/40">
                        {channel.description ||
                          t('channel.subscribersCompact', {
                            value: formatSubscribers(channel.subscribers),
                          })}
                      </p>
                    </div>
                    {isActive && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--nova-accent-color)] shadow-sm shadow-[var(--nova-accent-color)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* All Channels */}
        {filteredRegular.length === 0 && popularChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-[#181921] text-white/30">
              <Radio className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-white/80">
              {searchQuery ? t('channel.noSearchResults', 'No matching channels') : t('channel.noChannels')}
            </p>
            <p className="mt-1 max-w-[220px] text-xs text-[#717682]">
              {searchQuery
                ? t('channel.noSearchResultsSubtitle', 'Try a different search term.')
                : t('channel.noChannelsSubtitle')}
            </p>
          </div>
        ) : (
          filteredRegular.map((channel) => {
            const isActive = channel.id === activeChannelId;
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => onSelectChannel(channel.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition active:scale-[0.99] ${
                  isActive
                    ? 'border-[var(--nova-accent-color)]/50 bg-[var(--nova-accent-color)]/10'
                    : 'border-white/5 bg-[#14151b] hover:border-white/10 hover:bg-[#191a22]'
                }`}
              >
                <ChannelAvatar avatar={channel.avatar} name={channel.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-white">
                      {channel.name}
                    </span>
                    {channel.isPopular && (
                      <Star
                        className="w-3.5 h-3.5 fill-[var(--nova-accent-color)] text-[var(--nova-accent-color)] shrink-0"
                        aria-label={t('channel.popular', 'Popular')}
                      />
                    )}
                    {channel.isOwned && (
                      <span className="shrink-0 rounded-full border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--nova-accent-color)]">
                        {t('channel.owned')}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10.5px] text-white/40">
                    {channel.description ||
                      t('channel.subscribersCompact', {
                        value: formatSubscribers(channel.subscribers),
                      })}
                  </p>
                </div>
                {onTogglePopular && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePopular(channel.id);
                    }}
                    className="w-6 h-6 rounded-full flex items-center justify-center border border-white/5 bg-white/5 text-white/40 hover:text-[var(--nova-accent-color)] hover:border-[var(--nova-accent-color)]/50 transition active:scale-95 shrink-0"
                    aria-label={
                      channel.isPopular
                        ? t('channel.removePopular', 'Remove from popular')
                        : t('channel.addPopular', 'Add to popular')
                    }
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        channel.isPopular
                          ? 'fill-[var(--nova-accent-color)] text-[var(--nova-accent-color)]'
                          : ''
                      }`}
                    />
                  </span>
                )}
                {isActive && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--nova-accent-color)] shadow-sm shadow-[var(--nova-accent-color)]" />
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/5 py-2.5 text-xs font-semibold text-[var(--nova-accent-color)] transition hover:bg-[var(--nova-accent-color)]/10 active:scale-[0.99]"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('channel.createChannel')}
        </button>
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
