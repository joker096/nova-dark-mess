import { CONTACT_PROFILES, CURRENT_USER } from '../../data/mockMessengerData';

export const ACCOUNT_STORAGE_KEY = 'nova_account_profile_v1';
export const ACCOUNT_UPDATED_EVENT = 'nova-account-updated';

export interface AccountProfile {
  version: 1;
  id: string;
  displayName: string;
  nickname: string;
  phone: string;
  avatar: string;
  status: string;
  createdAt: number;
}

function defaultAccount(): AccountProfile {
  const profile = CONTACT_PROFILES[CURRENT_USER.id];
  return {
    version: 1,
    id: CURRENT_USER.id,
    displayName: profile?.name || CURRENT_USER.name,
    nickname: profile?.nickname || '@nova',
    phone: profile?.phone || '',
    avatar: profile?.avatar || CURRENT_USER.avatar,
    status: profile?.status || 'Online',
    createdAt: Date.now(),
  };
}

function isAccountProfile(value: unknown): value is AccountProfile {
  if (!value || typeof value !== 'object') return false;
  const account = value as Partial<AccountProfile>;
  return (
    account.version === 1 &&
    typeof account.id === 'string' &&
    typeof account.displayName === 'string' &&
    typeof account.nickname === 'string' &&
    typeof account.phone === 'string' &&
    typeof account.avatar === 'string' &&
    typeof account.status === 'string' &&
    typeof account.createdAt === 'number'
  );
}

export function loadAccount(): AccountProfile {
  const fallback = defaultAccount();
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!isAccountProfile(parsed)) return fallback;
    return { ...fallback, ...parsed, id: fallback.id };
  } catch {
    return fallback;
  }
}

export function saveAccount(account: AccountProfile): AccountProfile {
  const next: AccountProfile = {
    ...account,
    version: 1,
    displayName: account.displayName.trim() || account.nickname || 'Nova user',
    nickname: account.nickname.trim() || '@nova',
  };
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    void 0;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACCOUNT_UPDATED_EVENT));
  }
  return next;
}

export function updateAccount(patch: Partial<AccountProfile>): AccountProfile {
  const current = loadAccount();
  return saveAccount({ ...current, ...patch, version: 1, id: current.id });
}