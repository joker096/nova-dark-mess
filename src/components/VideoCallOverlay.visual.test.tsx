/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VideoCallOverlay } from './VideoCallOverlay';

const onEndCall = vi.fn();

function findAncestor(el: Element | null, tokens: string[]): HTMLElement | null {
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    if (node.classList && tokens.every((t) => node.classList.contains(t))) {
      return node as HTMLElement;
    }
    node = node.parentElement;
  }
  return null;
}

function dotWithColor(row: Element, color: string): HTMLElement | null {
  return (
    Array.from(row.querySelectorAll('span')).find((s) => s.classList.contains(color)) ?? null
  );
}

describe('VideoCallOverlay visual snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onEndCall.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when isOpen false', () => {
    const { container } = render(<VideoCallOverlay isOpen={false} onEndCall={onEndCall} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders minimized PiP tile with accent border and shadow', () => {
    render(
      <VideoCallOverlay
        isOpen
        isMinimized
        onEndCall={onEndCall}
        onMaximize={vi.fn()}
        contactName="Katie Rogers"
        contactAvatar="https://example.com/a.jpg"
      />,
    );
    const img = screen.getByAltText('Katie Rogers');
    const pip = findAncestor(img, ['w-36', 'h-52']);
    expect(pip).toBeTruthy();
    expect(pip!.className).toContain('bg-[#12131c]');
    expect(pip!.className).toContain('border-[var(--nova-accent-color)]');
    expect(pip!.className).toContain('shadow-2xl');
    expect(pip!.className).toContain('rounded-2xl');
    expect(screen.getByText('HD 1080p')).toBeInTheDocument();
    expect(screen.getByTitle('End call')).toBeInTheDocument();
    expect(screen.getByTitle('Expand to full screen')).toBeInTheDocument();
  });

  it('renders full-screen overlay with dark bg and animate-in', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    const img = screen.getByAltText('Katie Rogers');
    const overlay = findAncestor(img, ['bg-[#08090d]']);
    expect(overlay).toBeTruthy();
    expect(overlay!.className).toContain('animate-in');
    expect(overlay!.className).toContain('fade-in');
    expect(screen.getByText('Katie Rogers')).toBeInTheDocument();
  });

  it('renders connecting state with amber ping dot', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    const text = screen.getByText('Connecting...');
    expect(text).toBeTruthy();
    const row = text.parentElement!;
    const dot = dotWithColor(row, 'bg-amber-400')!;
    expect(dot.className).toContain('animate-ping');
  });

  it('transitions to connected state with green pulse after timer', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByText('Connected • HD Audio & Video')).toBeTruthy();
    const time = screen.getByText(/^\d{2}:\d{2}$/);
    const row = time.parentElement!;
    const dot = dotWithColor(row, 'bg-emerald-400')!;
    expect(dot.className).toContain('animate-pulse');
  });

  it('renders top bar controls: minimize, encryption badge, quality badge', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} onMinimize={vi.fn()} contactName="Katie Rogers" />);
    expect(screen.getByTitle('Minimize to Picture-in-Picture')).toBeTruthy();
    expect(screen.getByText('End-to-end Encrypted')).toBeTruthy();
    expect(screen.getByText('1080p 60fps')).toBeTruthy();
  });

  it('renders self view PIP with camera on and viewfinder brackets', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    const selfView = screen.getByTestId('self-view');
    expect(selfView.getAttribute('aria-label')).toBe('Your camera preview');
    expect(selfView.className).toContain('rounded-2xl');
    expect(selfView.className).toContain('border-2');
    expect(screen.getByText('Front')).toBeTruthy();
    expect(screen.getByTitle('Flip camera')).toBeTruthy();
  });

  it('renders camera off state with VideoOff icon', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    const camBtn = screen.getByTitle('Turn camera off');
    fireEvent.click(camBtn);
    expect(screen.getByText('Camera Off')).toBeTruthy();
  });

  it('renders filter notification pill when filter active', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    const filterBtn = screen.getByTitle('Video Filter (Current: none)');
    fireEvent.click(filterBtn);
    const pill = screen.getByText('Filter: STUDIO').closest('div')!;
    expect(pill.className).toContain('border-[var(--nova-accent-color)]/40');
    expect(pill.className).toContain('text-[var(--nova-accent-color)]');
  });

  it('renders bottom dock with camera, mic, flip, speaker, filter, end call', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    const endBtn = screen.getByTitle('End Video Call');
    const dock = findAncestor(endBtn, ['bg-[#12131c]/90', 'rounded-full']);
    expect(dock).toBeTruthy();
    expect(dock!.className).toContain('shadow-2xl');
    expect(screen.getByTitle('Turn camera off')).toBeTruthy();
    expect(screen.getByTitle('Mute microphone')).toBeTruthy();
    expect(screen.getByTitle('Switch front / rear camera')).toBeTruthy();
    expect(screen.getByTitle('Mute speaker')).toBeTruthy();
    expect(endBtn.className).toContain('from-red-600');
    expect(endBtn.className).toContain('to-rose-500');
  });

  it('toggles mic to off state with red bg', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    const micBtn = screen.getByTitle('Mute microphone');
    fireEvent.click(micBtn);
    expect(micBtn.className).toContain('bg-red-500/25');
    expect(micBtn.className).toContain('text-red-400');
  });

  it('disables flip camera when camera off', () => {
    render(<VideoCallOverlay isOpen onEndCall={onEndCall} contactName="Katie Rogers" />);
    const camBtn = screen.getByTitle('Turn camera off');
    fireEvent.click(camBtn);
    const flipBtn = screen.getByTitle('Switch front / rear camera');
    expect(flipBtn).toBeDisabled();
    expect(flipBtn.className).toContain('cursor-not-allowed');
  });
});



