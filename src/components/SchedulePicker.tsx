import React from 'react';
import {IconCalendarClock as CalendarClock, IconSend as Send} from '@tabler/icons-react';
import { useLanguage } from '../context/LanguageContext';
import { NovaCalendar } from '../lib/ui/NovaCalendar';

export interface ScheduleSelection {
  mode: 'now' | 'scheduled';
  date: Date;
}

interface SchedulePickerProps {
  value: ScheduleSelection;
  onChange: (value: ScheduleSelection) => void;
  markedDates?: Date[];
  className?: string;
}

const QUICK_TIMES = [9, 12, 18, 21];

const pad = (value: number): string => String(value).padStart(2, '0');

export const SchedulePicker: React.FC<SchedulePickerProps> = ({
  value,
  onChange,
  markedDates,
  className,
}) => {
  const { t, language } = useLanguage();
  const isFuture = value.date.getTime() > Date.now();

  const handleDateChange = (date: Date) => {
    onChange({ ...value, date });
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = event.target.value.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
    const next = new Date(value.date);
    next.setHours(hours, minutes, 0, 0);
    onChange({ ...value, date: next });
  };

  const setQuickTime = (hours: number) => {
    const next = new Date(value.date);
    next.setHours(hours, 0, 0, 0);
    onChange({ ...value, date: next });
  };

  const timeValue = `${pad(value.date.getHours())}:${pad(value.date.getMinutes())}`;
  const summary = new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value.date);

  return (
    <div className={`space-y-2 ${className ?? ''}`.trim()}>
      <label className="px-1 text-[11px] font-semibold text-[#868b98]">
        {t('schedule.title')}
      </label>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: 'now' })}
          className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
            value.mode === 'now'
              ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)]'
              : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)]/65 hover:border-[var(--nova-border-color)]/40 hover:text-[var(--nova-text-primary)]'
          }`}
        >
          <Send className="h-4 w-4 shrink-0 text-[var(--nova-accent-color)]" />
          <span className="text-xs font-semibold">{t('schedule.now')}</span>
        </button>

        <button
          type="button"
          onClick={() => onChange({ ...value, mode: 'scheduled' })}
          className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
            value.mode === 'scheduled'
              ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)]'
              : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)]/65 hover:border-[var(--nova-border-color)]/40 hover:text-[var(--nova-text-primary)]'
          }`}
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-[var(--nova-accent-color)]" />
          <span className="text-xs font-semibold">{t('schedule.later')}</span>
        </button>
      </div>

      {value.mode === 'scheduled' && (
        <div className="space-y-2 animate-in fade-in duration-150">
          <NovaCalendar
            value={value.date}
            onChange={handleDateChange}
            minDate={new Date()}
            markedDates={markedDates}
            locale={language}
          />

          <div className="rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#868b98]">
                {t('schedule.time')}
              </span>
              <span className="text-[10px] text-[var(--nova-accent-color)]">
                {summary}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={timeValue}
                onChange={handleTimeChange}
                className="w-[92px] rounded-lg border border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] p-1.5 text-xs text-[var(--nova-text-primary)] focus:border-[var(--nova-accent-color)] focus:outline-none"
                aria-label={t('schedule.time')}
              />
              <div className="flex flex-1 items-center gap-1">
                {QUICK_TIMES.map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setQuickTime(hours)}
                    className={`flex-1 rounded-lg border px-1 py-1.5 text-[10px] font-semibold transition ${
                      value.date.getHours() === hours && value.date.getMinutes() === 0
                        ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/20 text-white'
                        : 'border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)]/50 hover:text-[var(--nova-text-primary)]'
                    }`}
                  >
                    {pad(hours)}:00
                  </button>
                ))}
              </div>
            </div>

            {!isFuture && (
              <p className="mt-2 text-[10px] font-medium text-amber-400">
                {t('schedule.futureTime')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};










