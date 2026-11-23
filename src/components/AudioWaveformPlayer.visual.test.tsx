/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';

const voiceNote = {
  id: 'vn-1',
  durationSeconds: 10,
  duration: '0:10',
  waveform: [20, 35, 50, 70, 90, 60, 40, 65, 80, 95, 60, 45, 30, 50, 75, 85, 60, 40, 25, 35],
};

function barColor(wrapper: HTMLElement, index: number): string | null {
  const bar = wrapper.querySelectorAll('[role="button"]')[index];
  return bar ? (bar.querySelector('div') as HTMLElement)?.style.backgroundColor ?? null : null;
}

describe('AudioWaveformPlayer visual snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders flex row with gap and select-none', () => {
    const { container } = render(<AudioWaveformPlayer voiceNote={voiceNote} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('items-center');
    expect(wrapper.className).toContain('gap-2.5');
    expect(wrapper.className).toContain('select-none');
  });

  it('renders circular play/pause button with accent bg', () => {
    const { container } = render(<AudioWaveformPlayer voiceNote={voiceNote} />);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('w-9 h-9 rounded-full');
    expect(btn.className).toContain('bg-[var(--nova-accent-color)]');
    expect(btn.className).toContain('text-white');
    expect(btn).toHaveAttribute('aria-label', 'Play voice message');
  });

  it('renders pause icon when playing', () => {
    const { container } = render(<AudioWaveformPlayer voiceNote={voiceNote} autoPlayOnMount />);
    const btn = container.querySelector('button')!;
    expect(btn.getAttribute('aria-label')).toBe('Pause voice message');
  });

  it('renders isMe variant with accent shadow', () => {
    const { container } = render(<AudioWaveformPlayer voiceNote={voiceNote} isMe />);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('shadow-[var(--nova-accent-color)]/25');
  });

  it('renders 20 waveform bars', () => {
    const { container } = render(<AudioWaveformPlayer voiceNote={voiceNote} />);
    const bars = container.querySelectorAll('[role="button"]');
    expect(bars).toHaveLength(20);
  });

  it('applies default bar color to not-played bars', () => {
    const { container } = render(<AudioWaveformPlayer voiceNote={voiceNote} />);
    // last bar is not played (activeBarIndex === 0 initially)
    expect(barColor(container, 19)).toBe('rgb(43, 45, 56)');
  });

  it('applies isMe bars in white/22 when not played', () => {
    const { container } = render(<AudioWaveformPlayer voiceNote={voiceNote} isMe />);
    expect(barColor(container, 19)).toBe('rgba(255, 255, 255, 0.22)');
  });

  it('renders time labels as mono text', () => {
    render(<AudioWaveformPlayer voiceNote={voiceNote} />);
    // без проигрывания оба показателя показывают длительность
    expect(screen.getAllByText('0:10')).toHaveLength(2);
    const timeRow = document.querySelector('.font-mono')!;
    expect(timeRow.className).toContain('text-white/50');
  });

  it('renders speed multiplier pill', () => {
    render(<AudioWaveformPlayer voiceNote={voiceNote} showSpeedButton />);
    const pill = screen.getByText('1x').closest('button')!;
    expect(pill.className).toContain('bg-white/10');
    expect(pill.className).toContain('rounded-full');
  });

  it('hides speed pill when showSpeedButton false', () => {
    render(<AudioWaveformPlayer voiceNote={voiceNote} showSpeedButton={false} />);
    expect(screen.queryByText('1x')).toBeNull();
  });

  it('applies compact variant py-0.5', () => {
    const { container } = render(<AudioWaveformPlayer voiceNote={voiceNote} compact />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('py-0.5');
    expect(wrapper.className).not.toContain('py-1');
  });
});
