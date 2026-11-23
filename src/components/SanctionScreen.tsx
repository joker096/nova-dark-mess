import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  KeyRound,
  LifeBuoy,
  Lock,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import {
  appealDeadline,
  canAppeal,
  loadActiveSanction,
  loadReports,
  loadAppealForSanction,
  submitAppeal,
  type AppealError,
} from '../lib/moderation/store';
import type { SanctionRecord } from '../types/moderation';

interface SanctionScreenProps {
  onClose: () => void;
  /** A blocking sanction cannot be dismissed; the appeal remains available. */
  mode?: 'center' | 'blocked';
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

const ERROR_KEYS: Record<AppealError, string> = {
  empty: 'moderation.appealEmpty',
  too_short: 'moderation.appealTooShort',
  too_long: 'moderation.appealTooLong',
  closed: 'moderation.appealClosed',
  already: 'moderation.appealAlready',
};

const APPEAL_STATUS_KEYS: Record<string, string> = {
  submitted: 'moderation.appealStatusSubmitted',
  reviewing: 'moderation.appealStatusReviewing',
  accepted: 'moderation.appealStatusAccepted',
  rejected: 'moderation.appealStatusRejected',
};

/**
 * Moderation centre and restriction screen. When the relay attaches a
 * sanction, it lands in the local store and this screen shows the reason,
 * duration, limits and the one-time appeal form. Without a sanction it shows
 * the current standing and the rules that can lead to one.
 */
export const SanctionScreen: React.FC<SanctionScreenProps> = ({ onClose, mode = 'center' }) => {
  const { t, language } = useLanguage();
  const blocked = mode === 'blocked';
  const dialogRef = useFocusTrap<HTMLDivElement>(true, blocked ? () => {} : onClose);
  const [sanction, setSanction] = useState<SanctionRecord | null>(() => loadActiveSanction());
  const [appeal, setAppeal] = useState(() => {
    const current = loadActiveSanction();
    return current ? loadAppealForSanction(current.id) : null;
  });
  const [text, setText] = useState('');
  const [error, setError] = useState<AppealError | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reportsCount = useMemo(() => loadReports().length, []);
  const deadline = sanction ? appealDeadline(sanction) : null;
  const appealOpen = sanction ? canAppeal(sanction, appeal) : false;

  const format = (timestamp: number | null) =>
    timestamp === null
      ? t('moderation.permanent')
      : new Intl.DateTimeFormat(language, DATE_OPTIONS).format(new Date(timestamp));

  const handleAppeal = () => {
    if (!sanction) return;
    const result = submitAppeal(sanction, text);
    if (!result.ok) {
      setError(result.error ?? 'closed');
      return;
    }
    setSanction(result.sanction ?? sanction);
    setAppeal(result.appeal ?? null);
    setText('');
    setError(null);
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 z-[96] flex items-end justify-center bg-black/85 p-2 backdrop-blur-md animate-in fade-in sm:items-center sm:p-4"
      onClick={blocked ? undefined : onClose}
      data-testid="sanction-screen"
      data-mode={mode}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('moderation.title')}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#11121a] text-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)]">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">{t('moderation.title')}</h3>
              <p className="text-[10px] text-white/40">{t('moderation.subtitle')}</p>
            </div>
          </div>
          {!blocked && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto">
          {sanction ? (
            <div className="space-y-3 p-4">
              <div className="relative overflow-hidden rounded-3xl border border-red-400/20 bg-gradient-to-br from-red-500/[0.14] via-[#1a1620] to-[#15161f] p-4">
                <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-red-500/10 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                      {t('moderation.level')} {sanction.level}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/60">
                      {sanction.ruleId}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold leading-tight">
                    {sanction.status === 'appealed'
                      ? t('moderation.underAppeal')
                      : t('moderation.restrictedTitle')}
                  </h2>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-white/60">{sanction.reason}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px]">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                      <span className="flex items-center gap-1 text-white/35">
                        <CalendarClock className="h-3 w-3" /> {t('moderation.issued')}
                      </span>
                      <span className="mt-0.5 block font-semibold text-white/80">
                        {format(sanction.issuedAt)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                      <span className="flex items-center gap-1 text-white/35">
                        <Clock3 className="h-3 w-3" /> {t('moderation.expires')}
                      </span>
<span className="mt-0.5 block font-semibold text-[var(--nova-text-primary)]/80">
                      {format(sanction.expiresAt)}
                    </span>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--nova-text-secondary)]/30">
                    {t('moderation.case')}: {sanction.caseId}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] p-3">
                  <Lock className="h-4 w-4 text-amber-400" />
                  <p className="mt-1.5 text-[11.5px] font-semibold">{t('moderation.relayPausedTitle')}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--nova-text-secondary)]/45">
                    {t('moderation.relayPausedBody')}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] p-3">
                  <KeyRound className="h-4 w-4 text-emerald-400" />
                  <p className="mt-1.5 text-[11.5px] font-semibold">{t('moderation.keysStayTitle')}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--nova-text-secondary)]/45">
                    {t('moderation.keysStayBody')}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] p-3">
                  <FileText className="h-4 w-4 text-sky-400" />
                  <p className="mt-1.5 text-[11.5px] font-semibold">{t('moderation.noSecretTitle')}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--nova-text-secondary)]/45">
                    {t('moderation.noSecretBody')}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                      <LifeBuoy className="h-4 w-4 text-[var(--nova-accent-color)]" />
                      {t('moderation.appealTitle')}
                    </h4>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--nova-text-secondary)]/45">
                      {t('moderation.appealHint')}
                    </p>
                  </div>
                  {deadline !== null && (
                    <span className="shrink-0 rounded-full bg-[var(--nova-overlay-weak)] px-2 py-1 text-[9.5px] text-[var(--nova-text-secondary)]/40">
                      {t('moderation.appealDeadline')}: {format(deadline)}
                    </span>
                  )}
                </div>

                {appeal ? (
                  <div className="mt-3 rounded-2xl border border-sky-400/15 bg-sky-400/[0.06] p-3">
                    <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-sky-200">
                      <Check className="h-3.5 w-3.5" />
                      {t(APPEAL_STATUS_KEYS[appeal.status] ?? 'moderation.appealStatusSubmitted')}
                    </p>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--nova-text-secondary)]/50">
                      {t('moderation.appealResponseHint')}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--nova-text-secondary)]/30">
                      {t('moderation.case')}: {appeal.id.slice(-8)} · {format(appeal.createdAt)}
                    </p>
                  </div>
                ) : appealOpen ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value.slice(0, 2000));
                        setError(null);
                      }}
                      rows={4}
                      placeholder={t('moderation.appealPlaceholder')}
                      aria-label={t('moderation.appealTitle')}
                      className="w-full resize-none rounded-xl border border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)]/40 px-3 py-2.5 text-[12px] text-[var(--nova-text-primary)] placeholder:[var(--nova-text-secondary)]/25 outline-none focus:border-[var(--nova-accent-color)]/50"
                    />
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={error ? 'text-red-400' : 'text-[var(--nova-text-secondary)]/30'}>
                        {error ? t(ERROR_KEYS[error]) : t('moderation.appealMinHint')}
                      </span>
                      <span className="tabular-nums text-[var(--nova-text-secondary)]/30">{text.length}/2000</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAppeal}
                      className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[var(--nova-accent-color)] px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
                    >
                      {t('moderation.appealSubmit')}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--nova-overlay-weak)] p-3 text-[10.5px] leading-relaxed text-[var(--nova-text-secondary)]/40">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t('moderation.appealClosedBody')}
                  </div>
                )}
                {submitted && (
                  <p className="mt-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-2.5 text-[10px] leading-relaxed text-amber-100/70">
                    {t('moderation.localOnly')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="relative overflow-hidden rounded-3xl border border-emerald-400/15 bg-gradient-to-br from-emerald-500/[0.1] via-[#151b1d] to-[#14151d] p-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-400">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h2 className="mt-3 text-lg font-bold">{t('moderation.clearTitle')}</h2>
                <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-[var(--nova-text-primary)]/50">
                  {t('moderation.clearBody')}
                </p>
                <div className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-[var(--nova-border-color)] bg-[var(--nova-canvas)]/20 px-3 py-1 text-[10px] text-[var(--nova-text-secondary)]/45">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t('moderation.clearStatus')}
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] p-3">
                  <MessageSquare className="h-4 w-4 text-sky-400" />
                  <p className="mt-1.5 text-[11.5px] font-semibold">{t('moderation.reportsTitle')}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--nova-text-secondary)]/45">
                    {t('moderation.reportsBody', { count: reportsCount })}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] p-3">
                  <CircleHelp className="h-4 w-4 text-amber-400" />
                  <p className="mt-1.5 text-[11.5px] font-semibold">{t('moderation.rulesTitle')}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--nova-text-secondary)]/45">
                    {t('moderation.rulesBody')}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--nova-text-primary)]/35">
                  {t('moderation.howTitle')}
                </p>
                <ol className="mt-2 space-y-1.5 text-[10.5px] text-[var(--nova-text-primary)]/55">
                  {[1, 2, 3].map((step) => (
                    <li key={step} className="flex items-start gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--nova-overlay-weak)] text-[9px] font-bold text-[var(--nova-text-primary)]/60">
                        {step}
                      </span>
                      {t(`moderation.howStep${step}`)}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)]/20 p-3 text-[10px] leading-relaxed text-[var(--nova-text-primary)]/35">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/60" />
                {t('moderation.noIdentityNote')}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--nova-border-color)] px-4 py-3">
          {!blocked && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--nova-text-secondary)]/45 transition hover:text-[var(--nova-text-primary)]"
            >
              {t('common.back')}
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            </button>
          )}
          <span className="text-[9.5px] text-[var(--nova-text-secondary)]/25">{t('moderation.footer')}</span>
        </div>
      </div>
    </div>
  );
};
