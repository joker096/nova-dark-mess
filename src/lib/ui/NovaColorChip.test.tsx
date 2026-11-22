/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NovaColorChip } from './NovaColorChip';

describe('NovaColorChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chip with gradient circle and label', () => {
    const { container } = render(
      <NovaColorChip gradient="from-[#1E3A8A] to-[#3B82F6]" label="Sapphire" onClick={vi.fn()}>
        Sapphire
      </NovaColorChip>,
    );
    const btn = container.firstChild as HTMLElement;
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain('Sapphire');
  });

  it('applies selected state styles', () => {
    render(<NovaColorChip selected label="Selected" onClick={vi.fn()}>Selected</NovaColorChip>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.className).toContain('bg-[var(--nova-accent-color,#ff4e18)]/10');
  });

  it('applies locked state with grey text', () => {
    const { container } = render(
      <NovaColorChip locked label="Locked" onClick={vi.fn()}>Locked</NovaColorChip>,
    );
    const btn = container.firstChild as HTMLElement;
    const labelSpan = btn.querySelector('span.text-\\[11px\\]');
    expect(labelSpan).toHaveClass('text-[var(--text-disabled)]');
  });

  it('applies disabled state', () => {
    render(<NovaColorChip disabled label="Disabled" onClick={vi.fn()}>Disabled</NovaColorChip>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('opacity-60');
    expect(btn.className).toContain('pointer-events-none');
  });

  it('calls onClick handler', () => {
    const onClick = vi.fn();
    render(<NovaColorChip onClick={onClick} label="Clickable">Clickable</NovaColorChip>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    render(<NovaColorChip className="my-chip" label="Custom">Custom</NovaColorChip>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('my-chip');
  });

  it('renders lock badge when locked', () => {
    const { container } = render(
      <NovaColorChip locked label="Premium" onClick={vi.fn()}>Premium</NovaColorChip>,
    );
    const btn = container.firstChild as HTMLElement;
    expect(btn.querySelector('span.text-\\[11px\\]')).toHaveClass('text-[var(--text-disabled)]');
  });

  it('forwards ref to button element', () => {
    const ref = vi.fn();
    render(<NovaColorChip ref={ref} label="Ref">Ref</NovaColorChip>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });
});
