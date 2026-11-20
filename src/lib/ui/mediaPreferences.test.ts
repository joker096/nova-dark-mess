import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MEDIA_PREFERENCES,
  MEDIA_PREFERENCES_EVENT,
  MEDIA_PREFERENCES_KEY,
  loadMediaPreferences,
  normalizeMediaPreferences,
  resolveStickerSize,
  saveMediaPreferences,
} from './mediaPreferences';

describe('mediaPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadMediaPreferences()).toEqual(DEFAULT_MEDIA_PREFERENCES);
  });

  it('falls back to defaults for corrupted storage', () => {
    localStorage.setItem(MEDIA_PREFERENCES_KEY, '{not json');
    expect(loadMediaPreferences()).toEqual(DEFAULT_MEDIA_PREFERENCES);
  });

  it('normalizes unknown values', () => {
    expect(
      normalizeMediaPreferences({
        stickerSize: 'huge',
        stickerPickerDensity: 'wide',
        voiceSendMode: 'telepathy',
        stickerInsertInsteadOfSend: 'yes',
      }),
    ).toEqual(DEFAULT_MEDIA_PREFERENCES);
  });

  it('persists and reloads preferences', () => {
    saveMediaPreferences({
      stickerSize: 'lg',
      stickerPickerDensity: 'compact',
      voiceSendMode: 'hold',
      stickerInsertInsteadOfSend: true,
    });

    expect(loadMediaPreferences()).toEqual({
      stickerSize: 'lg',
      stickerPickerDensity: 'compact',
      voiceSendMode: 'hold',
      stickerInsertInsteadOfSend: true,
    });
  });

  it('emits a change event so other screens can react', () => {
    const listener = vi.fn();
    window.addEventListener(MEDIA_PREFERENCES_EVENT, listener);
    saveMediaPreferences({ ...DEFAULT_MEDIA_PREFERENCES, stickerSize: 'sm' });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(MEDIA_PREFERENCES_EVENT, listener);
  });

  it('resolves sticker sizes to pixels', () => {
    expect(resolveStickerSize('sm')).toBe(80);
    expect(resolveStickerSize('md')).toBe(112);
    expect(resolveStickerSize('lg')).toBe(160);
  });
});
