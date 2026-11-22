/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { NovaCard } from './NovaCard';

describe('NovaCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders card with default variant and md padding', () => {
    const { container } = render(<NovaCard>Content</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('rounded-2xl');
    expect(card.className).toContain('bg-[var(--bg-surface)]');
    expect(card.className).toContain('border-[var(--border)]');
    expect(card.className).toContain('p-5');
  });

  it('applies elevated variant', () => {
    const { container } = render(<NovaCard variant="elevated">Elevated</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('shadow-[var(--shadow-2)]');
  });

  it('applies outline variant', () => {
    const { container } = render(<NovaCard variant="outline">Outline</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('bg-transparent');
    expect(card.className).toContain('border-[var(--border-strong)]');
  });

  it('applies accent variant', () => {
    const { container } = render(<NovaCard variant="accent">Accent</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('bg-[var(--accent-soft)]');
    expect(card.className).toContain('border-[var(--accent)]');
  });

  it('applies sm padding', () => {
    const { container } = render(<NovaCard padding="sm">Small</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('p-3');
    expect(card.className).not.toContain('p-5');
  });

  it('applies lg padding', () => {
    const { container } = render(<NovaCard padding="lg">Large</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('p-6');
  });

  it('applies none padding', () => {
    const { container } = render(<NovaCard padding="none">None</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toMatch(/\bp-\d/);
  });

  it('applies hover effect when enabled', () => {
    const { container } = render(<NovaCard hover>Hoverable</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('hover:bg-[var(--bg-hover)]');
    expect(card.className).toContain('hover:border-[var(--border-strong)]');
  });

  it('applies custom className', () => {
    const { container } = render(<NovaCard className="my-card">Custom</NovaCard>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('my-card');
  });

  it('forwards ref to div element', () => {
    const ref = vi.fn();
    render(<NovaCard ref={ref}>Ref test</NovaCard>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });
});
