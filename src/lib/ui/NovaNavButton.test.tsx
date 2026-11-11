/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NovaNavButton } from './NovaNavButton';

describe('NovaNavButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nav button with icon and label', () => {
    render(
      <NovaNavButton active={false} icon={<span className="w-5 h-5">I</span>} label="Chats" onClick={vi.fn()}>
        Chats
      </NovaNavButton>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Chats');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies active state styles', () => {
    render(<NovaNavButton active label="Active">Active</NovaNavButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-[var(--nova-accent-color,#ff4e18)]');
    expect(btn.className).toContain('font-bold');
  });

  it('applies inactive state styles', () => {
    render(<NovaNavButton label="Inactive">Inactive</NovaNavButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-white/50');
    expect(btn.className).toContain('hover:text-white');
  });

  it('calls onClick handler', () => {
    const onClick = vi.fn();
    render(<NovaNavButton onClick={onClick} label="Clickable">Clickable</NovaNavButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    render(<NovaNavButton className="my-nav-btn" label="Custom">Custom</NovaNavButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('my-nav-btn');
  });

  it('forwards ref to button element', () => {
    const ref = vi.fn();
    render(<NovaNavButton ref={ref} label="Ref">Ref</NovaNavButton>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it('renders children instead of label when provided', () => {
    render(<NovaNavButton>Custom Children</NovaNavButton>);
    expect(screen.getByText('Custom Children')).toBeInTheDocument();
  });
});
