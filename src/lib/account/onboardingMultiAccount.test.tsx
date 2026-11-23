/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  loadAllAccounts, 
  getActiveAccount, 
  getActiveAccountId,
  setActiveAccountId,
  MULTI_ACCOUNT_STORAGE_KEY, 
  ACTIVE_ACCOUNT_KEY,
  addAccount,
  switchAccount,
  removeAccount,
  updateAccountProfile,
  setPrimaryAccount,
  createAccountFromOnboarding,
} from './multiAccount';

describe('multi-account core functionality', () => {
  beforeEach(() => {
    localStorage.clear();
    // Remove legacy account storage to prevent fallback
    localStorage.removeItem('nova_account_profile_v1');
    vi.clearAllMocks();
  });

  it('creates first account and sets as active', () => {
    // Initialize empty multi-account storage to prevent default account creation
    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, '[]');
    localStorage.removeItem('nova_account_profile_v1');
    
    const account = createAccountFromOnboarding('testuser', 'Test User');
    addAccount(account);
    
    const accounts = loadAllAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].nickname).toBe('@testuser');
    
    // Verify it can be switched to
    switchAccount(account.id);
    expect(getActiveAccountId()).toBe(account.id);
    expect(getActiveAccount()?.id).toBe(account.id);
  });

  it('adds second account without removing first', () => {
    // Initialize empty multi-account storage to prevent default account creation
    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, '[]');
    localStorage.removeItem('nova_account_profile_v1');
    
    // Create first account
    const account1 = createAccountFromOnboarding('user1', 'User One');
    addAccount(account1);
    
    // Create second account
    const account2 = createAccountFromOnboarding('user2', 'User Two');
    addAccount(account2);
    
    const accounts = loadAllAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts.map(a => a.nickname).sort()).toEqual(['@user1', '@user2']);
  });

  it('switches active account and updates lastUsedAt', () => {
    // Initialize empty multi-account storage
    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, '[]');
    localStorage.removeItem('nova_account_profile_v1');
    
    const account1 = createAccountFromOnboarding('user1', 'User One');
    addAccount(account1);
    const account2 = createAccountFromOnboarding('user2', 'User Two');
    addAccount(account2);
    
    // Switch to account2
    switchAccount(account2.id);
    expect(getActiveAccountId()).toBe(account2.id);
    
    // Verify lastUsedAt updated
    const accounts = loadAllAccounts();
    const acc2 = accounts.find(a => a.id === account2.id);
    expect(acc2?.lastUsedAt).toBeGreaterThan(Date.now() - 1000);
  });

  it('removes account and switches to primary', () => {
    const account1 = createAccountFromOnboarding('user1', 'User One');
    addAccount(account1);
    const account2 = createAccountFromOnboarding('user2', 'User Two');
    addAccount(account2);
    
    // Make account1 primary
    account1.isPrimary = true;
    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify([account1, account2]));
    
    // Set account2 as active
    setActiveAccountId(account2.id);
    
    // Remove account2
    const result = removeAccount(account2.id);
    expect(result).toBe(true);
    
    // Should switch to primary (account1)
    expect(getActiveAccountId()).toBe(account1.id);
    expect(loadAllAccounts()).toHaveLength(1);
  });

  it('prevents removing last account', () => {
    // Initialize with only one account in multi-account storage
    const account1 = createAccountFromOnboarding('user1', 'User One');
    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify([{
      ...account1,
      isPrimary: true,
      addedAt: account1.createdAt,
      lastUsedAt: Date.now(),
    }]));
    
    const result = removeAccount(account1.id);
    expect(result).toBe(false);
    expect(loadAllAccounts()).toHaveLength(1);
  });

  it('updates account profile', () => {
    // Initialize multi-account storage
    const account = createAccountFromOnboarding('user1', 'User One');
    addAccount(account);
    
    const updated = updateAccountProfile(account.id, { displayName: 'Updated Name', phone: '+123' });
    expect(updated?.displayName).toBe('Updated Name');
    expect(updated?.phone).toBe('+123');
    
    const accounts = loadAllAccounts();
    const targetAccount = accounts.find(a => a.id === account.id);
    expect(targetAccount?.displayName).toBe('Updated Name');
  });

  it('sets primary account', () => {
    const account1 = createAccountFromOnboarding('user1', 'User One');
    addAccount(account1);
    const account2 = createAccountFromOnboarding('user2', 'User Two');
    addAccount(account2);
    
    expect(setPrimaryAccount(account2.id)).toBe(true);
    
    const accounts = loadAllAccounts();
    expect(accounts.find(a => a.id === account1.id)?.isPrimary).toBe(false);
    expect(accounts.find(a => a.id === account2.id)?.isPrimary).toBe(true);
  });

  it('handles nickname with and without @ prefix', () => {
    const account1 = createAccountFromOnboarding('testuser', 'Test User');
    expect(account1.nickname).toBe('@testuser');
    
    const account2 = createAccountFromOnboarding('@testuser', 'Test User');
    expect(account2.nickname).toBe('@testuser');
  });
});