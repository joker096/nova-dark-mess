/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OnboardingWizard } from './OnboardingWizard';
import { isOnboardingComplete } from '../lib/onboarding';

const mocks = vi.hoisted(() => ({
  updateAccount: vi.fn(),
}));
const securityMocks = vi.hoisted(() => ({
  identity: { mnemonic: 'a b c d e f g h i j k l m n o p q r s t u v w x' },
  restoreIdentityFromMnemonic: vi.fn(async () => undefined),
  setPin: vi.fn(async () => undefined),
  exportEncryptedBackup: vi.fn(async () => new Blob(['backup'])),
  importEncryptedBackup: vi.fn(async () => ({})),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    ],
  }),
}));

vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => securityMocks,
}));

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({
    account: { displayName: 'Nova' },
    updateAccount: mocks.updateAccount,
  }),
}));

const advanceToFinish = () => {
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
  fireEvent.change(screen.getByLabelText('onboarding.nameLabel'), {
    target: { value: 'Mira' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.getStarted' }));
  fireEvent.click(screen.getByText('onboarding.createOption'));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.savedPhrase' }));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));
};

const advanceToBackup = () => {
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
  fireEvent.change(screen.getByLabelText('onboarding.nameLabel'), {
    target: { value: 'Mira' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.getStarted' }));
  fireEvent.click(screen.getByText('onboarding.createOption'));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.savedPhrase' }));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));
};

describe('OnboardingWizard', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.updateAccount.mockReset();
    securityMocks.restoreIdentityFromMnemonic.mockReset().mockResolvedValue(undefined);
    securityMocks.setPin.mockReset().mockResolvedValue(undefined);
    securityMocks.exportEncryptedBackup.mockReset().mockResolvedValue(new Blob(['backup']));
    securityMocks.importEncryptedBackup.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the language selection step first', () => {
    render(<OnboardingWizard onDone={() => {}} />);
    expect(screen.getByTestId('onboarding-language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'onboarding.continue' })).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('requires a Unicode nickname before identity setup and saves it without a phone number', async () => {
    const onDone = vi.fn();
    render(<OnboardingWizard onDone={onDone} />);

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
    expect(screen.getByTestId('onboarding-nickname')).toBeTruthy();

    const continueButton = screen.getByRole('button', { name: 'onboarding.continue' });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('onboarding.nameLabel'), {
      target: { value: '@@' },
    });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('onboarding.nameLabel'), {
      target: { value: 'Мира 🌙' },
    });
    expect((continueButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(continueButton);

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.getStarted' }));
    fireEvent.click(screen.getByText('onboarding.createOption'));
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.savedPhrase' }));
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.startMessaging' }));

    await waitFor(() => {
      expect(mocks.updateAccount).toHaveBeenCalledWith({
        displayName: 'Мира 🌙',
        nickname: '@Мира 🌙',
        phone: '',
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('does not finish onboarding when profile persistence fails', async () => {
    const onDone = vi.fn();
    mocks.updateAccount.mockImplementation(() => {
      throw new Error('storage is unavailable');
    });
    render(<OnboardingWizard onDone={onDone} />);

    advanceToFinish();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.startMessaging' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('storage is unavailable');
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(isOnboardingComplete()).toBe(false);
  });

  it('creates an encrypted backup only after the passphrase is confirmed', async () => {
    const createObjectURL = vi.fn(() => 'blob:backup-test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<OnboardingWizard onDone={() => {}} />);
    advanceToBackup();

    fireEvent.change(screen.getByLabelText('onboarding.backupPassphrase'), {
      target: { value: 'correct horse' },
    });
    fireEvent.change(screen.getByLabelText('onboarding.backupConfirmPassphrase'), {
      target: { value: 'different phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'settings.exportBackup' }));
    expect(screen.getByRole('alert').textContent).toBe('onboarding.backupPassphraseMismatch');
    expect(securityMocks.exportEncryptedBackup).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('onboarding.backupConfirmPassphrase'), {
      target: { value: 'correct horse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'settings.exportBackup' }));

    await waitFor(() => {
      expect(securityMocks.exportEncryptedBackup).toHaveBeenCalledWith('correct horse', []);
      expect(screen.getByTestId('onboarding-done')).toBeTruthy();
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup-test');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('restores from a selected encrypted backup before finishing account setup', async () => {
    render(<OnboardingWizard onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
    fireEvent.change(screen.getByLabelText('onboarding.nameLabel'), {
      target: { value: 'Mira' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.getStarted' }));
    fireEvent.click(screen.getByRole('button', { name: /settings.importBackup/ }));

    const backupFile = new File(['encrypted contents'], 'identity.nova-backup', {
      type: 'application/json',
    });
    Object.defineProperty(backupFile, 'text', {
      value: vi.fn().mockResolvedValue('encrypted contents'),
    });
    fireEvent.change(screen.getByLabelText('onboarding.backupFileLabel'), {
      target: { files: [backupFile] },
    });
    fireEvent.change(screen.getByLabelText('onboarding.backupPassphrase'), {
      target: { value: 'correct horse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'settings.importBackup' }));

    await waitFor(() => {
      expect(securityMocks.importEncryptedBackup).toHaveBeenCalledWith(
        'encrypted contents',
        'correct horse',
      );
      expect(screen.getByTestId('onboarding-security')).toBeTruthy();
    });
  });
});