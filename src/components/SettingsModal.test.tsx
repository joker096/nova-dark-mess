/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';
import { usePremium } from '../hooks/usePremium';
import { PIN_ENABLED_KEY, PIN_HASH_KEY } from '../context/SecurityContext';

const languageMock = vi.hoisted(() => ({
  changeLanguage: vi.fn(),
  onClose: vi.fn(),
  languages: [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  ],
}));

const securityMock = vi.hoisted(() => ({
  identity: null as { mnemonic: string } | null,
  is2FAEnabled: false,
  totpSecret: null as string | null,
  pinEnabled: false,
  enable2FA: vi.fn(async () => true),
  disable2FA: vi.fn(),
  setPin: vi.fn(async () => {}),
  verifyPin: vi.fn(async () => true),
  removePin: vi.fn(async () => {}),
  exportEncryptedBackup: vi.fn(async () => new Blob(['backup'])),
  importEncryptedBackup: vi.fn(async () => ({})),
  clearLocalEncryptedData: vi.fn(async () => {}),
}));

const premiumMock = vi.hoisted(() => ({
  premium: false,
  canUseThemes: false,
  freeDays: 0,
  checkout: vi.fn(),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: languageMock.changeLanguage,
    languages: languageMock.languages,
  }),
}));
vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => securityMock,
}));
vi.mock('../hooks/usePremium', () => ({
  usePremium: vi.fn(),
}));

