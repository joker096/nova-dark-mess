/**
 * Client for the native ad server (Etapa 7).
 *
 * Privacy-first: no user IDs, no device identifiers are sent. The server
 * only learns which channel requested an ad and which creative was shown.
 * All interaction (click, dismiss, block) stays local.
 */
import type { AdCampaign } from './types';

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
 */
export async function fetchAd(channelId: string): Promise<AdCampaign | null> {
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
