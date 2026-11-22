/// <reference types="vitest/globals" />

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NovaButton } from './NovaButton';

describe('NovaButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders button with default ghost variant and md size', () => {
    render(<NovaButton onClick={vi.fn()}>Click me</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Click me');
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn.className).toContain('w-10 h-10');
    expect(btn.className).toContain('bg-white/5');
    expect(btn.className).toContain('text-white/70');
  });

  it('applies accent variant styles', () => {
    render(<NovaButton variant="accent" onClick={vi.fn()}>Accent</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-[var(--nova-accent-color,#ff4e18)]');
    expect(btn.className).toContain('text-[#ffffff]');
  });

  it('applies accent-ghost variant styles', () => {
    render(<NovaButton variant="accent-ghost" onClick={vi.fn()}>GhostAccent</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-[var(--nova-accent-color,#ff4e18)]/20');
    expect(btn.className).toContain('text-[var(--nova-accent-color,#ff4e18)]');
  });

  it('applies danger variant styles', () => {
    render(<NovaButton variant="danger" onClick={vi.fn()}>Danger</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-red-500/20');
    expect(btn.className).toContain('text-red-400');
  });

  it('applies sm size', () => {
    render(<NovaButton size="sm" onClick={vi.fn()}>Small</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('w-10 h-10');
    expect(btn.className).toContain('min-w-[44px]');
  });

  it('applies md size', () => {
    render(<NovaButton size="md" onClick={vi.fn()}>Medium</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('w-10 h-10');
    expect(btn.className).toContain('px-4 py-2');
  });

  it('applies lg size', () => {
    render(<NovaButton size="lg" onClick={vi.fn()}>Large</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('w-12 h-12');
    expect(btn.className).toContain('min-w-[52px]');
  });

  it('calls onClick handler once (no double-submit)', () => {
    const onClick = vi.fn();
    render(<NovaButton onClick={onClick}>Click me</NovaButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('blocks clicks while loading', () => {
    const onClick = vi.fn();
    render(<NovaButton loading onClick={onClick}>Loading</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders badge when provided', () => {
    render(<NovaButton onClick={vi.fn()} badge="3">With badge</NovaButton>);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<NovaButton className="my-custom-class" onClick={vi.fn()}>Custom</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('my-custom-class');
  });

  it('sets title attribute', () => {
    render(<NovaButton title="My button title" onClick={vi.fn()}>Titled</NovaButton>);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'My button title');
  });

  it('is disabled properly', () => {
    render(<NovaButton disabled onClick={vi.fn()}>Disabled</NovaButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('disabled:opacity-50');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });
});
