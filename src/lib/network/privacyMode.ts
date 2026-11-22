/**
 * Opt-in metadata minimization preferences and battery-aware decisions.
 *
 * Padding and randomized delays are cheap and can stay on, but cover traffic
 * costs battery and bandwidth, so it is suspended on a low battery that is not
 * charging. Callers pass the resolved battery status (or use
 * `readBatteryStatus`), which keeps this module pure and testable.
 */

import type { RelayEndpoint } from '../anon/relays';
import { selectRelaysForContact, shouldRotateQueue, nextRelay } from '../anon/relays';
import { isOnionUrl, checkTorRunning, type TorCheckResult } from '../anon/tor';

const DEEP_LINK_SCHEME = 'nova';

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
  /** Multi-relay: configured relay endpoints for traffic splitting (stage 6.3). */
  relayEndpoints: RelayEndpoint[];
  /** TURN servers for relay-only WebRTC calls (IP privacy in calls). */
  turnServers: RTCIceServer[];
  /** Tor: route relay traffic through local SOCKS proxy (stage 6.4). */
  torEnabled: boolean;
  torSocksPort: number;
  /** Analytics consent: off by default — no trackers without consent (stage 8.4). */
  analyticsConsent: boolean;
  /** Crash reports consent: off by default (stage 8.4). */
  crashReports: boolean;
}

/** Network profile for sharing — includes relay/TURN/Tor config so recipients don't need manual setup. */
export interface NetworkProfile {
  version: 1;
  relayEndpoints: RelayEndpoint[];
  turnServers: RTCIceServer[];
  torEnabled: boolean;
  torSocksPort: number;
  /** Build-time defaults (from VITE_* env) — included so profile works across deployments. */
  defaults: {
    relayEndpoints: RelayEndpoint[];
    turnServers: RTCIceServer[];
  };
}

export interface BatteryStatus {
  /** 0..1, or null when the device does not expose battery information. */
  level: number | null;
  charging: boolean;
}

export const PRIVACY_STORAGE_KEY = 'nova_privacy_mode';

/** Build-time default relay endpoints from VITE_ANON_RELAY_URL. */
function getDefaultRelayEndpoints(): RelayEndpoint[] {
  const relayUrl = (import.meta.env.VITE_ANON_RELAY_URL as string | undefined)?.trim();
  if (!relayUrl) return [];
  try {
    const url = new URL(relayUrl);
    // Only use public hosts as defaults (not localhost/private IPs)
    const hostname = url.hostname;
    if (
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      hostname !== '::1' &&
      !hostname.startsWith('127.') &&
      !hostname.startsWith('10.') &&
      !hostname.startsWith('172.1') &&
      !hostname.startsWith('172.2') &&
      !hostname.startsWith('172.3') &&
      !hostname.startsWith('192.168.')
    ) {
      return [{
        id: 'relay_default',
        url: relayUrl,
        operator: 'Default',
      }];
    }
  } catch {
    // Invalid URL, ignore
  }
  return [];
}

/** Build-time default TURN servers from VITE_TURN_URLS. */
function getDefaultTurnServers(): RTCIceServer[] {
  const urls = (import.meta.env.VITE_TURN_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) return [];

  const username = (import.meta.env.VITE_TURN_USERNAME ?? '').trim();
  const credential = (import.meta.env.VITE_TURN_CREDENTIAL ?? '').trim();
  const server: RTCIceServer = { urls };
  if (username) server.username = username;
  if (credential) server.credential = credential;
  return [server];
}

const DEFAULT_RELAY_ENDPOINTS = getDefaultRelayEndpoints();
const DEFAULT_TURN_SERVERS = getDefaultTurnServers();

