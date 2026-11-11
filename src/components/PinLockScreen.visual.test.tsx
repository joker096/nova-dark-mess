/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PinLockScreen } from './PinLockScreen';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));
vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => ({
    verifyPin: vi.fn(async () => true),
    setPin: vi.fn(async () => {}),
    pinHash: null as string | null,
  }),
}));

function findByClass(root: Element | Document, substring: string): HTMLElement | null {
  const nodes = root.querySelectorAll('*');
  for (const node of nodes) {
    if (node.className && typeof node.className === 'string' && node.className.includes(substring)) {
      return node as HTMLElement;
    }
  }
  return null;
}

describe('PinLockScreen visual snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders lock screen container with dark bg, blur and center layout', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const heading = screen.getByText('settings.passcodeLock');
    const container = heading.closest('div.fixed')!;
    expect(container.className).toContain('bg-[#0b0c10]');
    expect(container.className).toContain('backdrop-blur-sm');
    expect(container.className).toContain('flex flex-col items-center justify-center');
  });

  it('renders lock icon chip with accent color', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const chip = findByClass(document, 'bg-[var(--nova-accent-color)]/10')!;
    expect(chip.className).toContain('border-[var(--nova-accent-color)]/30');
    expect(chip.className).toContain('w-12 h-12 rounded-full');
    expect(chip.querySelector('svg')).toBeTruthy();
  });

  it('renders heading with passcode lock state', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    expect(screen.getByText('settings.passcodeLock')).toBeTruthy();
  });

  it('renders six PIN dots, empty by default', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const row = findByClass(document, 'gap-2 mb-8')!;
    const dots = Array.from(row.children).filter((c) => c instanceof HTMLElement) as HTMLElement[];
    expect(dots).toHaveLength(6);
    dots.forEach((dot) => {
      expect(dot.className).toContain('bg-white/5');
      expect(dot.className).toContain('border-white/10');
    });
  });

  it('fills dots when PIN entered', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const row = findByClass(document, 'grid-cols-3')!;
    const digit1 = within(row).getByText('1');
    fireEvent.click(digit1);
    const dotsRow = findByClass(document, 'gap-2 mb-8')!;
    const dots = Array.from(dotsRow.children).filter((c) => c instanceof HTMLElement) as HTMLElement[];
    expect(dots[0].className).toContain('bg-[var(--nova-accent-color)]');
    expect(dots[0].className).not.toContain('bg-white/5');
    expect(dots[1].className).toContain('bg-white/5');
  });

  it('renders numpad grid with 3 columns and digit buttons', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const row = findByClass(document, 'grid-cols-3')!;
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(2);
    const backspace = screen.getByRole('button', { name: 'common.backspace' });
    expect(backspace).toBeInTheDocument();
  });

  it('renders cancel button when isSetting', () => {
    render(<PinLockScreen onUnlock={vi.fn()} onSetPin={vi.fn()} />);
    const cancel = screen.getByRole('button', { name: 'common.cancel' });
    expect(cancel).toBeInTheDocument();
    expect(cancel.className).toContain('bg-[var(--nova-accent-color)]/10');
    expect(cancel.className).toContain('text-[var(--nova-accent-color)]');
  });
});
