/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NovaToggle } from './NovaToggle';

describe('NovaToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders toggle with role switch and unchecked state', () => {
    render(<NovaToggle label="Notifications" />);
    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('renders toggle with checked state', () => {
    render(<NovaToggle label="Enabled" checked />);
    const toggle = screen.getByRole('switch', { name: 'Enabled' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    const knob = toggle.querySelector('span > span');
    expect(knob).toHaveClass('translate-x-full');
  });

  it('calls onChange with toggled value on click', () => {
    const onChange = vi.fn();
    render(<NovaToggle label="Test" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles from checked to unchecked on click', () => {
    const onChange = vi.fn();
    render(<NovaToggle label="Test" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('is disabled properly', () => {
    render(<NovaToggle label="Disabled" disabled />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();
    expect(toggle.className).toContain('disabled:opacity-50');
  });

  it('applies custom className', () => {
    render(<NovaToggle label="Test" className="my-toggle" />);
    expect(screen.getByRole('switch')).toHaveClass('my-toggle');
  });

  it('does not render label when not provided', () => {
    render(<NovaToggle />);
    const toggle = screen.getByRole('switch');
    expect(toggle.querySelector('span')).toBeTruthy();
  });

  it('forwards ref to button element', () => {
    const ref = vi.fn();
    render(<NovaToggle ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });
});
