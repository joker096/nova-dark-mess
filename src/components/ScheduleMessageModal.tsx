import React, { useState } from 'react';
import { Clock, Calendar, X, Check, Send } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';

interface ScheduleMessageModalProps {
  isOpen: boolean;
  messageText: string;
  onSchedule: (date: Date, formattedTime: string) => void;
  onClose: () => void;
}

export const ScheduleMessageModal: React.FC<ScheduleMessageModalProps> = ({
  isOpen,
  messageText,
  onSchedule,
  onClose,
}) => {
  const { t } = useLanguage();
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
  const [selectedPreset, setSelectedPreset] = useState<'5s' | '15m' | 'tonight' | 'tomorrow' | 'custom'>('5s');
  
  // Custom time inputs
  const now = new Date();
  const defaultDateStr = now.toISOString().split('T')[0];
  const defaultTimeStr = `${String((now.getHours() + 1) % 24).padStart(2, '0')}:00`;

  const [customDate, setCustomDate] = useState(defaultDateStr);
  const [customTime, setCustomTime] = useState(defaultTimeStr);

  if (!isOpen) return null;

  const handleConfirmSchedule = () => {
    let targetDate: Date;
    let formattedLabel: string;

    if (selectedPreset === '5s') {
      targetDate = new Date(Date.now() + 5000);
      formattedLabel = 'in 5 seconds';
    } else if (selectedPreset === '15m') {
      targetDate = new Date(Date.now() + 15 * 60 * 1000);
      formattedLabel = 'in 15 minutes';
    } else if (selectedPreset === 'tonight') {
      targetDate = new Date();
      targetDate.setHours(21, 0, 0, 0);
      if (targetDate.getTime() <= Date.now()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      formattedLabel = `Tonight at 21:00`;
    } else if (selectedPreset === 'tomorrow') {
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(9, 0, 0, 0);
      formattedLabel = `Tomorrow at 09:00`;
    } else {
      const [year, month, day] = customDate.split('-').map(Number);
      const [hours, minutes] = customTime.split(':').map(Number);
      targetDate = new Date(year, month - 1, day, hours, minutes);
      formattedLabel = `${customDate} at ${customTime}`;
    }

    onSchedule(targetDate, formattedLabel);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-message-title"
        className="bg-[var(--nova-surface)] border border-[var(--nova-border-color)] rounded-3xl w-full max-w-sm p-4 text-[var(--nova-text-primary)] shadow-2xl space-y-4 animate-in slide-in-from-bottom-3 duration-250"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--nova-border-color)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)]">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 id="schedule-message-title" className="font-bold text-sm text-[var(--nova-text-primary)] leading-tight">
                {t('schedule.title')}
              </h3>
              <p className="text-[10px] text-[var(--nova-text-muted)]">
                {t('schedule.subtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)]/70 hover:text-[var(--nova-text-primary)] transition cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message preview snippet */}
        <div className="bg-[var(--nova-surface-high)] border border-[var(--nova-border-color)] rounded-2xl p-3">
          <span className="text-[10px] font-semibold text-[var(--nova-accent-color)] uppercase tracking-wider block mb-1">
            {t('schedule.preview')}
          </span>
          <p className="text-xs text-[var(--nova-text-primary)]/90 italic truncate">
            "{messageText || t('schedule.voiceMessage')}"
          </p>
        </div>

        {/* Quick Presets */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-[var(--nova-text-muted)] px-1">
            {t('schedule.chooseTime')}
          </label>

          <div className="grid grid-cols-2 gap-2">
            {/* 5 Seconds (Quick Demo) */}
            <button
              type="button"
              onClick={() => setSelectedPreset('5s')}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                selectedPreset === '5s'
                  ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)] shadow-sm'
                  : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)]/70 hover:text-[var(--nova-text-primary)] hover:border-[var(--nova-border-color)]/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{t('schedule.in5s')}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--nova-accent-color)] text-white font-bold">
                  {t('schedule.demo')}
                </span>
              </div>
              <p className="text-[10px] text-[var(--nova-text-muted)] mt-0.5">{t('schedule.quickTest')}</p>
            </button>

            {/* 15 Minutes */}
            <button
              type="button"
              onClick={() => setSelectedPreset('15m')}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                selectedPreset === '15m'
                  ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)] shadow-sm'
                  : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)]/70 hover:text-[var(--nova-text-primary)] hover:border-[var(--nova-border-color)]/40'
              }`}
            >
              <span className="text-xs font-semibold block">{t('schedule.in15m')}</span>
              <p className="text-[10px] text-[var(--nova-text-muted)] mt-0.5">{t('schedule.shortDelay')}</p>
            </button>

            {/* Tonight at 21:00 */}
            <button
              type="button"
              onClick={() => setSelectedPreset('tonight')}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                selectedPreset === 'tonight'
                  ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)] shadow-sm'
                  : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)]/70 hover:text-[var(--nova-text-primary)] hover:border-[var(--nova-border-color)]/40'
              }`}
            >
              <span className="text-xs font-semibold block">{t('schedule.tonight')}</span>
              <p className="text-[10px] text-[var(--nova-text-muted)] mt-0.5">{t('schedule.eveningReminder')}</p>
            </button>

            {/* Tomorrow at 09:00 */}
            <button
              type="button"
              onClick={() => setSelectedPreset('tomorrow')}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                selectedPreset === 'tomorrow'
                  ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)] shadow-sm'
                  : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)]/70 hover:text-[var(--nova-text-primary)] hover:border-[var(--nova-border-color)]/40'
              }`}
            >
              <span className="text-xs font-semibold block">{t('schedule.tomorrow')}</span>
              <p className="text-[10px] text-[var(--nova-text-muted)] mt-0.5">{t('schedule.morningFollowUp')}</p>
            </button>
          </div>
        </div>

        {/* Custom Date & Time Toggle */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setSelectedPreset('custom')}
            className={`w-full p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
              selectedPreset === 'custom'
                ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-text-primary)]'
                : 'border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)]/70 hover:text-[var(--nova-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--nova-accent-color)]" />
              <span className="text-xs font-semibold">{t('schedule.customDateTime')}</span>
            </div>
            {selectedPreset === 'custom' && (
              <Check className="w-4 h-4 text-[var(--nova-accent-color)]" />
            )}
          </button>

          {selectedPreset === 'custom' && (
            <div
              data-testid="schedule-custom-panel"
              className="grid grid-cols-2 gap-2 mt-2 p-2 bg-[var(--nova-surface-high)] rounded-xl border border-[var(--nova-border-color)] animate-in fade-in"
            >
              <div>
                <label className="text-[10px] text-[var(--nova-text-muted)] block mb-1">{t('schedule.date')}</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full bg-[var(--nova-surface-high)] border border-[var(--nova-border-color)] rounded-lg p-1.5 text-xs text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--nova-text-muted)] block mb-1">{t('schedule.time')}</label>
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full bg-[var(--nova-surface-high)] border border-[var(--nova-border-color)] rounded-lg p-1.5 text-xs text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Confirm Actions */}
        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirmSchedule}
            className="flex-1 py-2.5 rounded-xl bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5d2b)] text-white font-semibold text-xs transition cursor-pointer shadow-lg shadow-[var(--nova-accent-color)]/25 flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{t('schedule.confirm')}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-secondary)]/70 hover:text-[var(--nova-text-primary)] font-semibold text-xs transition cursor-pointer"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
