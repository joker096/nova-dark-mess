import { useCallback, useEffect, useState } from 'react';
import {
  ACCOUNT_UPDATED_EVENT,
  AccountProfile,
  loadAccount,
  updateAccount,
} from '../lib/account/account';

export function useAccount(): {
  account: AccountProfile;
  updateAccount: (patch: Partial<AccountProfile>) => AccountProfile;
} {
  const [account, setAccount] = useState<AccountProfile>(loadAccount);

  useEffect(() => {
    const refresh = () => setAccount(loadAccount());
    window.addEventListener(ACCOUNT_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ACCOUNT_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const update = useCallback((patch: Partial<AccountProfile>) => {
    const next = updateAccount(patch);
    setAccount(next);
    return next;
  }, []);

  return { account, updateAccount: update };
}