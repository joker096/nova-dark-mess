/**
 * Opt-in metadata minimization preferences and battery-aware decisions.
 *
 * Padding and randomized delays are cheap and can stay on, but cover traffic
 * costs battery and bandwidth, so it is suspended on a low battery that is not
 * charging. Callers pass the resolved battery status (or use
 * `readBatteryStatus`), which keeps this module pure and testable.
 */

export type PresenceTtl = 'short' | 'normal' | 'long';

export interface PrivacyPrefs {
  metadataMinimization: boolean;
  /** Share presence with the relay at all (opt-in, off by default). */
  presenceSharing: boolean;
  /** Hash the fingerprint before sending it, so the relay never sees the raw id. */
  presenceHashing: boolean;
  /** How long the relay keeps a heartbeat alive. */
  presenceTtl: PresenceTtl;
  /** Route WebRTC media through TURN only, hiding the local IP from peers. */
  webrtcRelayOnly: boolean;
}

export interface BatteryStatus {
  /** 0..1, or null when the device does not expose battery information. */
  level: number | null;
  charging: boolean;
}

export const PRIVACY_STORAGE_KEY = 'nova_privacy_mode';
export const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  metadataMinimization: false,
  presenceSharing: false,
  presenceHashing: true,
  presenceTtl: 'normal',
  webrtcRelayOnly: false,
};

const PRESENCE_TTLS: PresenceTtl[] = ['short', 'normal', 'long'];

function parsePresenceTtl(value: unknown): PresenceTtl {
  return PRESENCE_TTLS.includes(value as PresenceTtl) ? (value as PresenceTtl) : DEFAULT_PRIVACY_PREFS.presenceTtl;
}

/** Battery level below which cover traffic is paused while unplugged. */
export const COVER_TRAFFIC_MIN_LEVEL = 0.2;

export function loadPrivacyPrefs(): PrivacyPrefs {
  try {
    const raw = localStorage.getItem(PRIVACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRIVACY_PREFS };
    const parsed = JSON.parse(raw) as Partial<PrivacyPrefs>;
    return {
      metadataMinimization:
        typeof parsed.metadataMinimization === 'boolean'
          ? parsed.metadataMinimization
          : DEFAULT_PRIVACY_PREFS.metadataMinimization,
      presenceSharing:
        typeof parsed.presenceSharing === 'boolean'
          ? parsed.presenceSharing
          : DEFAULT_PRIVACY_PREFS.presenceSharing,
      presenceHashing:
        typeof parsed.presenceHashing === 'boolean'
          ? parsed.presenceHashing
          : DEFAULT_PRIVACY_PREFS.presenceHashing,
      presenceTtl: parsePresenceTtl(parsed.presenceTtl),
      webrtcRelayOnly:
        typeof parsed.webrtcRelayOnly === 'boolean'
          ? parsed.webrtcRelayOnly
          : DEFAULT_PRIVACY_PREFS.webrtcRelayOnly,
    };
  } catch {
    return { ...DEFAULT_PRIVACY_PREFS };
  }
}

export function savePrivacyPrefs(prefs: PrivacyPrefs): void {
  try {
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    void 0;
  }
}

/**
 * Server-side TTL for a presence heartbeat, matching the relay's sweep window.
 * Values mirror `server.js` (`presence.ttlMs`): short 45 s, normal 2 min,
 * long 5 min. A shorter TTL means the relay forgets you sooner after the last
 * heartbeat; a longer one means fewer re-announcements but a bigger window.
 */
export function presenceTtlMs(ttl: PresenceTtl): number {
  switch (ttl) {
    case 'short':
      return 45_000;
    case 'long':
      return 5 * 60_000;
    default:
      return 2 * 60_000;
  }
}

export async function readBatteryStatus(): Promise<BatteryStatus> {
  const unknown: BatteryStatus = { level: null, charging: true };
  try {
    const navigatorWithBattery = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    const battery = await navigatorWithBattery.getBattery?.();
    if (!battery) return unknown;
    return {
      level: Number.isFinite(battery.level) ? battery.level : null,
      charging: Boolean(battery.charging),
    };
  } catch {
    return unknown;
  }
}

/** Padding and send-time jitter are cheap, so they follow the pref directly. */
export function shouldPadPayload(prefs: PrivacyPrefs): boolean {
  return prefs.metadataMinimization;
}

/** Cover traffic is skipped on a low, unplugged battery. */
export function shouldEmitCoverTraffic(
  prefs: PrivacyPrefs,
  battery: BatteryStatus = { level: null, charging: true },
): boolean {
  if (!prefs.metadataMinimization) return false;
  if (battery.charging) return true;
  if (battery.level === null) return true;
  return battery.level >= COVER_TRAFFIC_MIN_LEVEL;
}

/**
 * Cover-traffic cadence: slower when unplugged so the radio wakes less often.
 * Returns milliseconds between cover payloads.
 */
export function coverTrafficIntervalMs(
  prefs: PrivacyPrefs,
  battery: BatteryStatus = { level: null, charging: true },
): number | null {
  if (!shouldEmitCoverTraffic(prefs, battery)) return null;
  const base = 60_000;
  return battery.charging ? base : base * 2;
}