export const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  metadataMinimization: false,
  presenceSharing: false,
  presenceHashing: true,
  presenceTtl: 'normal',
  webrtcRelayOnly: false,
  relayEndpoints: DEFAULT_RELAY_ENDPOINTS,
  turnServers: DEFAULT_TURN_SERVERS,
  torEnabled: false,
  torSocksPort: 9050,
  analyticsConsent: false,
  crashReports: false,
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
    const loaded = {
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
      relayEndpoints: Array.isArray(parsed.relayEndpoints)
        ? parsed.relayEndpoints.filter(
            (e): e is RelayEndpoint =>
              typeof e === 'object' &&
              e !== null &&
              typeof e.id === 'string' &&
              typeof e.url === 'string',
          )
        : [],
      turnServers: Array.isArray(parsed.turnServers)
        ? parsed.turnServers.filter(
            (s): s is RTCIceServer =>
              typeof s === 'object' &&
              s !== null &&
              (typeof s.urls === 'string' ||
                (Array.isArray(s.urls) && s.urls.every((u) => typeof u === 'string'))),
          )
        : [],
      torEnabled:
        typeof parsed.torEnabled === 'boolean'
          ? parsed.torEnabled
          : DEFAULT_PRIVACY_PREFS.torEnabled,
      torSocksPort:
        typeof parsed.torSocksPort === 'number' && parsed.torSocksPort > 0
          ? parsed.torSocksPort
          : DEFAULT_PRIVACY_PREFS.torSocksPort,
      analyticsConsent:
        typeof parsed.analyticsConsent === 'boolean'
          ? parsed.analyticsConsent
          : DEFAULT_PRIVACY_PREFS.analyticsConsent,
      crashReports:
        typeof parsed.crashReports === 'boolean'
          ? parsed.crashReports
          : DEFAULT_PRIVACY_PREFS.crashReports,
    };
    // Merge with build-time defaults so they're always available
    return {
      ...DEFAULT_PRIVACY_PREFS,
      ...loaded,
      relayEndpoints: [
        ...loaded.relayEndpoints,
        ...DEFAULT_PRIVACY_PREFS.relayEndpoints.filter(d =>
          !loaded.relayEndpoints.some(l => l.url === d.url)
        ),
      ],
      turnServers: [
        ...loaded.turnServers,
        ...DEFAULT_PRIVACY_PREFS.turnServers.filter(d =>
          !loaded.turnServers.some(l => JSON.stringify(l.urls) === JSON.stringify(d.urls))
        ),
      ],
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

/** ──────────────────────────────────────────────────────────────────────
 * Network Profile — shareable config so recipients don't need manual setup
 * ────────────────────────────────────────────────────────────────────── */

const NETWORK_PROFILE_KEY = 'nova_network_profile';

/** Create a shareable network profile from current prefs + build-time defaults. */
export function createNetworkProfile(prefs: PrivacyPrefs): NetworkProfile {
  return {
    version: 1,
    relayEndpoints: prefs.relayEndpoints,
    turnServers: prefs.turnServers,
    torEnabled: prefs.torEnabled,
    torSocksPort: prefs.torSocksPort,
    defaults: {
      relayEndpoints: DEFAULT_RELAY_ENDPOINTS,
      turnServers: DEFAULT_TURN_SERVERS,
    },
  };
}

/** Save network profile to localStorage (for export/share). */
export function saveNetworkProfile(profile: NetworkProfile): void {
  try {
    localStorage.setItem(NETWORK_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    void 0;
  }
}

/** Load saved network profile. */
export function loadNetworkProfile(): NetworkProfile | null {
  try {
    const raw = localStorage.getItem(NETWORK_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1) return null;
    return parsed as NetworkProfile;
  } catch {
    return null;
  }
}

/** Apply a network profile — merges with build-time defaults so it works everywhere. */
export function applyNetworkProfile(profile: NetworkProfile, currentPrefs: PrivacyPrefs): PrivacyPrefs {
  // Merge: user config wins, but fill gaps with profile, then build-time defaults
  const mergedRelayEndpoints = [
    ...currentPrefs.relayEndpoints,
    ...profile.relayEndpoints.filter(p => !currentPrefs.relayEndpoints.some(c => c.url === p.url)),
    ...profile.defaults.relayEndpoints.filter(d => 
      !currentPrefs.relayEndpoints.some(c => c.url === d.url) &&
      !profile.relayEndpoints.some(p => p.url === d.url)
    ),
  ];

  const mergedTurnServers = [
    ...currentPrefs.turnServers,
    ...profile.turnServers.filter(p => !currentPrefs.turnServers.some(c => 
      JSON.stringify(c.urls) === JSON.stringify(p.urls)
    )),
    ...profile.defaults.turnServers.filter(d => 
      !currentPrefs.turnServers.some(c => JSON.stringify(c.urls) === JSON.stringify(d.urls)) &&
      !profile.turnServers.some(p => JSON.stringify(p.urls) === JSON.stringify(d.urls))
    ),
  ];

  return {
    ...currentPrefs,
    relayEndpoints: mergedRelayEndpoints,
    turnServers: mergedTurnServers,
    torEnabled: currentPrefs.torEnabled || profile.torEnabled,
    torSocksPort: currentPrefs.torSocksPort || profile.torSocksPort,
  };
}

/** Generate a shareable deep link containing the network profile. */
export function buildNetworkProfileLink(profile: NetworkProfile): string {
  const base = `${DEEP_LINK_SCHEME}://network-profile`;
  const params = new URLSearchParams();
  params.set('data', btoa(JSON.stringify(profile)));
  return `${base}?${params.toString()}`;
}

/** Parse a network profile from a deep link. */
export function parseNetworkProfileLink(url: string): NetworkProfile | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'network-profile') return null;
    const data = parsed.searchParams.get('data');
    if (!data) return null;
    const profile = JSON.parse(atob(data)) as NetworkProfile;
    if (profile.version !== 1) return null;
    return profile;
  } catch {
    return null;
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

/** ──────────────────────────────────────────────────────────────────────
 * Multi-relay helpers (stage 6.3)
 * ────────────────────────────────────────────────────────────────────── */

/** Select primary/secondary relays for a contact seed. Returns null when no relays configured. */
export function selectContactRelays(
  prefs: PrivacyPrefs,
  contactSeed: string,
): { primary: RelayEndpoint; secondary?: RelayEndpoint } | null {
  if (prefs.relayEndpoints.length === 0) return null;
  return selectRelaysForContact(prefs.relayEndpoints, contactSeed);
}

/** Whether a queue created at `createdAt` should be rotated to another relay. */
export function queueNeedsRotation(
  prefs: PrivacyPrefs,
  createdAt: number,
  now: number = Date.now(),
): boolean {
  return shouldRotateQueue(createdAt, now);
}

/** Get the next relay in rotation after `current`. */
export function rotateToNextRelay(
  prefs: PrivacyPrefs,
  current: RelayEndpoint,
): RelayEndpoint | null {
  if (prefs.relayEndpoints.length <= 1) return null;
  return nextRelay(current, prefs.relayEndpoints);
}

/** ──────────────────────────────────────────────────────────────────────
 * Tor helpers (stage 6.4)
 * ────────────────────────────────────────────────────────────────────── */

/** Validate that a string is a .onion URL. */
export function isValidTorEndpoint(url: string): boolean {
  return isOnionUrl(url);
}

/** Probe the local Tor SOCKS listener. Returns the check result. */
export async function probeTor(
  socksPort: number,
): Promise<TorCheckResult> {
  return checkTorRunning({ socksPort });
}
