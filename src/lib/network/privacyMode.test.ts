/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PRIVACY_PREFS,
  PRIVACY_STORAGE_KEY,
  coverTrafficIntervalMs,
  loadPrivacyPrefs,
  readBatteryStatus,
  savePrivacyPrefs,
  shouldEmitCoverTraffic,
  shouldPadPayload,
} from './privacyMode';

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
    savePrivacyPrefs({ metadataMinimization: true });
    expect(JSON.parse(localStorage.getItem(PRIVACY_STORAGE_KEY) ?? '{}')).toEqual({
      metadataMinimization: true,
    });
    expect(loadPrivacyPrefs().metadataMinimization).toBe(true);
  });

  it('ignores malformed stored prefs', () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, 'not-json');
    expect(loadPrivacyPrefs()).toEqual(DEFAULT_PRIVACY_PREFS);
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify({ metadataMinimization: 'yes' }));
    expect(loadPrivacyPrefs().metadataMinimization).toBe(false);
  });

  it('keeps padding on regardless of battery', () => {
    expect(shouldPadPayload({ metadataMinimization: true })).toBe(true);
  });

  it('suspends cover traffic on a low unplugged battery', () => {
    const prefs = { metadataMinimization: true };
    expect(shouldEmitCoverTraffic(prefs, { level: 0.1, charging: false })).toBe(false);
    expect(coverTrafficIntervalMs(prefs, { level: 0.1, charging: false })).toBeNull();
    expect(shouldEmitCoverTraffic(prefs, { level: 0.1, charging: true })).toBe(true);
    expect(shouldEmitCoverTraffic(prefs, { level: 0.8, charging: false })).toBe(true);
  });

  it('backs off cover traffic when unplugged', () => {
    const prefs = { metadataMinimization: true };
    expect(coverTrafficIntervalMs(prefs, { level: 0.9, charging: true })).toBe(60_000);
    expect(coverTrafficIntervalMs(prefs, { level: 0.9, charging: false })).toBe(120_000);
    expect(coverTrafficIntervalMs(prefs, { level: null, charging: true })).toBe(60_000);
  });

  it('reports unknown battery when the API is missing', async () => {
    await expect(readBatteryStatus()).resolves.toEqual({ level: null, charging: true });
  });
});
