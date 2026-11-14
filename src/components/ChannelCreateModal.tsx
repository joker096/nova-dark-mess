import React, { useEffect, useState } from 'react';
import { Globe, Lock, Plus, Radio } from 'lucide-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { useLanguage } from '../context/LanguageContext';
import { ImagePicker } from './ImagePicker';
import type { ChannelDraft, ChannelVisibility } from '../types/messenger';

interface ChannelCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (draft: ChannelDraft) => void;
}

export const ChannelCreateModal: React.FC<ChannelCreateModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ChannelVisibility>('public');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setDescription('');
    setAvatar(null);
    setCoverImage(null);
    setVisibility('public');
    setError(null);
  }, [isOpen]);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) {
      setError(t('channel.channelRequired'));
      return;
    }
    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      avatar: avatar ?? undefined,
      coverImage: coverImage ?? undefined,
      visibility,
    });
    onClose();
  };

  return (
    <NovaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('channel.newChannel')}
      maxWidth="sm"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--nova-accent-color)]/20 bg-[var(--nova-accent-color)]/10 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)]">
            <Radio className="h-4 w-4" />
          </div>
          <p className="text-[11px] leading-relaxed text-white/70">
            {t('channel.createSubtitle')}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="channel-name" className="px-1 text-[11px] font-semibold text-[#868b98]">
            {t('channel.channelName')}
          </label>
          <input
            id="channel-name"
            value={name}
            maxLength={64}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder={t('channel.channelNamePlaceholder')}
            className="w-full rounded-xl border border-white/10 bg-[#101118] px-3 py-2 text-xs text-white placeholder-white/30 transition focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="channel-description" className="px-1 text-[11px] font-semibold text-[#868b98]">
            {t('channel.channelDescription')}
          </label>
          <textarea
            id="channel-description"
            value={description}
            maxLength={180}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('channel.channelDescriptionPlaceholder')}
            rows={2}
            className="w-full resize-none rounded-xl border border-white/10 bg-[#101118] px-3 py-2 text-xs text-white placeholder-white/30 transition focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="px-1 text-[11px] font-semibold text-[#868b98]">
            {t('channel.visibility')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVisibility('public')}
              aria-pressed={visibility === 'public'}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition cursor-pointer ${
                visibility === 'public'
                  ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/10 text-white'
                  : 'border-white/10 bg-[#101118] text-white/60 hover:text-white'
              }`}
            >
              <Globe className="h-4 w-4 shrink-0 text-[var(--nova-accent-color)]" />
              <span className="text-xs font-semibold">{t('channel.public')}</span>
            </button>
            <button
              type="button"
              onClick={() => setVisibility('private')}
              aria-pressed={visibility === 'private'}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition cursor-pointer ${
                visibility === 'private'
                  ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/10 text-white'
                  : 'border-white/10 bg-[#101118] text-white/60 hover:text-white'
              }`}
            >
              <Lock className="h-4 w-4 shrink-0 text-[var(--nova-accent-color)]" />
              <span className="text-xs font-semibold">{t('channel.private')}</span>
            </button>
          </div>
          <p className="px-1 text-[10px] leading-relaxed text-white/45">
            {visibility === 'private'
              ? t('channel.privateHint')
              : t('channel.publicHint')}
          </p>
        </div>

        <ImagePicker
          value={avatar}
          onChange={setAvatar}
          aspect="square"
          label={t('channel.channelAvatar')}
        />

        <ImagePicker
          value={coverImage}
          onChange={setCoverImage}
          aspect="banner"
          label={t('channel.channelCoverImage')}
        />

        {error && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--nova-accent-color)] py-2.5 text-xs font-semibold text-white shadow-lg shadow-[var(--nova-accent-color)]/25 transition hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('channel.create')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </NovaModal>
  );
};
