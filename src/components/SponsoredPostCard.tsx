import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  Ban,
  EyeOff,
  Flag,
  Info,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { toSafeExternalUrl } from '../lib/security/safeUrl';
import {
  AD_PREFS_CHANGED_EVENT,
  blockAdvertiser,
  dismissAd,
  isAdDismissed,
  isAdvertiserBlocked,
  recordAdEvent,
} from '../lib/ads/localAds';
import type { AdCampaign } from '../lib/ads/types';
import type { ModerationReport } from '../types/moderation';
import { ReportSheet } from './ReportSheet';

interface SponsoredPostCardProps {
  campaign: AdCampaign;
  onDismissed?: () => void;
  onReported?: (report: ModerationReport) => void;
}

/**
 * Native sponsored card shown between channel posts. It deliberately has no
 * overlay, autoplay or media viewer, and carries a visible ad label, a "why
 * this ad" explanation, hide and report actions.
 */
export const SponsoredPostCard: React.FC<SponsoredPostCardProps> = ({
  campaign,
  onDismissed,
  onReported,
}) => {
  const { t } = useLanguage();
  const cardRef = useRef<HTMLElement | null>(null);
  const impressionSent = useRef(false);
  const [hidden, setHidden] = useState(
    () => isAdDismissed(campaign.id) || isAdvertiserBlocked(campaign.advertiserId),
  );
  const [whyOpen, setWhyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (hidden || !cardRef.current || typeof IntersectionObserver === 'undefined') return;
    let timer: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.intersectionRatio >= 0.5 && !impressionSent.current) {
          timer = window.setTimeout(() => {
            if (impressionSent.current) return;
            impressionSent.current = true;
            recordAdEvent('impression', campaign.id);
          }, 1000);
        } else if (timer) {
          window.clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(cardRef.current);
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [campaign.id, hidden]);

  useEffect(() => {
    if (!whyOpen && !reportOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setWhyOpen(false);
      setReportOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [whyOpen, reportOpen]);

  // Settings can reset the local ad preferences while the feed stays mounted;
  // reflect that immediately instead of waiting for a remount.
  useEffect(() => {
    const refresh = () =>
      setHidden(isAdDismissed(campaign.id) || isAdvertiserBlocked(campaign.advertiserId));
    window.addEventListener(AD_PREFS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(AD_PREFS_CHANGED_EVENT, refresh);
  }, [campaign.id, campaign.advertiserId]);

  if (hidden) return null;

  const hide = () => {
    dismissAd(campaign.id);
    setHidden(true);
    setWhyOpen(false);
    onDismissed?.();
  };

  const openDestination = () => {
    recordAdEvent('click', campaign.id);
    const destination = toSafeExternalUrl(campaign.destinationUrl);
    if (!destination) return;
    window.open(destination, '_blank', 'noopener,noreferrer');
  };

  const handleReported = (report: ModerationReport) => {
    if (report.blockAdvertiser) blockAdvertiser(campaign.advertiserId);
    recordAdEvent('report', campaign.id);
    setReportOpen(false);
    setHidden(true);
    onReported?.(report);
  };

  return (
    <>
      <article
        ref={cardRef}
        aria-label={`${t('ads.label')}: ${campaign.headline}`}
        data-testid="sponsored-post-card"
        className="relative overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#171820]/95 shadow-md shadow-black/50"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${campaign.accent}99, transparent)`,
          }}
        />

        <div className="flex items-center gap-2.5 px-4 pt-3.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-inner"
            style={{
              background: `linear-gradient(135deg, ${campaign.accent}66, ${campaign.accent}22)`,
              border: `1px solid ${campaign.accent}44`,
            }}
          >
            <AudioLines className="h-4 w-4" style={{ color: campaign.accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-semibold text-white/90">
                {campaign.advertiserName}
              </span>
              <span className="shrink-0 rounded-full border border-[var(--nova-accent-color)]/35 bg-[var(--nova-accent-color)]/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-[var(--nova-accent-color)]">
                {t('ads.label')}
              </span>
            </div>
            <p className="truncate text-[9.5px] text-white/35">{campaign.category}</p>
          </div>
          <button
            type="button"
            onClick={hide}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/30 transition hover:bg-white/5 hover:text-white/80"
            aria-label={t('ads.hideAd')}
            title={t('ads.hideAd')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="relative flex h-[88px] items-center justify-between overflow-hidden rounded-2xl border border-white/[0.06] bg-[#121521] px-4">
            <div
              className="absolute -right-10 -top-16 h-44 w-44 rounded-full opacity-30 blur-2xl"
              style={{ background: campaign.accent }}
            />
            <div
              className="absolute right-10 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full border opacity-20"
              style={{ borderColor: campaign.accent }}
            />
            <div
              className="absolute right-16 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full border opacity-30"
              style={{ borderColor: campaign.accent }}
            />
            <div className="relative min-w-0">
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">
                <Sparkles className="h-2.5 w-2.5" style={{ color: campaign.accent }} />
                {t('ads.nativeLabel')}
              </p>
              <p className="mt-1 text-lg font-bold tracking-tight text-white">
                {campaign.advertiserName}
              </p>
              <p className="text-[10px] text-white/35">{campaign.headline}</p>
            </div>
            <AudioLines
              className="relative h-10 w-10 shrink-0 opacity-80"
              style={{ color: campaign.accent }}
            />
          </div>

          <h3 className="mt-3 text-[14.5px] font-bold leading-snug text-white">
            {campaign.headline}
          </h3>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[#a0a5b2]">
            {campaign.body}
          </p>

          <button
            type="button"
            onClick={openDestination}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-[11.5px] font-semibold text-white/90 transition hover:bg-white/10 active:scale-[0.98]"
          >
            {campaign.ctaLabel}
            <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] px-4 py-2">
          <button
            type="button"
            onClick={() => setWhyOpen(true)}
            className="inline-flex items-center gap-1 rounded-full py-1 text-[10px] font-medium text-white/35 transition hover:text-white/65"
          >
            <Info className="h-3 w-3" />
            {t('ads.whyThisAd')}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-white/35 transition hover:bg-red-500/10 hover:text-red-300"
            >
              <Flag className="h-3 w-3" />
              {t('ads.reportAd')}
            </button>
            <button
              type="button"
              onClick={hide}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-white/35 transition hover:bg-white/5 hover:text-white/70"
            >
              <EyeOff className="h-3 w-3" />
              {t('ads.hideAd')}
            </button>
          </div>
        </div>
      </article>

      {whyOpen && (
        <div
          className="fixed inset-0 z-[94] flex items-end justify-center bg-black/75 p-2 backdrop-blur-md sm:items-center sm:p-4"
          onClick={() => setWhyOpen(false)}
          data-testid="ad-disclosure-sheet"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('ads.whyTitle')}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-[26px] border border-white/10 bg-[#151621] text-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)]">
                  <Info className="h-4 w-4" />
                </div>
                <h4 className="text-sm font-bold">{t('ads.whyTitle')}</h4>
              </div>
              <button
                type="button"
                onClick={() => setWhyOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-white/60"
                aria-label={t('common.close')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-[11.5px] leading-relaxed text-white/60">{t('ads.whyBody')}</p>
              <ul className="space-y-1.5 text-[11px] text-white/55">
                {[1, 2, 3].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    {t(`ads.whyPoint${item}`)}
                  </li>
                ))}
              </ul>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[10px] leading-relaxed text-white/35">
                {t('ads.whyContext', { advertiser: campaign.advertiserName })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={hide}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/10"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  {t('ads.hideAd')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWhyOpen(false);
                    setReportOpen(true);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-400/15"
                >
                  <Flag className="h-3.5 w-3.5" />
                  {t('ads.reportAd')}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  blockAdvertiser(campaign.advertiserId);
                  setWhyOpen(false);
                  setHidden(true);
                  onDismissed?.();
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10.5px] font-medium text-white/35 transition hover:text-white/65"
              >
                <Ban className="h-3.5 w-3.5" />
                {t('ads.blockAdvertiser')}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <ReportSheet
          target={{
            type: 'ad',
            id: campaign.id,
            advertiserId: campaign.advertiserId,
            title: `${campaign.advertiserName} — ${campaign.headline}`,
          }}
          onClose={() => setReportOpen(false)}
          onSubmitted={handleReported}
        />
      )}
    </>
  );
};
