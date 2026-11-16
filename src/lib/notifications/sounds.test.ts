import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isVibrationEnabled, loadSoundId, playSound, saveSoundId, SOUND_IDS, SOUNDS, vibrate } from './sounds';

type OscSpec = { freq: number[]; gain: number[]; type: string };
const created: OscSpec[] = [];
let ctxInstances = 0;

class FakeGain {
  gain = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class FakeOsc {
  type = 'sine';
  frequency = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeCtx {
  destination = {};
  currentTime = 1;
  constructor() {
    ctxInstances += 1;
  }
  createOscillator() {
    const osc = new FakeOsc();
    const spec: OscSpec = { freq: [], gain: [], type: osc.type };
    created.push(spec);
    const origFreq = osc.frequency.setValueAtTime;
    osc.frequency.setValueAtTime = ((v: number) => {
      spec.freq.push(v);
      return origFreq(v);
    }) as typeof osc.frequency.setValueAtTime;
    return osc;
  }
  createGain() {
    return new FakeGain();
  }
  close = vi.fn(async () => undefined);
}

describe('notification sounds', () => {
  beforeEach(() => {
    created.length = 0;
    ctxInstances = 0;
    vi.stubGlobal('AudioContext', FakeCtx as unknown as typeof AudioContext);
    vi.stubGlobal('setTimeout', ((fn: () => void) => {
      fn();
      return 0;
    }) as unknown);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to the Nova tone and persists a choice', () => {
    expect(loadSoundId()).toBe('nova');
    saveSoundId('chirp');
    expect(loadSoundId()).toBe('chirp');
  });

  it('exposes four tones plus silent', () => {
    expect(SOUND_IDS).toEqual(['nova', 'pop', 'chime', 'chirp', 'silent']);
  });

  it('plays nothing for silent', () => {
    playSound('incoming', 'silent');
    expect(ctxInstances).toBe(0);
  });

  it('respects the notificationSound pref', () => {
    localStorage.setItem(
      'nova_messenger_settings',
      JSON.stringify({ notificationSound: false }),
    );
    playSound('incoming', 'nova');
    expect(ctxInstances).toBe(0);
  });

  it('only vibrates when the vibration pref is enabled', () => {
    const vibrateSpy = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate: vibrateSpy });

    expect(isVibrationEnabled()).toBe(false);
    vibrate();
    expect(vibrateSpy).not.toHaveBeenCalled();

    localStorage.setItem('nova_messenger_settings', JSON.stringify({ vibration: true }));
    expect(isVibrationEnabled()).toBe(true);
    vibrate();
    expect(vibrateSpy).toHaveBeenCalledWith(18);
  });

  it('incoming is louder than outgoing', () => {
    playSound('incoming', 'nova');
    playSound('outgoing', 'nova');
    const incomingPeak = Math.max(...created[0].gain.map(Number), 0.2);
    expect(incomingPeak).toBeGreaterThan(0);
    // outgoing spec gain (0.08) < incoming spec gain (0.14)
    expect(SOUNDS.nova.tones.outgoing[0].gain).toBeLessThan(SOUNDS.nova.tones.incoming[0].gain);
  });

  it('creates oscillators for each tone in the spec', () => {
    playSound('notification', 'chime');
    expect(created.length).toBe(SOUNDS.chime.tones.notification.length);
    expect(ctxInstances).toBe(1);
  });
});
