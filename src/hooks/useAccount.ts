import { useCallback, useEffect, useState } from 'react';
import {
  ACCOUNT_UPDATED_EVENT,
  AccountProfile,
  loadAccount,
  updateAccount,
} from '../lib/account/account';
import {
  getActiveAccount,
  switchAccount as switchAccountFn,
  addAccount as addAccountFn,
  removeAccount as removeAccountFn,
  ACCOUNTS_UPDATED_EVENT,
  ACTIVE_ACCOUNT_CHANGED_EVENT,
  StoredAccount,
  loadAllAccounts,
  updateAccountProfile,
} from '../lib/account/multiAccount';

export function useAccount(): {
  account: AccountProfile;
  updateAccount: (patch: Partial<AccountProfile>) => AccountProfile;
  accounts: StoredAccount[];
  activeAccount: StoredAccount | null;
  switchAccount: (id: string) => StoredAccount | null;
  addAccount: (acc: Omit<StoredAccount, 'isPrimary' | 'addedAt' | 'lastUsedAt'>) => StoredAccount;
  removeAccount: (id: string) => boolean;
} {
  const [account, setAccount] = useState<AccountProfile>(() => getActiveAccount() ?? loadAccount());
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => loadAllAccounts());
  const [activeAccount, setActiveAccount] = useState<StoredAccount | null>(() => getActiveAccount());

  useEffect(() => {
    const refresh = () => {
      const active = getActiveAccount();
      setAccount(active ?? loadAccount());
      setActiveAccount(active);
      setAccounts(loadAllAccounts());
    };
    window.addEventListener(ACCOUNT_UPDATED_EVENT, refresh);
    window.addEventListener(ACCOUNTS_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_ACCOUNT_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ACCOUNT_UPDATED_EVENT, refresh);
      window.removeEventListener(ACCOUNTS_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_ACCOUNT_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const update = useCallback((patch: Partial<AccountProfile>) => {
    const active = getActiveAccount();
    if (!active) return updateAccount(patch);
    const next = updateAccountProfile(active.id, patch);
    if (next) {
      setAccount(next);
      setActiveAccount(next);
    }
    return next ?? updateAccount(patch);
  }, []);

  const switchAccount = useCallback((id: string) => {
    const next = switchAccountFn(id);
    if (next) {
      setAccount(next);
      setActiveAccount(next);
    }
    return next;
  }, []);

  const addAccount = useCallback((acc: Omit<StoredAccount, 'isPrimary' | 'addedAt' | 'lastUsedAt'>) => {
    const next = addAccountFn(acc);
    setAccounts(loadAllAccounts());
    return next;
  }, []);

  const removeAccount = useCallback((id: string) => {
    const result = removeAccountFn(id);
    if (result) {
      setAccounts(loadAllAccounts());
      const active = getActiveAccount();
      setAccount(active ?? loadAccount());
      setActiveAccount(active);
    }
    return result;
  }, []);

  return { account, updateAccount: update, accounts, activeAccount, switchAccount, addAccount, removeAccount };
}