const renderSettings = (onClose = vi.fn()) => {
  (usePremium as ReturnType<typeof vi.fn>).mockReturnValue({
    premium: premiumMock.premium,
    loading: false,
    checkout: premiumMock.checkout,
    canUse: (feature: string) => (feature === 'chat_themes' ? premiumMock.canUseThemes : false),
    freeDaysRemaining: () => premiumMock.freeDays,
    minSubscriptionCost: 49,
  });
  const utils = render(<SettingsModal isOpen onClose={onClose} />);
  return { ...utils, onClose };
};

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.fontSize = '';
    document.body.className = '';
    securityMock.identity = null;
    securityMock.is2FAEnabled = false;
    securityMock.totpSecret = null;
    securityMock.pinEnabled = false;
    securityMock.verifyPin.mockResolvedValue(true);
    premiumMock.premium = false;
    premiumMock.canUseThemes = false;
    premiumMock.freeDays = 0;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders an accessible dialog', () => {
    renderSettings();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('settings.title')).toBeTruthy();
  });

  it('toggles notification preferences and persists them', () => {
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'settings.notificationSound' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);

    expect(screen.getByRole('switch', { name: 'settings.notificationSound' }).getAttribute('aria-checked')).toBe('false');
    const saved = JSON.parse(localStorage.getItem('nova_messenger_settings') || '{}');
    expect(saved.notificationSound).toBe(false);
  });

  it('persists and applies the light theme immediately', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'settings.themeLight' }));

    expect(localStorage.getItem('nova_app_theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.body.className).toContain('bg-[#f5f5f7]');
  });

  it('applies and persists the selected font size', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /small/i }));

    expect(localStorage.getItem('nova_font_size')).toBe('small');
    expect(document.documentElement.style.fontSize).toBe('14px');
    const saved = JSON.parse(localStorage.getItem('nova_messenger_settings') || '{}');
    expect(saved.fontSize).toBe('small');
  });

  it('keeps the dialog open after changing language', () => {
    const { onClose } = renderSettings();
    fireEvent.click(screen.getByTitle(/Change Language/));
    fireEvent.click(screen.getByRole('button', { name: /Русский/ }));

    expect(languageMock.changeLanguage).toHaveBeenCalledWith('ru');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('routes locked premium themes to checkout instead of doing nothing', () => {
    renderSettings();
    const sapphire = screen.getByRole('button', { name: 'settings.chatColorSapphire' });

    expect(sapphire.hasAttribute('disabled')).toBe(false);
    expect(sapphire.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(sapphire);

    expect(premiumMock.checkout).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('nova_chat_theme')).toBeNull();
  });

  it('applies premium themes when the feature is unlocked', () => {
    premiumMock.premium = true;
    premiumMock.canUseThemes = true;
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'settings.chatColorEmerald' }));

    expect(premiumMock.checkout).not.toHaveBeenCalled();
    expect(localStorage.getItem('nova_chat_theme')).toBe('emerald');
    expect(document.documentElement.style.getPropertyValue('--nova-accent-color')).toBe('#10B981');
  });

  it('always allows selecting the default theme', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'settings.chatColorDefault' }));
    expect(localStorage.getItem('nova_chat_theme')).toBe('default');
  });

  it('calls checkout for the premium upgrade button', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /settings.premiumUpgrade/ }));
    expect(premiumMock.checkout).toHaveBeenCalledTimes(1);
  });

  it('clears cached chats and shows feedback', () => {
    localStorage.setItem('nova_messenger_chat_cache', 'cached');
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'settings.clearCache' }));

    expect(localStorage.getItem('nova_messenger_chat_cache')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('settings.cacheCleared');
  });

  it('deletes all data without a PIN after confirmation', async () => {
    localStorage.setItem(PIN_HASH_KEY, 'hash');
    localStorage.setItem(PIN_ENABLED_KEY, 'true');
    const { onClose } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /settings.clearAllData/ }));
    expect(screen.getByText('settings.confirmClearNoPin')).toBeTruthy();
    expect(document.querySelector('input[placeholder="0000"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(securityMock.clearLocalEncryptedData).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(PIN_HASH_KEY)).toBeNull();
    expect(localStorage.getItem(PIN_ENABLED_KEY)).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('requires a valid PIN before deleting data when a passcode is enabled', async () => {
    securityMock.pinEnabled = true;
    securityMock.verifyPin.mockResolvedValue(false);
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /settings.clearAllData/ }));
    const inputs = screen.getAllByPlaceholderText('0000');
    const confirmPinInput = inputs[inputs.length - 1];
    fireEvent.change(confirmPinInput, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(screen.getAllByText('settings.incorrectPasscode').length).toBeGreaterThan(0));
    expect(securityMock.clearLocalEncryptedData).not.toHaveBeenCalled();

    securityMock.verifyPin.mockResolvedValue(true);
    fireEvent.change(confirmPinInput, { target: { value: '4321' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(securityMock.clearLocalEncryptedData).toHaveBeenCalledTimes(1));
  });

  it('requires the current passcode before removing it', async () => {
    securityMock.pinEnabled = true;
    securityMock.verifyPin.mockResolvedValue(false);
    renderSettings();

    fireEvent.click(screen.getByRole('switch', { name: 'settings.passcodeLock' }));
    expect(screen.getByText('settings.passcodeConfirmRemove')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('0000'), { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('button', { name: 'settings.removePasscode' }));

    await waitFor(() => expect(screen.getByText('settings.incorrectPasscode')).toBeTruthy());
    expect(securityMock.removePin).not.toHaveBeenCalled();

    securityMock.verifyPin.mockResolvedValue(true);
    fireEvent.change(screen.getByPlaceholderText('0000'), { target: { value: '2222' } });
    fireEvent.click(screen.getByRole('button', { name: 'settings.removePasscode' }));

    await waitFor(() => expect(securityMock.removePin).toHaveBeenCalledTimes(1));
  });

  it('shows feedback for Terms and Privacy links', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'settings.termsOfService' }));
    expect(screen.getByRole('status').textContent).toBe('settings.comingSoon');

    fireEvent.click(screen.getByRole('button', { name: 'settings.privacyPolicy' }));
    expect(screen.getByRole('status').textContent).toBe('settings.comingSoon');
  });

  it('closes on Escape', () => {
    const { onClose } = renderSettings();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('requires an 8 character passphrase before exporting a backup', async () => {
    securityMock.identity = { mnemonic: Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(' ') };
    const createObjectURL = vi.fn(() => 'blob:nova');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /settings.exportBackup/ }));

    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(exportButton.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'short' } });
    expect(exportButton.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'long-enough-pass' } });
    expect(exportButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(exportButton);

    await waitFor(() =>
      expect(securityMock.exportEncryptedBackup).toHaveBeenCalledWith(
        'long-enough-pass',
        expect.any(Array),
      ),
    );
    clickSpy.mockRestore();
  });

  it('copies the recovery phrase and shows confirmation', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    securityMock.identity = { mnemonic: 'alpha beta gamma delta' };
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /settings.showSeedPhrase/ }));
    expect(screen.getByText(/alpha/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /common.copy/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('alpha beta gamma delta'));
    expect(screen.getByRole('button', { name: /common.copied/ })).toBeTruthy();
  });
});
