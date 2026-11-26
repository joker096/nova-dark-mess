/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
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
  downloadEncryptedBackup: vi.fn(async () => new Blob(['NOVA_BACKUP cloud-backup'])),
}));

const premiumMock = vi.hoisted(() => ({
  premium: false,
  canUseThemes: false,
  freeDays: 0,
  checkout: vi.fn(async () => ({ ok: true, error: undefined, orderId: 'test-order', url: 'https://example.com' })),
}));

const settingsMock = vi.hoisted(() => ({
  state: {
    app: {
      fontSize: 'medium' as const,
      appTheme: 'system' as const,
      chatColorTheme: 'default' as const,
      fabSide: 'right' as const,
      notificationSound: true,
      vibration: false,
      previewMessages: true,
      pushEnabled: true,
      autoDownload: true,
      soundId: 'default' as const,
    },
    privacy: {
      metadataMinimization: false,
      presenceSharing: false,
      presenceHashing: false,
      presenceTtl: 'normal' as const,
      torEnabled: false,
      torSocksPort: 9050,
    },
    socialPrivacy: {
      lastSeen: 'contacts' as const,
      profilePhoto: 'contacts' as const,
      calls: 'contacts' as const,
      groupsAndChannels: 'contacts' as const,
      phoneNumber: 'nobody' as const,
      blockedUsers: [],
      exceptions: {},
      phoneAccess: [],
    },
    notifications: {
      privateChats: 'all' as const,
      groups: 'all' as const,
      channels: 'all' as const,
      bots: 'all' as const,
      sound: true,
      vibration: false,
      preview: true,
      push: true,
    },
    adPrefs: {
      hiddenAdIds: [],
      blockedAdvertisers: [],
      consentGiven: false,
    },
    isLoading: false,
    lastSaved: null,
  },
  updateAppSetting: vi.fn(),
  updatePrivacySetting: vi.fn(),
  updateSocialPrivacySetting: vi.fn(),
  updateNotificationSetting: vi.fn(),
  updateAdPrefSetting: vi.fn(),
  saveAll: vi.fn(),
  resetToDefaults: vi.fn(),
  subscribe: vi.fn(() => () => {}),
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
vi.mock('../lib/dataExport', () => ({
  downloadMyDataExport: vi.fn(async () => 'nova_my_data_export.json'),
}));
vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => securityMock,
}));
vi.mock('../hooks/usePremium', () => ({
  usePremium: vi.fn(),
}));
vi.mock('../context/SettingsContext', () => ({
  useSettings: () => settingsMock,
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

  

  it('has all six tabs', () => {
    renderSettings();
    expect(screen.getByRole('tab', { name: 'settings.tabGeneral' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'settings.tabNotifications' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'settings.tabPrivacy' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'settings.tabAdvanced' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'settings.tabData' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'settings.tabAbout' })).toBeTruthy();
  });

  it('opens the premium sheet from header chip', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /settings.premiumChipAria/ }));
    const buttons = screen.getAllByRole('button', { name: /settings.premiumUpgrade/ });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('has Terms and Privacy buttons in About tab', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabAbout' }));
    expect(screen.getByRole('button', { name: 'Terms of ServiceRead our terms' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Privacy PolicyRead our privacy policy' })).toBeTruthy();
  });

  it('closes on Escape', () => {
    const { onClose } = renderSettings();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has metadata minimization toggle in privacy tab', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabPrivacy' }));
    const toggle = screen.getByText('settings.metadataMinimization');
    expect(toggle).toBeTruthy();
  });
});