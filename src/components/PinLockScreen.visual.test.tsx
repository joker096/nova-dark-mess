/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { PinLockScreen } from './PinLockScreen';

const securityMock = vi.hoisted(() => ({
  pinHash: null as string | null,
  pinLockoutUntil: null as number | null,
  pinLength: 4,
  biometricEnabled: false,
  verifyPin: vi.fn(async (_pin: string) => true),
  unlockWithBiometric: vi.fn(async () => true),
  unlock: vi.fn(),
}));

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
    verifyPin: securityMock.verifyPin,
    setPin: vi.fn(async () => {}),
    pinHash: securityMock.pinHash,
    pinLockoutUntil: securityMock.pinLockoutUntil,
    pinLength: securityMock.pinLength,
    biometricEnabled: securityMock.biometricEnabled,
    unlockWithBiometric: securityMock.unlockWithBiometric,
    unlock: securityMock.unlock,
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
    securityMock.pinHash = null;
    securityMock.pinLockoutUntil = null;
    securityMock.pinLength = 4;
    securityMock.biometricEnabled = false;
    securityMock.verifyPin.mockResolvedValue(true);
    securityMock.unlockWithBiometric.mockResolvedValue(true);
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
    const chip = findByClass(document, 'w-12 h-12 rounded-full')!;
    expect(chip.className).toContain('border-[var(--nova-accent-color)]/30');
    expect(chip.className).toContain('w-12 h-12 rounded-full');
    expect(chip.querySelector('svg')).toBeTruthy();
  });

  it('renders heading with passcode lock state', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    expect(screen.getByText('settings.passcodeLock')).toBeTruthy();
  });

  it('renders four PIN dots by default, empty', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const row = findByClass(document, 'gap-2.5')!;
    const dots = Array.from(row.children).filter((c) => c instanceof HTMLElement) as HTMLElement[];
    expect(dots).toHaveLength(4);
    dots.forEach((dot) => {
      expect(dot.className).toContain('bg-white/15');
      expect(dot.className).not.toContain('bg-[var(--nova-accent-color)]');
    });
  });

  it('renders six PIN dots when the passcode length is six', () => {
    securityMock.pinLength = 6;
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const row = findByClass(document, 'gap-2.5')!;
    expect(row.children).toHaveLength(6);
  });

  it('fills dots when PIN entered', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const row = findByClass(document, 'grid-cols-3')!;
    const digit1 = within(row).getByText('1');
    fireEvent.click(digit1);
    const dotsRow = findByClass(document, 'gap-2.5')!;
    const dots = Array.from(dotsRow.children).filter((c) => c instanceof HTMLElement) as HTMLElement[];
    expect(dots[0].className).toContain('bg-[var(--nova-accent-color)]');
    expect(dots[0].className).not.toContain('bg-white/15');
    expect(dots[1].className).toContain('bg-white/15');
  });

  it('shows a fingerprint button only when biometric unlock is enabled', async () => {
    const onUnlock = vi.fn();
    securityMock.pinHash = 'stored-pin-hash';
    securityMock.biometricEnabled = true;
    render(<PinLockScreen onUnlock={onUnlock} />);

    const biometric = screen.getByRole('button', { name: 'common.unlockWithBiometric' });
    fireEvent.click(biometric);

    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
    expect(securityMock.unlockWithBiometric).toHaveBeenCalledTimes(1);
  });

  it('hides the fingerprint button when biometric unlock is disabled', () => {
    securityMock.pinHash = 'stored-pin-hash';
    render(<PinLockScreen onUnlock={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'common.unlockWithBiometric' })).toBeNull();
  });

  it('lets the user skip the passcode for this session', () => {
    const onUnlock = vi.fn();
    securityMock.pinHash = 'stored-pin-hash';
    render(<PinLockScreen onUnlock={onUnlock} />);

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('renders numpad grid with 3 columns and digit buttons', () => {
    render(<PinLockScreen onUnlock={vi.fn()} />);
    const row = findByClass(document, 'grid-cols-3')!;
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(1);
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

  it('verifies a 4-digit passcode and unlocks the app', async () => {
    const onUnlock = vi.fn();
    securityMock.pinHash = 'stored-pin-hash';
    render(<PinLockScreen onUnlock={onUnlock} />);

    const numpad = screen.getByRole('button', { name: '1' }).parentElement!;
    for (const digit of ['1', '2', '3', '4']) {
      fireEvent.click(within(numpad).getByRole('button', { name: digit }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'common.unlock' }));

    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
    expect(securityMock.verifyPin).toHaveBeenCalledWith('1234');
  });

  it('disables passcode entry during a persisted lockout', () => {
    securityMock.pinHash = 'stored-pin-hash';
    securityMock.pinLockoutUntil = Date.now() + 30_000;
    render(<PinLockScreen onUnlock={vi.fn()} />);

    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'common.unlock' })).toBeDisabled();
    expect(screen.getByRole('alert').textContent).toContain('30s');
  });
});
