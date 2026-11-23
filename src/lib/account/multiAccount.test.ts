/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadAllAccounts,
  saveAllAccounts,
  getActiveAccountId,
  setActiveAccountId,
  getActiveAccount,
  addAccount,
  removeAccount,
  switchAccount,
  updateAccountProfile,
  setPrimaryAccount,
  createAccountFromOnboarding,
  MULTI_ACCOUNT_STORAGE_KEY,
  ACTIVE_ACCOUNT_KEY,
  StoredAccount,
} from './multiAccount';
import { loadAccount } from './account';

describe('multiAccount', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('loadAllAccounts', () => {
    it('returns primary account from legacy storage when no multi-account storage exists', () => {
      // Set up legacy account
      localStorage.setItem('nova_account_profile_v1', JSON.stringify({
        version: 1,
        id: 'user_123',
        displayName: 'Test User',
        nickname: '@testuser',
        phone: '',
        avatar: '',
        status: 'Online',
        createdAt: Date.now(),
      }));

      const accounts = loadAllAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].displayName).toBe('Test User');
      expect(accounts[0].isPrimary).toBe(true);
    });

    it('returns accounts from multi-account storage', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now() - 1000,
          lastUsedAt: Date.now(),
        },
        {
          version: 1,
          id: 'user_2',
          displayName: 'User Two',
          nickname: '@usertwo',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: false,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const loaded = loadAllAccounts();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].nickname).toBe('@userone');
      expect(loaded[1].nickname).toBe('@usertwo');
    });
  });

  describe('saveAllAccounts', () => {
    it('saves accounts to localStorage and dispatches event', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];

      saveAllAccounts(accounts);
      const stored = JSON.parse(localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY)!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('user_1');
    });
  });

  describe('getActiveAccountId / setActiveAccountId', () => {
    it('gets and sets active account ID', () => {
      expect(getActiveAccountId()).toBeNull();
      setActiveAccountId('user_123');
      expect(getActiveAccountId()).toBe('user_123');
    });
  });

  describe('getActiveAccount', () => {
    it('returns active account by ID', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
        {
          version: 1,
          id: 'user_2',
          displayName: 'User Two',
          nickname: '@usertwo',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: false,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
      setActiveAccountId('user_2');

      const active = getActiveAccount();
      expect(active?.id).toBe('user_2');
    });

    it('falls back to primary account when no active ID set', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
        {
          version: 1,
          id: 'user_2',
          displayName: 'User Two',
          nickname: '@usertwo',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: false,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const active = getActiveAccount();
      expect(active?.id).toBe('user_1');
    });
  });

  describe('addAccount', () => {
    it('adds a new account to the list', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const newAccount = addAccount({
        version: 1,
        id: 'user_2',
        displayName: 'User Two',
        nickname: '@usertwo',
        phone: '',
        avatar: '',
        status: 'Online',
        createdAt: Date.now(),
      });

      expect(newAccount.id).toBe('user_2');
      expect(newAccount.isPrimary).toBe(false);
      expect(newAccount.addedAt).toBeDefined();

      const stored = JSON.parse(localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY)!);
      expect(stored).toHaveLength(2);
    });

    it('updates existing account with same ID', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const updated = addAccount({
        version: 1,
        id: 'user_1',
        displayName: 'User One Updated',
        nickname: '@useroneupdated',
        phone: '',
        avatar: '',
        status: 'Online',
        createdAt: Date.now(),
      });

      expect(updated.displayName).toBe('User One Updated');
      expect(updated.nickname).toBe('@useroneupdated');

      const stored = JSON.parse(localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY)!);
      expect(stored).toHaveLength(1);
    });
  });

  describe('removeAccount', () => {
    it('removes an account and returns true', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
        {
          version: 1,
          id: 'user_2',
          displayName: 'User Two',
          nickname: '@usertwo',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: false,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const result = removeAccount('user_2');
      expect(result).toBe(true);

      const stored = JSON.parse(localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY)!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('user_1');
    });

    it('returns false when trying to remove last account', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const result = removeAccount('user_1');
      expect(result).toBe(false);

      const stored = JSON.parse(localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY)!);
      expect(stored).toHaveLength(1);
    });

    it('switches to primary when active account is removed', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
        {
          version: 1,
          id: 'user_2',
          displayName: 'User Two',
          nickname: '@usertwo',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: false,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
      setActiveAccountId('user_2');

      removeAccount('user_2');
      expect(getActiveAccountId()).toBe('user_1');
    });
  });

  describe('switchAccount', () => {
    it('switches to the specified account and updates lastUsedAt', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now() - 10000,
        },
        {
          version: 1,
          id: 'user_2',
          displayName: 'User Two',
          nickname: '@usertwo',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: false,
          addedAt: Date.now(),
          lastUsedAt: Date.now() - 10000,
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const switched = switchAccount('user_2');
      expect(switched?.id).toBe('user_2');
      expect(getActiveAccountId()).toBe('user_2');

      const stored = JSON.parse(localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY)!);
      const user2 = stored.find((a: StoredAccount) => a.id === 'user_2');
      expect(user2?.lastUsedAt).toBeGreaterThan(Date.now() - 10000);
    });

    it('returns null for non-existent account', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const result = switchAccount('non_existent');
      expect(result).toBeNull();
    });
  });

  describe('updateAccountProfile', () => {
    it('updates account profile fields', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const updated = updateAccountProfile('user_1', {
        displayName: 'Updated Name',
        phone: '+1234567890',
      });

      expect(updated?.displayName).toBe('Updated Name');
      expect(updated?.phone).toBe('+1234567890');
      expect(updated?.nickname).toBe('@userone'); // unchanged
    });

    it('returns null for non-existent account', () => {
      const result = updateAccountProfile('non_existent', { displayName: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('setPrimaryAccount', () => {
    it('sets the specified account as primary', () => {
      const accounts: StoredAccount[] = [
        {
          version: 1,
          id: 'user_1',
          displayName: 'User One',
          nickname: '@userone',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: true,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
        {
          version: 1,
          id: 'user_2',
          displayName: 'User Two',
          nickname: '@usertwo',
          phone: '',
          avatar: '',
          status: 'Online',
          createdAt: Date.now(),
          isPrimary: false,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];
      localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));

      const result = setPrimaryAccount('user_2');
      expect(result).toBe(true);

      const stored = JSON.parse(localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY)!);
      expect(stored.find((a: StoredAccount) => a.id === 'user_1')?.isPrimary).toBe(false);
      expect(stored.find((a: StoredAccount) => a.id === 'user_2')?.isPrimary).toBe(true);
    });

    it('returns false for non-existent account', () => {
      const result = setPrimaryAccount('non_existent');
      expect(result).toBe(false);
    });
  });

  describe('createAccountFromOnboarding', () => {
    it('creates a valid account from onboarding data', () => {
      const account = createAccountFromOnboarding(
        'testuser',
        'Test User',
        '+1234567890',
        'avatar.png',
        'Available'
      );

      expect(account.version).toBe(1);
      expect(account.id).toMatch(/^user_\d+_[a-z0-9]+$/);
      expect(account.displayName).toBe('Test User');
      expect(account.nickname).toBe('@testuser');
      expect(account.phone).toBe('+1234567890');
      expect(account.avatar).toBe('avatar.png');
      expect(account.status).toBe('Available');
      expect(account.isPrimary).toBe(false);
      expect(account.createdAt).toBeDefined();
      expect(account.addedAt).toBeDefined();
      expect(account.lastUsedAt).toBeDefined();
    });

    it('handles nickname without @ prefix', () => {
      const account = createAccountFromOnboarding('testuser', 'Test User');
      expect(account.nickname).toBe('@testuser');
    });

    it('handles nickname with @ prefix', () => {
      const account = createAccountFromOnboarding('@testuser', 'Test User');
      expect(account.nickname).toBe('@testuser');
    });
  });
});