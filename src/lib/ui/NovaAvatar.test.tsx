/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NovaAvatar } from './NovaAvatar';

describe('NovaAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders image avatar when src provided', () => {
    render(<NovaAvatar src="https://example.com/avatar.jpg" name="Katie" />);
    const img = screen.getByAltText('Katie');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('renders fallback initials when no src', () => {
    render(<NovaAvatar name="Katie Rogers" />);
    expect(screen.getByText('KR')).toBeInTheDocument();
  });

  it('renders question mark when no name and no src', () => {
    render(<NovaAvatar />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('applies size classes', () => {
    render(<NovaAvatar name="K" size="xl" />);
    const avatar = screen.getByText('K').closest('div')!;
    expect(avatar.className).toContain('w-12 h-12');
  });

  it('applies sm size', () => {
    render(<NovaAvatar name="K" size="sm" />);
    const avatar = screen.getByText('K').closest('div')!;
    expect(avatar.className).toContain('w-6 h-6');
  });

  it('shows online status dot', () => {
    render(<NovaAvatar name="K" status="online" showStatus />);
    const statusDot = screen.getByLabelText('online');
    expect(statusDot).toBeInTheDocument();
    expect(statusDot.className).toContain('bg-emerald-400');
  });

  it('shows away status dot', () => {
    render(<NovaAvatar name="K" status="away" showStatus />);
    const statusDot = screen.getByLabelText('away');
    expect(statusDot.className).toContain('bg-[#f59e0b]');
  });

  it('does not show status dot when showStatus is false', () => {
    render(<NovaAvatar name="K" status="online" />);
    expect(screen.queryByLabelText('online')).toBeNull();
  });

  it('does not show offline status dot even when showStatus is true', () => {
    render(<NovaAvatar name="K" status="offline" showStatus />);
    expect(screen.queryByLabelText('offline')).toBeNull();
  });

  it('applies custom className', () => {
    render(<NovaAvatar name="K" className="my-avatar" />);
    const avatar = screen.getByText('K').closest('div')!;
    expect(avatar.className).toContain('my-avatar');
  });

  it('forwards ref to wrapper div element', () => {
    const ref = vi.fn();
    render(<NovaAvatar ref={ref} src="https://example.com/a.jpg" name="K" />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  it('generates single initial for single-word name', () => {
    render(<NovaAvatar name="Katie" />);
    expect(screen.getByText('K')).toBeInTheDocument();
  });
});
