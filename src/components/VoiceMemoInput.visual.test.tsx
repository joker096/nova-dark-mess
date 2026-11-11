/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceMemoInput } from './VoiceMemoInput';

describe('VoiceMemoInput visual snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});



