/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AD_PREFS_CHANGED_EVENT,
  blockAdvertiser,
  clearLocalAdPrefs,
  dismissAd,
  loadAdPreferences,
  restoreHiddenAd,
  unblockAdvertiser,
} from './localAds';

describe('local ad preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps hidden ads and blocked advertisers on the device', () => {
    dismissAd('campaign-1');
    blockAdvertiser('advertiser-1');

    expect(loadAdPreferences()).toEqual({
      hiddenAds: ['campaign-1'],
      blockedAdvertisers: ['advertiser-1'],
    });
  });

  it('restores one hidden ad and unblocks one advertiser', () => {
    dismissAd('campaign-1');
    dismissAd('campaign-2');
    blockAdvertiser('advertiser-1');
    blockAdvertiser('advertiser-2');

    restoreHiddenAd('campaign-1');
    unblockAdvertiser('advertiser-1');

    expect(loadAdPreferences()).toEqual({
      hiddenAds: ['campaign-2'],
      blockedAdvertisers: ['advertiser-2'],
    });
  });

  it('resets the preferences and notifies mounted feeds', () => {
    const onChange = vi.fn();
    window.addEventListener(AD_PREFS_CHANGED_EVENT, onChange);
    dismissAd('campaign-1');
    blockAdvertiser('advertiser-1');

    clearLocalAdPrefs();

    expect(loadAdPreferences()).toEqual({ hiddenAds: [], blockedAdvertisers: [] });
    expect(onChange).toHaveBeenCalledTimes(3);
    window.removeEventListener(AD_PREFS_CHANGED_EVENT, onChange);
  });
});
