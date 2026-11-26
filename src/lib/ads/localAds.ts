import type { AdEventType } from './types';

const DISMISSED_KEY = 'nova_ads_dismissed_v1';
const BLOCKED_ADVERTISERS_KEY = 'nova_ads_blocked_advertisers_v1';
const EVENTS_KEY = 'nova_ads_local_events_v1';
const MAX_EVENTS = 200;

export const AD_PREFS_CHANGED_EVENT = 'nova:ads-prefs-changed';

function notifyAdPrefsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AD_PREFS_CHANGED_EVENT));
  }
}

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Local preferences are best-effort.
  }
}

export function isAdDismissed(campaignId: string): boolean {
  return readList(DISMISSED_KEY).includes(campaignId);
}

export function dismissAd(campaignId: string): void {
  const current = readList(DISMISSED_KEY);
  if (!current.includes(campaignId)) writeList(DISMISSED_KEY, [campaignId, ...current].slice(0, 100));
  recordAdEvent('dismiss', campaignId);
  notifyAdPrefsChanged();
}

export function restoreHiddenAd(campaignId: string): void {
  const current = readList(DISMISSED_KEY);
  if (!current.includes(campaignId)) return;
  writeList(
    DISMISSED_KEY,
    current.filter((id) => id !== campaignId),
  );
  notifyAdPrefsChanged();
}

export function isAdvertiserBlocked(advertiserId: string): boolean {
  return readList(BLOCKED_ADVERTISERS_KEY).includes(advertiserId);
}

export function blockAdvertiser(advertiserId: string): void {
  const current = readList(BLOCKED_ADVERTISERS_KEY);
  if (!current.includes(advertiserId)) {
    writeList(BLOCKED_ADVERTISERS_KEY, [advertiserId, ...current].slice(0, 100));
    notifyAdPrefsChanged();
  }
}

export function unblockAdvertiser(advertiserId: string): void {
  const current = readList(BLOCKED_ADVERTISERS_KEY);
  if (!current.includes(advertiserId)) return;
  writeList(
    BLOCKED_ADVERTISERS_KEY,
    current.filter((id) => id !== advertiserId),
  );
  notifyAdPrefsChanged();
}

export interface LocalAdPreferences {
  hiddenAds: string[];
  blockedAdvertisers: string[];
}

export const DEFAULT_AD_PREFS: LocalAdPreferences = {
  hiddenAds: [],
  blockedAdvertisers: [],
};

export function saveAdPreferences(prefs: LocalAdPreferences): void {
  writeList(DISMISSED_KEY, prefs.hiddenAds);
  writeList(BLOCKED_ADVERTISERS_KEY, prefs.blockedAdvertisers);
}

/** Reads the ad preferences kept on this device; nothing leaves the browser. */
export function loadAdPreferences(): LocalAdPreferences {
  return {
    hiddenAds: readList(DISMISSED_KEY),
    blockedAdvertisers: readList(BLOCKED_ADVERTISERS_KEY),
  };
}

/**
 * Purely local prototype events. Nothing is sent: the real Ad Service will
 * accept blinded tokens, not campaign IDs tied to a device.
 */
export function recordAdEvent(type: AdEventType, campaignId: string, now = Date.now()): void {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const events = Array.isArray(parsed) ? parsed : [];
    events.unshift({ type, campaignId, at: now });
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch {
    // A blocked storage quota must not break the feed.
  }
}

export function loadAdEvents(): Array<{ type: AdEventType; campaignId: string; at: number }> {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (event): event is { type: AdEventType; campaignId: string; at: number } =>
        Boolean(event) &&
        typeof event === 'object' &&
        typeof (event as { campaignId?: unknown }).campaignId === 'string' &&
        typeof (event as { at?: unknown }).at === 'number',
    );
  } catch {
    return [];
  }
}

export function clearLocalAdPrefs(): void {
  try {
    localStorage.removeItem(DISMISSED_KEY);
    localStorage.removeItem(BLOCKED_ADVERTISERS_KEY);
    localStorage.removeItem(EVENTS_KEY);
  } catch {
    // ignore
  }
  notifyAdPrefsChanged();
}
