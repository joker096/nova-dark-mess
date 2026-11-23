/**
 * Client for the native ad server (Etapa 7).
 *
 * Privacy-first: no user IDs, no device identifiers are sent. The server
 * only learns which channel requested an ad and which creative was shown.
 * All interaction (click, dismiss, block) stays local.
 */
import type { AdCampaign } from './types';
import { cachedFetch } from '../../lib/api';

const AD_SERVER_URL = (import.meta.env.VITE_AD_SERVER_URL || 'http://localhost:8082').replace(/\/+$/, '');

interface AdServerAd {
  creative_id: string;
  campaign_id: string;
  title: string;
  body: string;
  image_url?: string | null;
  click_url: string;
  erid?: string | null;
  marked_as_ad: boolean;
}

interface AdServerResponse {
  ad: AdServerAd;
}

const DEFAULT_CTA_LABEL = 'Подробнее';
const DEFAULT_CATEGORY = 'Реклама';
const DEFAULT_ACCENT = '#8ca6ff';

/**
 * Maps the ad server's creative response to the client's AdCampaign type.
 * Fields the server doesn't yet return (advertiserName, ctaLabel, category,
 * accent) get sensible client-side defaults; the server can be extended later.
 */
function mapAd(serverAd: AdServerAd): AdCampaign {
  return {
    id: serverAd.creative_id,
    advertiserId: serverAd.campaign_id,
    advertiserName: `Advertiser ${serverAd.campaign_id.slice(-8)}`,
    headline: serverAd.title,
    body: serverAd.body,
    ctaLabel: DEFAULT_CTA_LABEL,
    destinationUrl: serverAd.click_url,
    category: DEFAULT_CATEGORY,
    accent: DEFAULT_ACCENT,
  };
}

/**
 * Fetch an ad creative for a channel. Returns null if no ad is available
 * (204 No Content) or the ad server is unreachable.
 * Results are cached for 60 seconds with stale-while-revalidate.
 */
export async function fetchAd(channelId: string): Promise<AdCampaign | null> {
  const key = `ad:${channelId}`;
  return cachedFetch<AdCampaign | null>(
    key,
    async () => {
      try {
        const res = await fetch(`${AD_SERVER_URL}/v1/ads?channel_id=${encodeURIComponent(channelId)}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5_000),
        });
        if (res.status === 204) return null; // no ad available
        if (!res.ok) return null;
        const data = (await res.json()) as AdServerResponse;
        return data.ad ? mapAd(data.ad) : null;
      } catch {
        return null;
      }
    },
    { ttl: 60_000, staleWhileRevalidate: true }
  );
}

/**
 * Record an anonymous impression for a shown ad. Fire-and-forget: failures
 * are ignored so a broken ad server never blocks the feed.
 */
export async function recordImpression(campaignId: string, creativeId: string, channelId: string): Promise<void> {
  try {
    await fetch(`${AD_SERVER_URL}/v1/ads/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, creative_id: creativeId, channel_id: channelId }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    /* impression recording is best-effort */
  }
}

/**
 * Fetch ad statistics for a channel (impressions, clicks, revenue).
 * Returns null if the ad server is unreachable or no stats available.
 */
export interface AdStats {
  impressions: number;
  clicks: number;
  ctr: number; // click-through rate in percent
  revenueCents: number; // estimated revenue in cents
  estimatedPayoutCents: number; // 50% rev share for admin
  period: { from: number; to: number };
}

export async function fetchAdStats(channelId: string, fromMs?: number, toMs?: number): Promise<AdStats | null> {
  try {
    const params = new URLSearchParams({ channel_id: channelId });
    if (fromMs) params.append('from', String(fromMs));
    if (toMs) params.append('to', String(toMs));
    
    const res = await fetch(`${AD_SERVER_URL}/v1/ads/stats?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { 
      impressions: number; 
      clicks: number; 
      revenue_cents: number; 
      channel_id: string; 
      from: number; 
      to: number;
    };
    
    const impressions = data.impressions || 0;
    const clicks = data.clicks || 0;
    const revenueCents = data.revenue_cents || 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const estimatedPayoutCents = Math.floor(revenueCents * 0.5); // 50% rev share
    
    return {
      impressions,
      clicks,
      ctr: Math.round(ctr * 100) / 100,
      revenueCents,
      estimatedPayoutCents,
      period: { from: data.from, to: data.to },
    };
  } catch {
    return null;
  }
}
