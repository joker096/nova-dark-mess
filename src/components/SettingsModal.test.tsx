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

const cloudMock = vi.hoisted(() => ({
  uploadEncryptedBackup: vi.fn(async () => {}),
  downloadEncryptedBackup: vi.fn(async () => new Blob(['cloud-backup'])),
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
vi.mock('../lib/storage/cloudBackup', () => cloudMock);
vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => securityMock,
}));
vi.mock('../hooks/usePremium', () => ({
  usePremium: vi.fn(),
}));

const renderSettings = (onClose = vi.fn(), onOpenAnalytics?: () => void) => {
  (usePremium as ReturnType<typeof vi.fn>).mockReturnValue({
    premium: premiumMock.premium,
    loading: false,
    checkout: premiumMock.checkout,
    canUse: (feature: string) => {
      if (feature === 'chat_themes') return premiumMock.canUseThemes;
      if (feature === 'ads_free') return premiumMock.premium;
      return false;
    },
    freeDaysRemaining: () => premiumMock.freeDays,
    minSubscriptionCost: 390,
  });
  const utils = render(
    <SettingsModal isOpen onClose={onClose} onOpenAnalytics={onOpenAnalytics} />,
  );
  return { ...utils, onClose };
};

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.fontSize = '';
    document.documentElement.style.colorScheme = '';
    document.documentElement.style.removeProperty('--nova-accent-color');
    document.body.className = '';
    document.body.style.backgroundColor = '';
    document.body.style.color = '';
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

  it('offers light mode and applies a high-contrast accent palette', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'settings.themeLight' }));

    expect(localStorage.getItem('nova_app_theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--nova-accent-color')).toBe('#c2410c');
    expect(document.body.style.backgroundColor).toBe('var(--nova-canvas)');
  });

  it('restores a previously selected light theme', () => {
    localStorage.setItem('nova_app_theme', 'light');
    renderSettings();

    expect(localStorage.getItem('nova_app_theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies and persists the selected font size', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /small/i }));

    expect(localStorage.getItem('nova_font_size')).toBe('small');
    expect(document.documentElement.style.fontSize).toBe('14px');
    const saved = JSON.parse(localStorage.getItem('nova_messenger_settings') || '{}');
    expect(saved.fontSize).toBe('small');
  });

  it('opens the analytics dashboard from settings and closes the modal', () => {
    const onOpenAnalytics = vi.fn();
    const { onClose } = renderSettings(vi.fn(), onOpenAnalytics);

    fireEvent.click(screen.getByTestId('open-analytics'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenAnalytics).toHaveBeenCalledTimes(1);
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

  it('hides the Premium ads-off notice without a subscription', () => {
    renderSettings();
    expect(screen.queryByTestId('ads-premium-off')).toBeNull();
  });

  it('shows the Premium ads-off notice in the ads section', () => {
    premiumMock.premium = true;
    renderSettings();
    expect(screen.getByTestId('ads-premium-off')).toBeTruthy();
    expect(screen.getByText('settings.adsPremiumOff')).toBeTruthy();
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

  it('opens the Terms and Privacy documents instead of a placeholder', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'settings.termsOfService' }));
    expect(screen.getByTestId('legal-modal-terms')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'common.close' }).at(-1)!);
    expect(screen.queryByTestId('legal-modal-terms')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settings.privacyPolicy' }));
    expect(screen.getByTestId('legal-modal-privacy')).toBeTruthy();
  });

  it('opens the moderation centre from settings', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'settings.moderation' }));

    expect(screen.getByTestId('sanction-screen')).toBeTruthy();
    expect(screen.getByText('moderation.clearTitle')).toBeTruthy();
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

  it('persists the metadata minimization opt-in and reports cover traffic state', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      configurable: true,
      value: async () => ({ level: 0.1, charging: false }),
    });

    renderSettings();
    expect(screen.queryByText(/settings.metadataMinimizationHint/)).toBeNull();

    fireEvent.click(screen.getByText('settings.metadataMinimization'));

    await waitFor(() => expect(screen.getByText(/Cover traffic paused/)).toBeTruthy());
    expect(JSON.parse(localStorage.getItem('nova_privacy_mode') ?? '{}')).toEqual({
      metadataMinimization: true,
      presenceSharing: false,
      presenceHashing: true,
      presenceTtl: 'normal',
      webrtcRelayOnly: false,
    });
    delete (navigator as Navigator & { getBattery?: unknown }).getBattery;
  });

  it('keeps cover traffic on when charging on a low battery', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      configurable: true,
      value: async () => ({ level: 0.1, charging: true }),
    });
    localStorage.setItem('nova_privacy_mode', JSON.stringify({ metadataMinimization: true }));

    renderSettings();
    await waitFor(() => expect(screen.getByText(/Cover traffic active/)).toBeTruthy());
    delete (navigator as Navigator & { getBattery?: unknown }).getBattery;
  });

  it('uploads the encrypted backup to a cloud endpoint instead of saving locally', async () => {
    securityMock.identity = { mnemonic: 'alpha beta gamma delta' };
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /settings.exportBackup/ }));
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'long-enough-pass' } });

    const downloadButton = screen.getByRole('button', { name: 'Export' });
    fireEvent.change(screen.getByPlaceholderText(/webdav/i), {
      target: { value: 'https://dav.example/nova.nova-backup' },
    });
    fireEvent.change(screen.getByPlaceholderText(/bearer token/i), { target: { value: 'secret-token' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(cloudMock.uploadEncryptedBackup).toHaveBeenCalledTimes(1));
    expect(cloudMock.uploadEncryptedBackup).toHaveBeenCalledWith(
      { url: 'https://dav.example/nova.nova-backup', headers: { Authorization: 'Bearer secret-token' } },
      expect.anything(),
    );
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
    void downloadButton;
  });

  it('rejects a cloud endpoint without an http scheme', async () => {
    securityMock.identity = { mnemonic: 'alpha beta gamma delta' };
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /settings.exportBackup/ }));
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'long-enough-pass' } });
    fireEvent.change(screen.getByPlaceholderText(/webdav/i), { target: { value: 'dav.example/nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() =>
      expect(screen.getByText(/must start with http/i)).toBeTruthy(),
    );
    expect(cloudMock.uploadEncryptedBackup).not.toHaveBeenCalled();
  });

  it('restores a backup downloaded from the cloud', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /settings.importBackup/ }));
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'restore-pass' } });
    fireEvent.change(screen.getByPlaceholderText(/webdav/i), {
      target: { value: 'https://dav.example/nova.nova-backup' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Download from cloud/i }));
    await waitFor(() => expect(cloudMock.downloadEncryptedBackup).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Cloud blob ready/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(securityMock.importEncryptedBackup).toHaveBeenCalledWith('cloud-backup', 'restore-pass'),
    );
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

  it('shows local ad preferences and resets them', () => {
    localStorage.setItem('nova_ads_dismissed_v1', JSON.stringify(['campaign-1']));
    localStorage.setItem('nova_ads_blocked_advertisers_v1', JSON.stringify(['advertiser-1']));
    renderSettings();

    expect(screen.getByTestId('ad-preferences')).toBeTruthy();
    expect(screen.getByTestId('ad-prefs-hidden').textContent).toBe('1');
    expect(screen.getByTestId('ad-prefs-blocked').textContent).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'settings.adsReset' }));

    expect(screen.getByTestId('ad-prefs-hidden').textContent).toBe('0');
    expect(screen.getByTestId('ad-prefs-blocked').textContent).toBe('0');
    expect(localStorage.getItem('nova_ads_dismissed_v1')).toBeNull();
    expect(localStorage.getItem('nova_ads_blocked_advertisers_v1')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('settings.adsResetDone');
  });

  it('restores one hidden ad and unblocks one advertiser', () => {
    localStorage.setItem(
      'nova_ads_dismissed_v1',
      JSON.stringify(['cmp_demo_auralis_001', 'cmp_demo_second_002']),
    );
    localStorage.setItem(
      'nova_ads_blocked_advertisers_v1',
      JSON.stringify(['adv_demo_auralis', 'adv_demo_second']),
    );
    renderSettings();

    fireEvent.click(screen.getAllByRole('button', { name: 'settings.adsRestore' })[0]);
    expect(JSON.parse(localStorage.getItem('nova_ads_dismissed_v1') ?? '[]')).toEqual([
      'cmp_demo_second_002',
    ]);
    expect(screen.getByTestId('ad-prefs-hidden').textContent).toBe('1');

    fireEvent.click(screen.getAllByRole('button', { name: 'settings.adsUnblock' })[0]);
    expect(JSON.parse(localStorage.getItem('nova_ads_blocked_advertisers_v1') ?? '[]')).toEqual([
      'adv_demo_second',
    ]);
    expect(screen.getByTestId('ad-prefs-blocked').textContent).toBe('1');
    expect(screen.getByRole('status').textContent).toBe('settings.adsPreferenceUpdated');
  });

  it('reports an empty join request outbox', () => {
    renderSettings();

    expect(screen.getByTestId('join-outbox').textContent).toContain('settings.joinOutboxEmpty');
    expect(screen.queryByRole('button', { name: 'settings.joinOutboxRetry' })).toBeNull();
  });

  it('surfaces undelivered join requests with a manual retry', () => {
    localStorage.setItem(
      'nova_group_join_outbox',
      JSON.stringify([
        {
          id: 'job-1',
          groupId: 'thailand',
          kind: 'request',
          fingerprint: 'nova_pk_peer',
          createdAt: 1,
          attempts: 2,
          nextAttemptAt: Date.now() + 60_000,
        },
      ]),
    );

    renderSettings();

    expect(screen.getByTestId('join-outbox').textContent).toContain('settings.joinOutboxPending');
    // No session relay is running in isolation: the job stays queued after retry.
    fireEvent.click(screen.getByRole('button', { name: 'settings.joinOutboxRetry' }));
    expect(screen.getByTestId('join-outbox').textContent).toContain('settings.joinOutboxPending');
  });
});
