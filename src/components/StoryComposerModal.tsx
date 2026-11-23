import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { useLanguage } from '../context/LanguageContext';
import { ImagePicker } from './ImagePicker';
import { SchedulePicker, type ScheduleSelection } from './SchedulePicker';
import type { StoryDraft } from '../types/messenger';

interface StoryComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublish: (draft: StoryDraft) => void;
}

const nextHour = (): Date => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
};

export const StoryComposerModal: React.FC<StoryComposerModalProps> = ({
  isOpen,
  onClose,
  onPublish,
}) => {
  const { t } = useLanguage();
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [schedule, setSchedule] = useState<ScheduleSelection>({
    mode: 'now',
    date: nextHour(),
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setImage(null);
    setCaption('');
    setSchedule({ mode: 'now', date: nextHour() });
    setError(null);
  }, [isOpen]);

  const scheduleInvalid =
    schedule.mode === 'scheduled' && schedule.date.getTime() <= Date.now();
  const canSubmit = Boolean(image) && !scheduleInvalid;

  const handleSubmit = () => {
    if (!image) {
      setError(t('stories.imageRequired'));
      return;
    }
    if (scheduleInvalid) return;

    onPublish({
      coverImage: image,
      caption: caption.trim() || undefined,
      scheduledFor:
        schedule.mode === 'scheduled' ? schedule.date.getTime() : undefined,
    });
    onClose();
  };

  return (
    <NovaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('stories.newStory')}
      maxWidth="sm"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--nova-accent-color)]/20 bg-[var(--nova-accent-color)]/10 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--nova-text-primary)]/70">
            {t('stories.composerSubtitle')}
          </p>
        </div>

        <ImagePicker
          value={image}
          onChange={(value) => {
            setImage(value);
            setError(null);
          }}
          aspect="story"
          label={t('stories.storyImage')}
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <label htmlFor="story-caption" className="text-[11px] font-semibold text-[#868b98]">
              {t('stories.caption')}
            </label>
            <span className="text-[10px] tabular-nums text-[var(--nova-text-primary)]/30">
              {caption.length}/280
            </span>
          </div>
          <textarea
            id="story-caption"
            value={caption}
            maxLength={280}
            onChange={(event) => setCaption(event.target.value)}
            placeholder={t('stories.captionPlaceholder')}
            rows={2}
            className="w-full resize-none rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] px-3 py-2 text-xs text-[var(--nova-text-primary)] placeholder-[var(--nova-text-secondary)]/30 transition focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
          />
        </div>

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
            <Sparkles className="h-3.5 w-3.5" />
            {schedule.mode === 'scheduled'
              ? t('stories.scheduleStory')
              : t('stories.publish')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[var(--nova-overlay-weak)] px-4 py-2.5 text-xs font-semibold text-[var(--nova-text-primary)]/70 transition hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </NovaModal>
  );
};
