/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OnboardingWizard } from './OnboardingWizard';
import { isOnboardingComplete } from '../lib/onboarding';

const mocks = vi.hoisted(() => ({
  updateAccount: vi.fn(),
  addAccount: vi.fn((acc: any) => ({ ...acc, id: `test_${Date.now()}`, isPrimary: false, addedAt: Date.now(), lastUsedAt: Date.now() })),
  switchAccount: vi.fn((id: string) => ({ id, displayName: 'Test', nickname: '@test', isPrimary: false, addedAt: Date.now(), lastUsedAt: Date.now() })),
}));
const securityMocks = vi.hoisted(() => ({
  identity: { mnemonic: 'a b c d e f g h i j k l m n o p q r s t u v w x' },
  restoreIdentityFromMnemonic: vi.fn(async () => undefined),
  setPin: vi.fn(async () => undefined),
  setPinLength: vi.fn(),
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
    addAccount: mocks.addAccount,
    switchAccount: mocks.switchAccount,
  }),
}));

const answerPhraseCheck = () => {
  for (let round = 0; round < 3; round += 1) {
    const panel = screen.getByTestId('onboarding-phrase-check');
    expect(panel.getAttribute('data-round')).toBe(String(round));
    const options = screen.getAllByTestId('phrase-check-option');
    for (const option of options) {
      fireEvent.click(option);
      const after = screen.queryByTestId('onboarding-phrase-check');
      if (!after || after.getAttribute('data-round') !== String(round)) break;
    }
  }
};

const createIdentity = () => {
  fireEvent.click(screen.getByText('onboarding.createOption'));
  fireEvent.change(screen.getByLabelText('onboarding.nameLabel'), {
    // Regular length: under 5 characters the wizard opens the paid short-name step.
    target: { value: 'Mirai' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.savedPhrase' }));
  answerPhraseCheck();
};

const advanceToFinish = () => {
  createIdentity();
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' })); // security
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.skipBackup' })); // backup
};

const advanceToBackup = () => {
  createIdentity();
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' })); // security
};

describe('OnboardingWizard', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.updateAccount.mockReset();
    securityMocks.restoreIdentityFromMnemonic.mockReset().mockResolvedValue(undefined);
    securityMocks.setPin.mockReset().mockResolvedValue(undefined);
    securityMocks.setPinLength.mockReset();
    securityMocks.exportEncryptedBackup.mockReset().mockResolvedValue(new Blob(['backup']));
    securityMocks.importEncryptedBackup.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts with a welcome screen and opens the language picker on demand', () => {
    render(<OnboardingWizard onDone={() => {}} />);
    expect(screen.getByTestId('onboarding-welcome')).toBeTruthy();
    expect(screen.getByText('onboarding.createOption')).toBeTruthy();
    expect(screen.getByText('onboarding.restoreOption')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /English/ }));
    expect(screen.getByTestId('onboarding-language')).toBeTruthy();
    expect(screen.getByText('Русский')).toBeTruthy();
  });

  it('requires a Unicode nickname and saves it without a phone number', async () => {
    const onDone = vi.fn();
    render(<OnboardingWizard onDone={onDone} />);

    fireEvent.click(screen.getByText('onboarding.createOption'));
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

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.savedPhrase' }));
    answerPhraseCheck();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' })); // security
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.skipBackup' })); // backup
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.startMessaging' }));

    await waitFor(() => {
      expect(mocks.addAccount).toHaveBeenCalledWith(expect.objectContaining({
        displayName: 'Мира 🌙',
        nickname: '@Мира 🌙',
        phone: '',
      }));
      expect(mocks.switchAccount).toHaveBeenCalled();
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('does not finish onboarding when profile persistence fails', async () => {
    const onDone = vi.fn();
    mocks.addAccount.mockImplementation(() => {
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
    // The download URL is revoked on a delay so the browser can start the save.
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup-test');
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('onboarding.backupReminder')).toBeNull();
    vi.useRealTimers();
  });

  it('shows a backup reminder when the backup step is skipped', () => {
    render(<OnboardingWizard onDone={() => {}} />);
    advanceToFinish();
    expect(screen.getByTestId('onboarding-done')).toBeTruthy();
    expect(screen.getByText('onboarding.backupReminder')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.backupNow' }));
    expect(screen.getByTestId('onboarding-backup')).toBeTruthy();
  });

  it('restores an identity from its phrase, then asks only for a name and PIN', async () => {
    render(<OnboardingWizard onDone={() => {}} />);
    fireEvent.click(screen.getByText('onboarding.restoreOption'));
    expect(screen.getByTestId('onboarding-choice')).toBeTruthy();
    fireEvent.click(screen.getByText('onboarding.restoreTitle'));

    fireEvent.change(screen.getByLabelText('onboarding.phraseLabel'), {
      target: { value: '  A B C D E F G H I J K L M N O P Q R S T U V W X  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.restoreAction' }));

    await waitFor(() => {
      expect(securityMocks.restoreIdentityFromMnemonic).toHaveBeenCalledWith(
        'a b c d e f g h i j k l m n o p q r s t u v w x',
      );
      expect(screen.getByTestId('onboarding-nickname')).toBeTruthy();
    });

    // Short nicknames (< 5 chars) open the paid short-name step instead, so the
    // restore flow uses a regular one.
    fireEvent.change(screen.getByLabelText('onboarding.nameLabel'), {
      target: { value: 'Mirai' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }));
    expect(screen.getByTestId('onboarding-security')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));
    expect(screen.getByTestId('onboarding-done')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-backup')).toBeNull();
  });

  it('restores from a selected encrypted backup before finishing account setup', async () => {
    render(<OnboardingWizard onDone={() => {}} />);
    fireEvent.click(screen.getByText('onboarding.restoreOption'));
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
      expect(screen.getByTestId('onboarding-nickname')).toBeTruthy();
    });
  });
});
