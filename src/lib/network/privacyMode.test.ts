/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PRIVACY_PREFS,
  PRIVACY_STORAGE_KEY,
  type PrivacyPrefs,
  coverTrafficIntervalMs,
  loadPrivacyPrefs,
  readBatteryStatus,
  savePrivacyPrefs,
  shouldEmitCoverTraffic,
  shouldPadPayload,
  presenceTtlMs,
} from './privacyMode';

const prefs = (overrides: Partial<PrivacyPrefs> = {}): PrivacyPrefs => ({
  ...DEFAULT_PRIVACY_PREFS,
  ...overrides,
});

describe('privacyMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to metadata minimization off', () => {
    expect(loadPrivacyPrefs()).toEqual(DEFAULT_PRIVACY_PREFS);
    expect(shouldPadPayload(DEFAULT_PRIVACY_PREFS)).toBe(false);
    expect(shouldEmitCoverTraffic(DEFAULT_PRIVACY_PREFS)).toBe(false);
    expect(coverTrafficIntervalMs(DEFAULT_PRIVACY_PREFS)).toBeNull();
  });

  it('persists the opt-in flag', () => {
    savePrivacyPrefs(prefs({ metadataMinimization: true }));
    expect(JSON.parse(localStorage.getItem(PRIVACY_STORAGE_KEY) ?? '{}')).toEqual(
      prefs({ metadataMinimization: true }),
    );
    expect(loadPrivacyPrefs().metadataMinimization).toBe(true);
  });

  it('ignores malformed stored prefs', () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, 'not-json');
    expect(loadPrivacyPrefs()).toEqual(DEFAULT_PRIVACY_PREFS);
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify({ metadataMinimization: 'yes' }));
    expect(loadPrivacyPrefs().metadataMinimization).toBe(false);
  });

  it('keeps padding on regardless of battery', () => {
    expect(shouldPadPayload(prefs({ metadataMinimization: true }))).toBe(true);
  });

  it('suspends cover traffic on a low unplugged battery', () => {
    const active = prefs({ metadataMinimization: true });
    expect(shouldEmitCoverTraffic(active, { level: 0.1, charging: false })).toBe(false);
    expect(coverTrafficIntervalMs(active, { level: 0.1, charging: false })).toBeNull();
    expect(shouldEmitCoverTraffic(active, { level: 0.1, charging: true })).toBe(true);
    expect(shouldEmitCoverTraffic(active, { level: 0.8, charging: false })).toBe(true);
  });

  it('backs off cover traffic when unplugged', () => {
    const active = prefs({ metadataMinimization: true });
    expect(coverTrafficIntervalMs(active, { level: 0.9, charging: true })).toBe(60_000);
    expect(coverTrafficIntervalMs(active, { level: 0.9, charging: false })).toBe(120_000);
    expect(coverTrafficIntervalMs(active, { level: null, charging: true })).toBe(60_000);
  });

  it('reports unknown battery when the API is missing', async () => {
    await expect(readBatteryStatus()).resolves.toEqual({ level: null, charging: true });
  });

  it('presence sharing is opt-in, hashing on and TTL normal by default', () => {
    const defaults = loadPrivacyPrefs();
    expect(defaults.presenceSharing).toBe(false);
    expect(defaults.presenceHashing).toBe(true);
    expect(defaults.presenceTtl).toBe('normal');
  });

  it('persists and reloads presence prefs', () => {
    savePrivacyPrefs(prefs({ presenceSharing: true, presenceTtl: 'long', presenceHashing: false }));
    const loaded = loadPrivacyPrefs();
    expect(loaded.presenceSharing).toBe(true);
    expect(loaded.presenceTtl).toBe('long');
    expect(loaded.presenceHashing).toBe(false);
  });

  it('rejects unknown TTL values on load', () => {
    localStorage.setItem(
      PRIVACY_STORAGE_KEY,
      JSON.stringify({ presenceTtl: 'forever' }),
    );
    expect(loadPrivacyPrefs().presenceTtl).toBe('normal');
  });

  it('maps TTL presets to millisecond windows', () => {
    expect(presenceTtlMs('short')).toBe(45_000);
    expect(presenceTtlMs('normal')).toBe(120_000);
    expect(presenceTtlMs('long')).toBe(300_000);
  });
});
