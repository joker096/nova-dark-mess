/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModalOptimized } from './SettingsModalOptimized';
import { usePremium } from '../hooks/usePremium';
import React from 'react';

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

// Mock lazy-loaded tab components to render synchronously in tests
vi.mock('./settings/tabs/GeneralTab', () => ({
  GeneralTab: ({ onOpenAnalytics }: { onOpenAnalytics?: () => void }) => (
    <div data-testid="settings-panel-general" role="tabpanel">
      <h3>General</h3>
      <button data-testid="theme-control">theme</button>
      <button data-testid="font-size-control">fontSize</button>
      <button data-testid="premium-upgrade">{premiumMock.premium ? 'settings.premiumActive' : 'settings.premiumUpgrade'}</button>
    </div>
  ),
}));

vi.mock('./settings/tabs/NotificationsTab', () => ({
  NotificationsTab: () => (
    <div data-testid="settings-panel-notifications" role="tabpanel">
      <h3>Notifications</h3>
      <button data-testid="notification-sound">notificationSound</button>
      <button data-testid="vibration">vibration</button>
    </div>
  ),
}));

vi.mock('./settings/tabs/PrivacyTab', () => ({
  PrivacyTab: () => (
    <div data-testid="settings-panel-privacy" role="tabpanel">
      <h3>Privacy</h3>
      <button data-testid="metadata-minimization">metadataMinimization</button>
      <button data-testid="social-privacy">socialPrivacy</button>
    </div>
  ),
}));

vi.mock('./settings/tabs/DataTab', () => ({
  DataTab: () => (
    <div data-testid="settings-panel-data" role="tabpanel">
      <h3>Data</h3>
      <button data-testid="export-data">exportMyData</button>
      <button data-testid="backup-now">backupNow</button>
      <button data-testid="clear-data">clearAllData</button>
    </div>
  ),
}));

vi.mock('./settings/tabs/AdvancedTab', () => ({
  AdvancedTab: () => (
    <div data-testid="settings-panel-advanced" role="tabpanel">
      <h3>Advanced</h3>
      <button data-testid="ad-preferences">adPreferences</button>
      <button data-testid="join-outbox">joinOutbox</button>
      <button data-testid="pin-enabled">pinEnabled</button>
    </div>
  ),
}));

vi.mock('./settings/tabs/AboutTab', () => ({
  AboutTab: () => (
    <div data-testid="settings-panel-about" role="tabpanel">
      <h3>About</h3>
      <button data-testid="version">version</button>
      <button data-testid="copy-link">copyAppLink</button>
    </div>
  ),
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
    <SettingsModalOptimized isOpen onClose={onClose} onOpenAnalytics={onOpenAnalytics} />,
  );
  return { ...utils, onClose };
};

describe('SettingsModalOptimized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders and shows tabs', () => {
    renderSettings();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Data' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Advanced' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'About' })).toBeInTheDocument();
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    renderSettings(onClose);
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalled();
  });

  it('switches tabs via keyboard', () => {
    renderSettings();
    const tabList = screen.getByRole('tablist');
    fireEvent.keyDown(tabList, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Notifications', selected: true })).toBeInTheDocument();
  });

  it('opens General tab by default and shows theme/font controls', async () => {
    renderSettings();
    await waitFor(() => expect(screen.getByTestId('theme-control')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('font-size-control')).toBeInTheDocument());
  });

  it('switches to Notifications tab', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Notifications' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Notifications', selected: true })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('notification-sound')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('vibration')).toBeInTheDocument());
  });

  it('switches to Privacy tab', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Privacy' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Privacy', selected: true })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('metadata-minimization')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('social-privacy')).toBeInTheDocument());
  });

  it('switches to Data tab', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Data', selected: true })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('export-data')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('backup-now')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('clear-data')).toBeInTheDocument());
  });

  it('switches to Advanced tab', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Advanced', selected: true })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('ad-preferences')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('join-outbox')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('pin-enabled')).toBeInTheDocument());
  });

  it('switches to About tab', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'About' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'About', selected: true })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('version')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('copy-link')).toBeInTheDocument());
  });

  it('shows premium upgrade button when not premium', async () => {
    renderSettings();
    await waitFor(() => expect(screen.getByTestId('premium-upgrade')).toBeInTheDocument());
  });

  it('shows premium active when premium', async () => {
    premiumMock.premium = true;
    premiumMock.canUseThemes = true;
    renderSettings();
    await waitFor(() => expect(screen.getByTestId('premium-upgrade')).toHaveTextContent('settings.premiumActive'));
  });
});