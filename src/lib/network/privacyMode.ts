/**
 * Opt-in metadata minimization preferences and battery-aware decisions.
 *
 * Padding and randomized delays are cheap and can stay on, but cover traffic
 * costs battery and bandwidth, so it is suspended on a low battery that is not
 * charging. Callers pass the resolved battery status (or use
 * `readBatteryStatus`), which keeps this module pure and testable.
 */

export interface PrivacyPrefs {
  metadataMinimization: boolean;
}

export interface BatteryStatus {
  /** 0..1, or null when the device does not expose battery information. */
  level: number | null;
  charging: boolean;
}

export const PRIVACY_STORAGE_KEY = 'nova_privacy_mode';
export const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = { metadataMinimization: false };

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
