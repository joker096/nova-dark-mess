import React, { useEffect, useState } from 'react';
import { PenSquare } from 'lucide-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { useLanguage } from '../context/LanguageContext';
import { ImagePicker } from './ImagePicker';
import { SchedulePicker, type ScheduleSelection } from './SchedulePicker';
import type { ChannelPostDraft } from '../types/messenger';

interface ChannelPostComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublish: (draft: ChannelPostDraft) => void;
  channelName?: string;
}

const nextHour = (): Date => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
};

export const ChannelPostComposerModal: React.FC<ChannelPostComposerModalProps> = ({
  isOpen,
  onClose,
  onPublish,
  channelName,
}) => {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleSelection>({
    mode: 'now',
    date: nextHour(),
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setText('');
    setImage(null);
    setSchedule({ mode: 'now', date: nextHour() });
    setError(null);
  }, [isOpen]);

  const scheduleInvalid =
    schedule.mode === 'scheduled' && schedule.date.getTime() <= Date.now();
  const hasContent = title.trim().length > 0 || text.trim().length > 0;
  const canSubmit = hasContent && !scheduleInvalid;

  const handleSubmit = () => {
    if (!hasContent) {
      setError(t('channel.postRequired'));
      return;
    }
    if (scheduleInvalid) return;

    onPublish({
      title: title.trim(),
      text: text.trim(),
      image: image ?? undefined,
      scheduledFor:
        schedule.mode === 'scheduled' ? schedule.date.getTime() : undefined,
    });
    onClose();
  };

  return (
    <NovaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('channel.newPost')}
      maxWidth="sm"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--nova-accent-color)]/20 bg-[var(--nova-accent-color)]/10 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)]">
            <PenSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-white">
              {channelName ?? t('channel.newPost')}
            </p>
            <p className="text-[10px] leading-relaxed text-white/55">
              {t('channel.newPostSubtitle')}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="post-title" className="px-1 text-[11px] font-semibold text-[#868b98]">
            {t('channel.postTitle')}
          </label>
          <input
            id="post-title"
            value={title}
            maxLength={120}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            placeholder={t('channel.postTitlePlaceholder')}
            className="w-full rounded-xl border border-white/10 bg-[#101118] px-3 py-2 text-xs text-white placeholder-white/30 transition focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <label htmlFor="post-text" className="text-[11px] font-semibold text-[#868b98]">
              {t('channel.postText')}
            </label>
            <span className="text-[10px] tabular-nums text-white/30">
              {text.length}/2000
            </span>
          </div>
          <textarea
            id="post-text"
            value={text}
            maxLength={2000}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            placeholder={t('channel.postTextPlaceholder')}
            rows={4}
            className="w-full resize-none rounded-xl border border-white/10 bg-[#101118] px-3 py-2 text-xs leading-relaxed text-white placeholder-white/30 transition focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
          />
        </div>

        <ImagePicker
          value={image}
          onChange={setImage}
          aspect="banner"
          label={t('channel.postImage')}
        />

        <SchedulePicker value={schedule} onChange={setSchedule} />

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
            <PenSquare className="h-3.5 w-3.5" />
            {schedule.mode === 'scheduled'
              ? t('channel.schedulePost')
              : t('channel.publishPost')}
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
