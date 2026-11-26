import React, { useMemo, useState } from 'react';
import {
  IconAlertTriangle as AlertTriangle,
  IconArrowLeft as ArrowLeft,
  IconBadge as BadgeCheck,
  IconBan as Ban,
  IconCopyright as Copyright,
  IconFlag as Flag,
  IconHeartCheck as HeartCheck,
  IconLock as Lock,
  IconSpeakerphone as Megaphone,
  IconPill as Pill,
  IconScale as Scale,
  IconShieldCheck as ShieldCheck,
  IconSend as Send,
  IconUser as UserRound,
  IconUserX as UserRoundX,
  IconX as X,
  IconHeartBroken as HeartCrack,
  IconAlertOctagon as Siren,
  IconUserX as UserCircleX,
} from '@tabler/icons-react';
import { useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { submitReport } from '../lib/moderation/store';
import type {
  ModerationReport,
  ReportReasonId,
  ReportTarget} from '../types/moderation';

interface ReportSheetProps {
  target: ReportTarget;
  onClose: () => void;
  onSubmitted?: (report: ModerationReport) => void;
}

const REASONS: Array<{
  id: ReportReasonId;
  icon: React.ReactNode;
}> = [
  { id: 'substances', icon: <Pill className="h-4 w-4" /> },
  { id: 'violence', icon: <Siren className="h-4 w-4" /> },
  { id: 'csam', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'hate', icon: <UserCircleX className="h-4 w-4" /> },
  { id: 'harassment', icon: <HeartCrack className="h-4 w-4" /> },
  { id: 'spam', icon: <Megaphone className="h-4 w-4" /> },
  { id: 'scam', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'privacy', icon: <Lock className="h-4 w-4" /> },
  { id: 'copyright', icon: <Copyright className="h-4 w-4" /> },
  { id: 'selfharm', icon: <HeartCrack className="h-4 w-4" /> },
  { id: 'impersonation', icon: <BadgeCheck className="h-4 w-4" /> },
  { id: 'illegal', icon: <Scale className="h-4 w-4" /> },
  { id: 'other', icon: <Flag className="h-4 w-4" /> },
];

const TARGET_TITLES: Record<ReportTarget['type'], string> = {
  post: 'moderation.reportTitlePost',
  comment: 'moderation.reportTitleComment',
  channel: 'moderation.reportTitleChannel',
  ad: 'moderation.reportTitleAd',
  user: 'moderation.reportTitleUser',
};

/**
 * A single report flow for posts, channels, comments and ads. It writes to the
 * local moderation outbox; the future relay sync sends the queue and attaches
 * a rotating reporter token, so no identity leaves the device here.
 */
export const ReportSheet: React.FC<ReportSheetProps> = ({ target, onClose, onSubmitted }) => {
  const { t } = useLanguage();
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [reason, setReason] = useState<ReportReasonId | null>(null);
  const [details, setDetails] = useState('');
  const [blockAdvertiser, setBlockAdvertiser] = useState(false);
  const [submitted, setSubmitted] = useState<ModerationReport | null>(null);

  const title = useMemo(() => t(TARGET_TITLES[target.type]), [t, target.type]);

  const handleSubmit = () => {
    if (!reason) return;
    const report = submitReport({
      target,
      reason,
      details,
      blockAdvertiser: target.type === 'ad' ? blockAdvertiser : undefined,
    });
    setSubmitted(report);
    onSubmitted?.(report);
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/80 p-2 backdrop-blur-md animate-in fade-in sm:items-center sm:p-4"
      onClick={onClose}
      data-testid="report-sheet"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#151621] text-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-white/5 p-4">
          {submitted ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label={t('common.back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <Flag className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold text-white">
              {submitted ? t('moderation.receivedTitle') : title}
            </h3>
            <p className="truncate text-[10px] text-white/45">
              {submitted
                ? t('moderation.caseId', { id: submitted.id.slice(-8) })
                : t('moderation.reportSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="flex flex-col items-center py-4 text-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-400">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <p className="text-sm font-semibold text-white">{t('moderation.receivedBody')}</p>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-white/50">
                {t('moderation.receivedReview')}
              </p>
            </div>
            {target.type === 'ad' && blockAdvertiser && (
              <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-[11px] text-white/70">
                <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <span>{t('moderation.advertiserBlocked')}</span>
              </div>
            )}
            <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-3 text-[10.5px] leading-relaxed text-amber-100/70">
              {t('moderation.localOnly')}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-[var(--nova-accent-color)] px-4 py-3 text-xs font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
            >
              {t('common.done')}
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto p-4 pb-2">
              {target.title && (
                <p className="mb-3 line-clamp-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-[11px] text-white/55">
                  {target.title}
                </p>
              )}
              <p className="mb-3 text-[11px] font-medium text-white/55">
                {t('moderation.chooseReason')}
              </p>
              <div
                role="radiogroup"
                aria-label={t('moderation.chooseReason')}
                className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
              >
                {REASONS.map((item) => {
                  const selected = reason === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setReason(item.id)}
                      className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[11.5px] transition ${
                        selected
                          ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/15 text-white'
                          : 'border-white/[0.07] bg-white/[0.035] text-white/65 hover:border-white/15 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span
                        className={`shrink-0 ${
                          selected ? 'text-[var(--nova-accent-color)]' : 'text-white/40'
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span>{t(`moderation.reason.${item.id}`)}</span>
                    </button>
                  );
                })}
              </div>

              <label className="mt-4 block text-[11px] font-medium text-white/55" htmlFor="report-details">
                {t('moderation.detailsLabel')}
              </label>
              <textarea
                id="report-details"
                value={details}
                onChange={(event) => setDetails(event.target.value.slice(0, 500))}
                placeholder={t('moderation.detailsPlaceholder')}
                rows={3}
                className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[12px] text-white placeholder:text-white/25 outline-none focus:border-[var(--nova-accent-color)]/50"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-white/30">
                <span>{t('moderation.detailsHint')}</span>
                <span className="tabular-nums">{details.length}/500</span>
              </div>

              {target.type === 'ad' && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={blockAdvertiser}
                  onClick={() => setBlockAdvertiser((value) => !value)}
                  className="mt-3 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      blockAdvertiser
                        ? 'border-red-400 bg-red-400 text-[#151621]'
                        : 'border-white/25'
                    }`}
                  >
                    {blockAdvertiser && <X className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium text-white/80">
                      {t('moderation.blockAdvertiser')}
                    </span>
                    <span className="block text-[10px] text-white/40">
                      {t('moderation.blockAdvertiserHint')}
                    </span>
                  </span>
                </button>
              )}

              <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-white/40">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/70" />
                <span>{t('moderation.falseReportWarning')}</span>
              </div>
            </div>

            <div className="shrink-0 border-t border-white/5 p-3">
              <button
                type="button"
                disabled={!reason}
                onClick={handleSubmit}
                className="w-full rounded-2xl bg-[var(--nova-accent-color)] px-4 py-3 text-xs font-semibold text-white transition enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t('moderation.submit')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};























