/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VoiceMemoInput } from './VoiceMemoInput';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));
vi.mock('./AudioWaveformPlayer', () => ({
  AudioWaveformPlayer: () => null,
}));

class TestMediaRecorder {
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  private listeners = new Map<string, Set<EventListener>>();

  start() {
    this.state = 'recording';
    this.emitChunk();
  }

  stop() {
    this.emitChunk();
    this.state = 'inactive';
    this.emit('stop');
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  private emitChunk() {
    this.ondataavailable?.({ data: new Blob(['voice audio']) } as BlobEvent);
  }

  private emit(type: string) {
    const event = new Event(type);
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

describe('VoiceMemoInput visual snapshot', () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
    if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders idle mic button with dark bg and accent mic', () => {
    render(<VoiceMemoInput onSendVoiceMemo={vi.fn()} />);
    const btn = screen.getByTitle('Tap to record or hold for push-to-talk voice memo');
    expect(btn.className).toContain('w-11 h-11 rounded-full');
    expect(btn.className).toContain('bg-[#181920]/95');
    expect(btn.className).toContain('border-white/10');
    expect(btn.className).toContain('hover:bg-[var(--nova-accent-color)]');
    const mic = btn.querySelector('svg')!;
    const micClass = mic.getAttribute('class') ?? '';
    expect(micClass).toContain('text-[var(--nova-accent-color)]');
  });

  it('renders disabled mic button when disabled prop set', () => {
    render(<VoiceMemoInput onSendVoiceMemo={vi.fn()} disabled />);
    const btn = screen.getByTitle('Tap to record or hold for push-to-talk voice memo');
    expect(btn).toBeDisabled();
  });

  it('does not send a simulated voice note when microphone access is denied', async () => {
    const onSendVoiceMemo = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('permission denied')) },
    });
    vi.stubGlobal('MediaRecorder', TestMediaRecorder);

    render(<VoiceMemoInput onSendVoiceMemo={onSendVoiceMemo} />);
    const mic = screen.getByTitle('Tap to record or hold for push-to-talk voice memo');
    fireEvent.pointerDown(mic, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerUp(mic, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });

    expect(await screen.findByRole('alert')).toHaveTextContent('voiceMemo.microphoneUnavailable');
    expect(screen.queryByTitle('Stop and preview voice waveform')).toBeNull();
    expect(onSendVoiceMemo).not.toHaveBeenCalled();
  });

  it('records, previews, and sends captured audio from the primary voice button', async () => {
    const onSendVoiceMemo = vi.fn();
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
    });
    vi.stubGlobal('MediaRecorder', TestMediaRecorder);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:voice-test'),
    });

    render(<VoiceMemoInput onSendVoiceMemo={onSendVoiceMemo} />);
    const mic = screen.getByTitle('Tap to record or hold for push-to-talk voice memo');
    fireEvent.pointerDown(mic, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerUp(mic, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });

    await waitFor(() => expect(screen.getByTitle('Stop and preview voice waveform')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Stop and preview voice waveform'));

    const sendButton = await screen.findByTitle('Send voice note (right click to schedule)');
    expect(sendButton.className).toContain('hover:brightness-110');
    expect(sendButton.className).not.toContain('ff5d2b');
    fireEvent.click(sendButton);

    await waitFor(() =>
      expect(onSendVoiceMemo).toHaveBeenCalledWith(
        expect.objectContaining({
          audioUrl: 'blob:voice-test',
          durationSeconds: 1,
          waveform: expect.any(Array),
        }),
      ),
    );
    expect(track.stop).toHaveBeenCalled();
  });
});



