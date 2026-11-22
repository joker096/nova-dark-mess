import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface NovaCalendarProps {
  value: Date;
  onChange: (date: Date) => void;
  minDate?: Date;
  markedDates?: Date[];
  locale?: string;
  className?: string;
}

const WEEK_LENGTH = 7;
const GRID_CELLS = 42;

const startOfDay = (value: Date): Date => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export function NovaCalendar({
  value,
  onChange,
  minDate,
  markedDates = [],
  locale,
  className,
}: NovaCalendarProps) {
  const { t } = useLanguage();
  const valueYear = value.getFullYear();
  const valueMonth = value.getMonth();
  const [viewMonth, setViewMonth] = useState(() => new Date(valueYear, valueMonth, 1));
  const [today] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    setViewMonth(new Date(valueYear, valueMonth, 1));
  }, [valueYear, valueMonth]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
      }).format(viewMonth),
    [locale, viewMonth],
  );

  const weekdayLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: WEEK_LENGTH }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    });
  }, [locale]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - mondayOffset);

    return Array.from({ length: GRID_CELLS }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [viewMonth]);

  const selectDate = (date: Date) => {
    const next = new Date(date);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(next);
  };

  const shiftMonth = (offset: number) => {
    setViewMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  };

  const selectToday = () => {
    const next = new Date(today);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    onChange(next);
  };

  return (
    <div
      className={`rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 ${className ?? ''}`.trim()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-95"
          aria-label={t('common.previous')}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={selectToday}
            className="rounded-full border border-[var(--border)] bg-[var(--bg-surface-2)] px-2 py-0.5 text-[9px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--nova-accent-color)]/40 hover:text-[var(--nova-accent-color)]"
          >
            {t('common.today')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-95"
          aria-label={t('common.next')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {weekdayLabels.map((label) => (
          <span
            key={label}
            className="text-center text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date) => {
          const isCurrentMonth = date.getMonth() === viewMonth.getMonth();
          const isSelected = sameDay(date, value);
          const isToday = sameDay(date, today);
          const isMarked = markedDates.some((marked) => sameDay(marked, date));
          const isDisabled = minDate ? startOfDay(date).getTime() < startOfDay(minDate).getTime() : false;
          const ariaLabel = new Intl.DateTimeFormat(locale, {
            dateStyle: 'full',
          }).format(date);

          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => selectDate(date)}
              aria-label={ariaLabel}
              aria-pressed={isSelected}
              className={`relative flex h-8 items-center justify-center rounded-lg text-[11px] font-semibold transition ${
                isSelected
                  ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-md shadow-[var(--nova-accent-color)]/25'
                  : isDisabled
                    ? 'cursor-not-allowed text-[var(--text-disabled)]'
                    : isCurrentMonth
                      ? 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)]'
              } ${isToday && !isSelected ? 'ring-1 ring-inset ring-[var(--nova-accent-color)]/60' : ''}`}
            >
              {date.getDate()}
              {isMarked && (
                <span
                  className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-[var(--nova-accent-color)]'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
