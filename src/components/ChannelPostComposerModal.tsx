import React, { useEffect, useState } from 'react';
import {
  IconChartBar as BarChart,
  IconPencil as PenSquare,
  IconPlus as Plus,
  IconMoodSmile as Smile,
  IconTrashX as Trash2,
  IconTrash as Trash,
  IconX as X,
  IconChartBar as BarChart2,
  IconMoodSmile as MoodSmile,
  IconTrash as TrashX,
} from '@tabler/icons-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { useLanguage } from '../context/LanguageContext';
import { ImagePicker } from './ImagePicker';
import { SchedulePicker, type ScheduleSelection } from './SchedulePicker';
import { StickerPickerDrawer } from './chat/StickerPickerDrawer';
import { StickerMedia } from './chat/StickerMedia';
import type { ChannelPostDraft, PollData, StickerData } from '../types/messenger';

const MAX_POLL_OPTIONS = 10;

interface ChannelPostComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublish: (draft: ChannelPostDraft) => void;
  channelName?: string;
  initialDraft?: ChannelPostDraft | null;
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
  initialDraft = null,
}) => {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleSelection>({
    mode: 'now',
    date: nextHour(),
  });
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollAnonymous, setPollAnonymous] = useState(true);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [sticker, setSticker] = useState<StickerData | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialDraft) {
      setTitle(initialDraft.title || '');
      setText(initialDraft.text || '');
      setImage(initialDraft.image ?? null);
      setSchedule(
        initialDraft.scheduledFor
          ? { mode: 'scheduled', date: new Date(initialDraft.scheduledFor) }
          : { mode: 'now', date: nextHour() },
      );
      if (initialDraft.poll) {
        setPollOpen(true);
        setPollQuestion(initialDraft.poll.question);
        setPollOptions(initialDraft.poll.options.map((o) => o.text));
        setPollAnonymous(initialDraft.poll.isAnonymous);
        setPollMultiple(initialDraft.poll.allowsMultiple);
      } else {
        setPollOpen(false);
        setPollQuestion('');
        setPollOptions(['', '']);
        setPollAnonymous(true);
        setPollMultiple(false);
      }
      setSticker(initialDraft.sticker ?? null);
      setStickerOpen(false);
      setError(null);
      return;
    }
    setTitle('');
    setText('');
    setImage(null);
    setSchedule({ mode: 'now', date: nextHour() });
    setPollOpen(false);
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollAnonymous(true);
    setPollMultiple(false);
    setSticker(null);
    setStickerOpen(false);
    setError(null);
  }, [isOpen, initialDraft]);

  const scheduleInvalid =
    schedule.mode === 'scheduled' && schedule.date.getTime() <= Date.now();
  const hasContent = title.trim().length > 0 || text.trim().length > 0;
  const canSubmit = (hasContent || pollOpen || sticker !== null) && !scheduleInvalid;

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)));
    setError(null);
  };

  const addPollOption = () => {
    if (pollOptions.length >= MAX_POLL_OPTIONS) return;
    setPollOptions((prev) => [...prev, '']);
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const buildPoll = (): PollData | null | 'invalid' => {
    if (!pollOpen) return null;
    const question = pollQuestion.trim();
    if (!question) {
      setError(t('poll.errorQuestionRequired', 'Please enter a poll question'));
      return 'invalid';
    }
    const options = pollOptions.map((opt) => opt.trim()).filter(Boolean);
    if (options.length < 2) {
      setError(t('poll.errorOptionsRequired', 'Please provide at least 2 options'));
      return 'invalid';
    }
    return {
      id: `poll-${Date.now()}`,
      question,
      options: options.map((optionText, idx) => ({
        id: `opt-${idx + 1}-${Date.now()}`,
        text: optionText,
        votes: 0,
        votedByMe: false,
      })),
      totalVotes: 0,
      isAnonymous: pollAnonymous,
      allowsMultiple: pollMultiple,
      isQuiz: false,
    };
  };

  const handleSubmit = () => {
    if (!hasContent && !pollOpen && !sticker) {
      setError(t('channel.postRequired'));
      return;
    }
    if (scheduleInvalid) return;

    const poll = buildPoll();
    if (poll === 'invalid') return;

    onPublish({
      title: title.trim(),
      text: text.trim(),
      image: image ?? undefined,
      scheduledFor:
        schedule.mode === 'scheduled' ? schedule.date.getTime() : undefined,
      poll: poll ?? undefined,
      sticker: sticker ?? undefined,
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
            <p className="truncate text-[11px] font-semibold text-[var(--nova-text-primary)]">
              {channelName ?? t('channel.newPost')}
            </p>
            <p className="text-[10px] leading-relaxed text-[var(--nova-text-muted)]">
              {t('channel.newPostSubtitle')}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="post-title" className="px-1 text-[11px] font-semibold text-[var(--nova-text-muted)]">
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
            className="w-full bg-[var(--nova-overlay-weak)]/50 rounded-xl px-3 py-2.5 text-sm text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <label htmlFor="post-text" className="text-[11px] font-semibold text-[var(--nova-text-muted)]">
              {t('channel.postText')}
            </label>
            <span className="text-[10px] tabular-nums text-[var(--nova-text-muted)]">
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
            className="w-full resize-none bg-[var(--nova-overlay-weak)]/50 rounded-xl px-3 py-2.5 text-sm leading-relaxed text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPollOpen((prev) => !prev);
              setError(null);
            }}
            aria-pressed={pollOpen}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition ${
              pollOpen
                ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)]'
                : 'border-[var(--nova-border-color)] bg-[var(--nova-surface)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            {t('poll.title', 'Poll')}
          </button>
          <button
            type="button"
            onClick={() => setStickerOpen((prev) => !prev)}
            aria-pressed={stickerOpen}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition ${
              sticker
                ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)]'
                : 'border-[var(--nova-border-color)] bg-[var(--nova-surface)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
            }`}
          >
            <MoodSmile className="h-3.5 w-3.5" />
            {t('stickers.title', 'Stickers')}
          </button>
        </div>

        {sticker && !stickerOpen && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] p-2">
            <StickerMedia
              sticker={sticker}
              className="h-10 w-10 object-contain"
              emojiClassName="text-3xl"
            />
            <span className="flex-1 truncate text-[11px] text-[var(--nova-text-secondary)]">{sticker.name}</span>
            <button
              type="button"
              onClick={() => setSticker(null)}
              title={t('common.remove', 'Remove')}
              className="rounded-lg p-1.5 text-[var(--nova-text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {stickerOpen && (
          <StickerPickerDrawer
            isOpen
            onClose={() => setStickerOpen(false)}
            onSelectEmoji={(emoji) => {
              setText((prev) => `${prev}${emoji}`);
              setStickerOpen(false);
            }}
            onSendSticker={(selected) => {
              setSticker(selected);
              setStickerOpen(false);
            }}
            onSendGif={(gifUrl) => {
              setImage(gifUrl);
              setStickerOpen(false);
            }}
          />
        )}

        {pollOpen && (
          <div className="space-y-2.5 rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--nova-text-muted)]">
                {t('poll.questionLabel', 'Question')}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPollOpen(false);
                  setPollQuestion('');
                  setPollOptions(['', '']);
                  setError(null);
                }}
                className="text-[10px] font-semibold text-[var(--nova-text-muted)] transition hover:text-red-400"
              >
                {t('common.remove', 'Remove')}
              </button>
            </div>
            <input
              value={pollQuestion}
              onChange={(event) => {
                setPollQuestion(event.target.value);
                setError(null);
              }}
              maxLength={250}
              placeholder={t('poll.questionPlaceholder', 'Ask a question...')}
              className="w-full bg-[var(--nova-overlay-weak)]/50 rounded-xl px-3 py-2.5 text-sm text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]"
            />

            <div className="space-y-2">
              {pollOptions.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={option}
                    onChange={(event) => updatePollOption(index, event.target.value)}
                    maxLength={100}
                    placeholder={t('poll.optionPlaceholder', {
                      count: index + 1,
                      defaultValue: `Option ${index + 1}`,
                    })}
                    className="flex-1 bg-[var(--nova-overlay-weak)]/50 rounded-xl px-3 py-2.5 text-sm text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removePollOption(index)}
                      title={t('common.remove', 'Remove')}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--nova-text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <TrashX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-0.5">
              {pollOptions.length < MAX_POLL_OPTIONS && (
                <button
                  type="button"
                  onClick={addPollOption}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[var(--nova-accent-color)] transition hover:brightness-125"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('poll.addOption', 'Add option')}
                </button>
              )}
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--nova-text-secondary)]">
                <input
                  type="checkbox"
                  checked={pollAnonymous}
                  onChange={(event) => setPollAnonymous(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--nova-accent-color)]"
                />
                {t('poll.anonymousVoting', 'Anonymous voting')}
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--nova-text-secondary)]">
                <input
                  type="checkbox"
                  checked={pollMultiple}
                  onChange={(event) => setPollMultiple(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--nova-accent-color)]"
                />
                {t('poll.multipleAnswers', 'Multiple answers')}
              </label>
            </div>
          </div>
        )}

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
            className="rounded-xl bg-[var(--nova-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-surface-high)] hover:text-[var(--nova-text-primary)]"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </NovaModal>
  );
};





















