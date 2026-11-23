/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AccountSwitcher } from './AccountSwitcher';
import { useAccount } from '../hooks/useAccount';
import { MULTI_ACCOUNT_STORAGE_KEY, ACTIVE_ACCOUNT_KEY, StoredAccount } from '../lib/account/multiAccount';
import { CURRENT_USER } from '../data/mockMessengerData';

const mockAccounts: StoredAccount[] = [
  {
    version: 1,
    id: CURRENT_USER.id,
    displayName: 'Nova user',
    nickname: '@nova_user',
    phone: '',
    avatar: '',
    status: 'Online',
    createdAt: Date.now() - 100000,
    isPrimary: true,
    addedAt: Date.now() - 100000,
    lastUsedAt: Date.now() - 1000,
  },
  {
    version: 1,
    id: 'user_2',
    displayName: 'Second User',
    nickname: '@second',
    phone: '',
    avatar: '',
    status: 'Online',
    createdAt: Date.now() - 50000,
    isPrimary: false,
    addedAt: Date.now() - 50000,
    lastUsedAt: Date.now() - 5000,
  },
  {
    version: 1,
    id: 'user_3',
    displayName: 'Third User',
    nickname: '@third',
    phone: '',
    avatar: '',
    status: 'Online',
    createdAt: Date.now(),
    isPrimary: false,
    addedAt: Date.now(),
    lastUsedAt: Date.now(),
  },
];

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({
    accounts: mockAccounts,
    activeAccount: mockAccounts[0],
    switchAccount: vi.fn(),
    addAccount: vi.fn(),
    removeAccount: vi.fn(),
  }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

describe('AccountSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(mockAccounts));
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, CURRENT_USER.id);
  });

  const renderSwitcher = (isOpen = true, props: Partial<{ onClose: () => void; onAccountAdded: () => void }> = {}) => {
    return render(
      <AccountSwitcher
        isOpen={isOpen}
        onClose={props.onClose ?? vi.fn()}
        onAccountAdded={props.onAccountAdded}
      />,
    );
  };

  it('renders when open', () => {
    renderSwitcher();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('settings.accounts.title')).toBeTruthy();
  });

  it('shows current account with primary indicator', () => {
    renderSwitcher();
    expect(screen.getByText('settings.accounts.current')).toBeTruthy();
    // Current account section shows nickname and display name
    const currentSection = screen.getByText('settings.accounts.current').closest('div')!;
    // Check nickname is present in the current section
    expect(currentSection.textContent).toContain('@nova_user');
    // The display name is in a font-semibold truncate element - use getByText for simplicity
    expect(screen.getByText('Nova user')).toBeTruthy();
  });

  it('lists all accounts', () => {
    renderSwitcher();
    // List shows all three accounts
    const listItems = screen.getAllByText('Nova user');
    expect(listItems.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Second User')).toBeTruthy();
    expect(screen.getByText('Third User')).toBeTruthy();
    expect(screen.getAllByText('@second')).toHaveLength(1);
    expect(screen.getAllByText('@third')).toHaveLength(1);
  });

  it('shows primary star on primary account', () => {
    renderSwitcher();
    // Primary account has Star icons (one in current section, one in list)
    const stars = screen.getAllByTestId('primary-star');
    expect(stars.length).toBeGreaterThanOrEqual(1);
  });

  it('shows active indicator on current account', () => {
    renderSwitcher();
    expect(screen.getByTestId('active-indicator')).toBeTruthy();
  });

  it('has add account button', () => {
    renderSwitcher();
    expect(screen.getByText('settings.accounts.addAccount')).toBeTruthy();
  });

  it('shows add account button', () => {
    renderSwitcher();
    expect(screen.getByText('settings.accounts.addAccount')).toBeTruthy();
  });

  it('shows delete confirmation for non-primary accounts', () => {
    renderSwitcher();
    // Find delete button for second user
    const deleteButtons = screen.getAllByTitle('settings.accounts.remove');
    expect(deleteButtons).toHaveLength(2); // Second and third user (not primary)

    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText('settings.accounts.confirmDelete')).toBeTruthy();
    expect(screen.getByText('settings.accounts.deleteWarning')).toBeTruthy();
  });

  it('shows delete confirmation modal', () => {
    renderSwitcher();
    const deleteButtons = screen.getAllByTitle('settings.accounts.remove');
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText('settings.accounts.confirmDelete')).toBeTruthy();
    expect(screen.getByText('settings.accounts.deleteWarning')).toBeTruthy();
  });

  it('shows switch buttons for non-active accounts', () => {
    renderSwitcher();
    const switchButtons = screen.getAllByTitle('settings.accounts.switch');
    expect(switchButtons).toHaveLength(2); // Second and third user
  });

  it('does not show switch button for active account', () => {
    renderSwitcher();
    const switchButtons = screen.getAllByTitle('settings.accounts.switch');
    expect(switchButtons).toHaveLength(2); // Only for non-active accounts
  });

  it('does not show remove button for primary account', () => {
    renderSwitcher();
    const deleteButtons = screen.getAllByTitle('settings.accounts.remove');
    expect(deleteButtons).toHaveLength(2); // Only for non-primary accounts
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderSwitcher(true, { onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows hint text', () => {
    renderSwitcher();
    expect(screen.getByText('settings.accounts.hint')).toBeTruthy();
  });
});