import { useState, useEffect } from 'react';
import { AccountProfile, loadAccount } from './account';

export const MULTI_ACCOUNT_STORAGE_KEY = 'nova_multi_accounts_v1';
export const ACTIVE_ACCOUNT_KEY = 'nova_active_account_id';

export interface StoredAccount extends AccountProfile {
  isPrimary: boolean;
  addedAt: number;
  lastUsedAt: number;
}

export function loadAllAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(MULTI_ACCOUNT_STORAGE_KEY);
    if (!raw) {
      const primary = loadAccount();
      return [{
        ...primary,
        isPrimary: true,
        addedAt: primary.createdAt,
        lastUsedAt: Date.now(),
      }];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((acc: any) => ({
      ...acc,
      version: 1,
      isPrimary: acc.isPrimary ?? false,
      addedAt: acc.addedAt ?? acc.createdAt,
      lastUsedAt: acc.lastUsedAt ?? Date.now(),
    }));
  } catch {
    const primary = loadAccount();
    return [{
      ...primary,
      isPrimary: true,
      addedAt: primary.createdAt,
      lastUsedAt: Date.now(),
    }];
  }
}

export function saveAllAccounts(accounts: StoredAccount[]): void {
  try {
    localStorage.setItem(MULTI_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nova-accounts-updated'));
    }
  } catch (error) {
    console.error('multi-account: failed to persist accounts', error);
    throw error;
  }
}

export function getActiveAccountId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export function setActiveAccountId(accountId: string): void {
  try {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nova-active-account-changed', { detail: accountId }));
    }
  } catch {
    // ignore
  }
}

export function getActiveAccount(): StoredAccount | null {
  const activeId = getActiveAccountId();
  const accounts = loadAllAccounts();
  if (activeId) {
    const found = accounts.find(a => a.id === activeId);
    if (found) return found;
  }
  // Fallback to primary or first
  return accounts.find(a => a.isPrimary) ?? accounts[0] ?? null;
}

export function addAccount(account: Omit<StoredAccount, 'isPrimary' | 'addedAt' | 'lastUsedAt'>): StoredAccount {
  const accounts = loadAllAccounts();
  const newAccount: StoredAccount = {
    ...account,
    isPrimary: false,
    addedAt: Date.now(),
    lastUsedAt: Date.now(),
  };
  // Check for duplicate ID
  const existingIndex = accounts.findIndex(a => a.id === newAccount.id);
  if (existingIndex >= 0) {
    accounts[existingIndex] = newAccount;
  } else {
    accounts.push(newAccount);
  }
  saveAllAccounts(accounts);
  return newAccount;
}

export function removeAccount(accountId: string): boolean {
  const accounts = loadAllAccounts();
  const filtered = accounts.filter(a => a.id !== accountId);
  if (filtered.length === accounts.length) return false;
  if (filtered.length === 0) return false; // Never remove last account
  saveAllAccounts(filtered);
  
  // If we removed the active account, switch to primary
  const activeId = getActiveAccountId();
  if (activeId === accountId) {
    const primary = filtered.find(a => a.isPrimary) ?? filtered[0];
    if (primary) setActiveAccountId(primary.id);
  }
  return true;
}

export function switchAccount(accountId: string): StoredAccount | null {
  const accounts = loadAllAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return null;
  
  setActiveAccountId(accountId);
  
  // Update last used
  const updated = accounts.map(a => 
    a.id === accountId ? { ...a, lastUsedAt: Date.now() } : a
  );
  saveAllAccounts(updated);
  
  return account;
}

export function updateAccountProfile(accountId: string, patch: Partial<AccountProfile>): StoredAccount | null {
  const accounts = loadAllAccounts();
  const index = accounts.findIndex(a => a.id === accountId);
  if (index < 0) return null;
  
  const updated = { ...accounts[index], ...patch, version: 1 as const, id: accounts[index].id };
  accounts[index] = updated;
  saveAllAccounts(accounts);
  return updated;
}

export function setPrimaryAccount(accountId: string): boolean {
  const accounts = loadAllAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return false;
  
  const updated = accounts.map(a => ({
    ...a,
    isPrimary: a.id === accountId,
    version: 1 as const,
  }));
  saveAllAccounts(updated);
  return true;
}

export function createAccountFromOnboarding(
  nickname: string,
  displayName: string,
  phone: string = '',
  avatar: string = '',
  status: string = 'Online'
): StoredAccount {
  return {
    version: 1,
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    displayName: displayName || nickname,
    nickname: nickname.startsWith('@') ? nickname : `@${nickname}`,
    phone,
    avatar,
    status,
    createdAt: Date.now(),
    isPrimary: false,
    addedAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}

export const ACCOUNTS_UPDATED_EVENT = 'nova-accounts-updated';
export const ACTIVE_ACCOUNT_CHANGED_EVENT = 'nova-active-account-changed';

export function useAccounts(): {
  accounts: StoredAccount[];
  activeAccount: StoredAccount | null;
  addAccount: (acc: Omit<StoredAccount, 'isPrimary' | 'addedAt' | 'lastUsedAt'>) => StoredAccount;
  removeAccount: (id: string) => boolean;
  switchAccount: (id: string) => StoredAccount | null;
  updateAccount: (id: string, patch: Partial<AccountProfile>) => StoredAccount | null;
  setPrimary: (id: string) => boolean;
} {
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => loadAllAccounts());
  const [activeAccount, setActiveAccount] = useState<StoredAccount | null>(() => getActiveAccount());

  useEffect(() => {
    const refresh = () => {
      setAccounts(loadAllAccounts());
      setActiveAccount(getActiveAccount());
    };
    window.addEventListener(ACCOUNTS_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_ACCOUNT_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ACCOUNTS_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_ACCOUNT_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return {
    accounts,
    activeAccount,
    addAccount,
    removeAccount,
    switchAccount,
    updateAccount: updateAccountProfile,
    setPrimary: setPrimaryAccount,
  };
}