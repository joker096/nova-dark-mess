/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingWizard } from './OnboardingWizard';

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
  useSecurity: () => ({
    identity: { mnemonic: 'a b c d e f g h i j k l m n o p q r s t u v w x' },
    restoreIdentityFromMnemonic: vi.fn(),
    setPin: vi.fn(),
  }),
}));

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({
    account: { displayName: 'Nova' },
    updateAccount: vi.fn(),
  }),
}));

describe('OnboardingWizard', () => {
  it('renders the language selection step first', () => {
    render(<OnboardingWizard onDone={() => {}} />);
    expect(screen.getByTestId('onboarding-language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'onboarding.continue' })).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
  });
});