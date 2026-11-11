/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NovaSelectableButton } from './NovaSelectableButton';

describe('NovaSelectableButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders button with label and icon', () => {
    const onClick = vi.fn();
    render(
      <NovaSelectableButton onClick={onClick} icon={<span>I</span>} label="Test">
        Test
      </NovaSelectableButton>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Test');
  });

  it('applies selected state styles', () => {
    render(<NovaSelectableButton selected label="Selected">Selected</NovaSelectableButton>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.className).toContain('bg-[var(--nova-accent-color,#ff4e18)]/10');
  });

  it('applies unselected state styles', () => {
    render(<NovaSelectableButton label="Unselected">Unselected</NovaSelectableButton>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn.className).toContain('bg-white/[0.03]');
    expect(btn.className).toContain('text-white/60');
  });

  it('applies disabled state', () => {
    render(<NovaSelectableButton disabled label="Disabled">Disabled</NovaSelectableButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('opacity-60');
    expect(btn.className).toContain('pointer-events-none');
  });

  it('calls onClick handler', () => {
    const onClick = vi.fn();
    render(<NovaSelectableButton onClick={onClick} label="Clickable">Clickable</NovaSelectableButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    render(<NovaSelectableButton className="my-selectable" label="Custom">Custom</NovaSelectableButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('my-selectable');
  });

  it('forwards ref to button element', () => {
    const ref = vi.fn();
    render(<NovaSelectableButton ref={ref} label="Ref">Ref</NovaSelectableButton>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it('renders children instead of label when provided', () => {
    render(<NovaSelectableButton>Custom Children</NovaSelectableButton>);
    expect(screen.getByText('Custom Children')).toBeInTheDocument();
  });
});
