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
    const avatar = screen.getByText('K').closest('div[style*="width: 120"]')!;
    expect(avatar).toHaveStyle({ width: '120px', height: '120px' });
  });

  it('applies sm size', () => {
    render(<NovaAvatar name="K" size="sm" />);
    const avatar = screen.getByText('K').closest('div[style*="width: 36"]')!;
    expect(avatar).toHaveStyle({ width: '36px', height: '36px' });
  });

  it('shows online status dot', () => {
    render(<NovaAvatar name="K" status="online" showStatus />);
    const statusDot = screen.getByLabelText('Status: online');
    expect(statusDot).toBeInTheDocument();
    expect(statusDot).toHaveStyle({ backgroundColor: 'var(--online)' });
  });

  it('shows away status dot', () => {
    render(<NovaAvatar name="K" status="away" showStatus />);
    const statusDot = screen.getByLabelText('Status: away');
    expect(statusDot).toBeInTheDocument();
    expect(statusDot).toHaveStyle({ backgroundColor: 'var(--text-secondary)' });
  });

  it('does not show status dot when showStatus is false', () => {
    render(<NovaAvatar name="K" status="online" />);
    expect(screen.queryByLabelText('Status: online')).toBeNull();
  });

  it('does not show offline status dot even when showStatus is true', () => {
    render(<NovaAvatar name="K" status="offline" showStatus />);
    expect(screen.queryByLabelText('Status: offline')).toBeNull();
  });

  it('applies custom className', () => {
    render(<NovaAvatar name="K" className="my-avatar" />);
    const avatar = screen.getByTestId('avatar-wrapper');
    expect(avatar).toHaveClass('my-avatar');
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
