/**
 * Notification & message sounds — synthesized with the Web Audio API.
 *
 * No audio files ship with the app: every tone is generated on-device from
 * short oscillator envelopes. That keeps the bundle binary-free, works fully
 * offline (local-first constraint) and leaks nothing to the network.
 *
 * Tone design follows the messaging apps users already know:
 * - Telegram: "Pop In" (incoming) is a short, soft, slightly rising pop;
 *   "Pop Out" (sent) is a shorter, quieter tick.
 * - WhatsApp: the classic triad "Note" chime for notifications.
 * - Signal: a two-note ascending chirp.
 */

export type SoundId = 'nova' | 'pop' | 'chime' | 'chirp' | 'silent';
export type SoundKind = 'incoming' | 'outgoing' | 'notification';

export interface ToneSpec {
  /** Relative start time of the tone, seconds from sound start. */
  readonly at: number;
  /** Fundamental frequency, Hz. */
  readonly freq: number;
  /** Tone length, seconds. */
  readonly dur: number;
  /** Peak gain, 0..1 (kept low: notifications should not shout). */
  readonly gain: number;
  readonly type?: OscillatorType;
  /** Optional ending frequency for a glide (chirp). */
  readonly glideTo?: number;
}

export interface SoundSpec {
  readonly id: SoundId;
  readonly label: string;
  readonly tones: Readonly<Record<SoundKind, readonly ToneSpec[]>>;
}

const INCOMING_KINDS: SoundKind[] = ['incoming', 'notification'];

/** Telegram-style short soft pop; slightly higher & sweeter when incoming. */
const popTones = (kind: SoundKind): readonly ToneSpec[] => {
  const base = INCOMING_KINDS.includes(kind) ? 880 : 740;
  return [
    { at: 0, freq: base, dur: 0.07, gain: kind === 'outgoing' ? 0.1 : 0.16, type: 'sine' },
    { at: 0.06, freq: base * 1.34, dur: 0.1, gain: kind === 'outgoing' ? 0.08 : 0.13, type: 'sine' },
  ];
};

export const SOUNDS: Readonly<Record<Exclude<SoundId, 'silent'>, SoundSpec>> = {
  nova: {
    id: 'nova',
    label: 'Nova',
    tones: {
      incoming: [
        { at: 0, freq: 587.33, dur: 0.1, gain: 0.14, type: 'sine' },
        { at: 0.09, freq: 880, dur: 0.16, gain: 0.12, type: 'sine' },
      ],
      outgoing: [{ at: 0, freq: 660, dur: 0.07, gain: 0.08, type: 'sine' }],
      notification: [
        { at: 0, freq: 587.33, dur: 0.12, gain: 0.14, type: 'sine' },
        { at: 0.11, freq: 880, dur: 0.12, gain: 0.12, type: 'sine' },
        { at: 0.22, freq: 1174.66, dur: 0.18, gain: 0.1, type: 'sine' },
      ],
    },
  },
  pop: {
    id: 'pop',
    label: 'Pop',
    tones: {
      incoming: popTones('incoming'),
      outgoing: popTones('outgoing'),
      notification: [
        { at: 0, freq: 740, dur: 0.08, gain: 0.15, type: 'sine' },
        { at: 0.07, freq: 987.77, dur: 0.12, gain: 0.13, type: 'sine' },
      ],
    },
  },
  chime: {
    id: 'chime',
    label: 'Chime',
    tones: {
      incoming: [
        { at: 0, freq: 523.25, dur: 0.14, gain: 0.13, type: 'triangle' },
        { at: 0.12, freq: 659.25, dur: 0.2, gain: 0.11, type: 'triangle' },
      ],
      outgoing: [{ at: 0, freq: 523.25, dur: 0.08, gain: 0.07, type: 'triangle' }],
      notification: [
        { at: 0, freq: 523.25, dur: 0.16, gain: 0.13, type: 'triangle' },
        { at: 0.14, freq: 659.25, dur: 0.16, gain: 0.11, type: 'triangle' },
        { at: 0.28, freq: 783.99, dur: 0.24, gain: 0.1, type: 'triangle' },
      ],
    },
  },
  chirp: {
    id: 'chirp',
    label: 'Chirp',
    tones: {
      incoming: [
        { at: 0, freq: 620, glideTo: 990, dur: 0.16, gain: 0.13, type: 'sine' },
      ],
      outgoing: [
        { at: 0, freq: 560, glideTo: 760, dur: 0.09, gain: 0.08, type: 'sine' },
      ],
      notification: [
        { at: 0, freq: 620, glideTo: 990, dur: 0.14, gain: 0.13, type: 'sine' },
        { at: 0.18, freq: 740, glideTo: 1180, dur: 0.18, gain: 0.11, type: 'sine' },
      ],
    },
  },
};

export const SOUND_IDS: readonly SoundId[] = ['nova', 'pop', 'chime', 'chirp', 'silent'];

const STORAGE_KEY = 'nova_notification_sound';

export function loadSoundId(): SoundId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (SOUND_IDS as readonly string[]).includes(raw)) return raw as SoundId;
  } catch {
    void 0;
  }
  return 'nova';
}

export function saveSoundId(id: SoundId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    void 0;
  }
}

export function isSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem('nova_messenger_settings');
    if (!raw) return true;
    const parsed = JSON.parse(raw) as Partial<{ notificationSound: boolean }>;
    return parsed.notificationSound !== false;
  } catch {
    return true;
  }
}

/**
 * Play one of the built-in notification sounds. Safe to call anywhere:
 * browsers may reject AudioContext before a user gesture — that is swallowed.
 */
export function playSound(kind: SoundKind, id: SoundId = loadSoundId()): void {
  if (id === 'silent') return;
  if (!isSoundEnabled()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const t0 = ctx.currentTime + 0.01;
    let last = t0;
    for (const tone of SOUNDS[id].tones[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.setValueAtTime(tone.freq, t0 + tone.at);
      if (tone.glideTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(tone.glideTo, t0 + tone.at + tone.dur);
      }
      gain.gain.setValueAtTime(0.0001, t0 + tone.at);
      gain.gain.exponentialRampToValueAtTime(tone.gain, t0 + tone.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + tone.at);
      osc.stop(t0 + tone.at + tone.dur + 0.02);
      last = Math.max(last, t0 + tone.at + tone.dur + 0.02);
    }
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, Math.max(0, (last - t0) * 1000 + 60));
  } catch {
    // AudioContext unavailable (autoplay policy, old webview) — stay silent.
  }
}

/** Haptic buzz for incoming notifications, honoring the vibration pref. */
export function vibrate(enabled: boolean): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(18);
  } catch {
    void 0;
  }
}
