/**
 * Local, per-device media comfort settings:
 * sticker size/density in the picker & bubbles, and one-handed voice sending.
 *
 * Everything is stored in localStorage so it works offline and does not need
 * to be synced through the messaging backend.
 */

export type StickerSize = 'sm' | 'md' | 'lg';
export type StickerPickerDensity = 'compact' | 'comfortable';
export type VoiceSendMode = 'lock' | 'hold';

export interface MediaPreferences {
  /** Sticker size in chat bubbles and channel posts. */
  stickerSize: StickerSize;
  /** Sticker tiles per row in the picker. */
  stickerPickerDensity: StickerPickerDensity;
  /** 'lock' = slide up to record hands-free, 'hold' = classic release-to-send. */
  voiceSendMode: VoiceSendMode;
  /** Only insert a sticker into the text field instead of sending it right away. */
  stickerInsertInsteadOfSend: boolean;
}

export const MEDIA_PREFERENCES_KEY = 'nova_media_preferences';
export const MEDIA_PREFERENCES_EVENT = 'nova:media-preferences';

export const DEFAULT_MEDIA_PREFERENCES: MediaPreferences = {
  stickerSize: 'md',
  stickerPickerDensity: 'comfortable',
  voiceSendMode: 'lock',
  stickerInsertInsteadOfSend: false,
};

export const STICKER_SIZE_OPTIONS: { value: StickerSize; label: string; px: number }[] = [
  { value: 'sm', label: 'S', px: 80 },
  { value: 'md', label: 'M', px: 112 },
  { value: 'lg', label: 'L', px: 160 },
];

export function normalizeMediaPreferences(input: unknown): MediaPreferences {
  const record =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  const stickerSize: StickerSize =
    record.stickerSize === 'sm' || record.stickerSize === 'lg' ? record.stickerSize : 'md';
  const stickerPickerDensity: StickerPickerDensity =
    record.stickerPickerDensity === 'compact' ? 'compact' : 'comfortable';
  const voiceSendMode: VoiceSendMode = record.voiceSendMode === 'hold' ? 'hold' : 'lock';

  return {
    stickerSize,
    stickerPickerDensity,
    voiceSendMode,
    stickerInsertInsteadOfSend: record.stickerInsertInsteadOfSend === true,
  };
}

export function loadMediaPreferences(): MediaPreferences {
  try {
    const raw = localStorage.getItem(MEDIA_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_MEDIA_PREFERENCES };
    return normalizeMediaPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MEDIA_PREFERENCES };
  }
}

export function saveMediaPreferences(prefs: MediaPreferences): MediaPreferences {
  const normalized = normalizeMediaPreferences(prefs);
  try {
    localStorage.setItem(MEDIA_PREFERENCES_KEY, JSON.stringify(normalized));
  } catch {
    /* storage full or disabled — keep the in-memory value */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<MediaPreferences>(MEDIA_PREFERENCES_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function resolveStickerSize(size: StickerSize = DEFAULT_MEDIA_PREFERENCES.stickerSize): number {
  return STICKER_SIZE_OPTIONS.find((option) => option.value === size)?.px ?? 112;
}
