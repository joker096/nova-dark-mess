import { CURRENT_USER } from '../../data/mockMessengerData';

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
  return {
    version: 1,
    id: CURRENT_USER.id,
    displayName: 'Nova user',
    nickname: '@nova',
    phone: '',
    avatar: '',
    status: 'Online',
    createdAt: Date.now(),
  };
}

export function normalizeNickname(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/\p{Cc}/gu, '')
    .trim()
    .replace(/^@+/u, '')
    .trim()
    .replace(/\s+/gu, ' ');
  const length = Array.from(cleaned).length;

  if (!cleaned || length > 32) {
    throw new Error('Choose a nickname with 1 to 32 characters.');
  }

  return `@${cleaned}`;
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
  const nickname = normalizeNickname(account.nickname);
  const next: AccountProfile = {
    ...account,
    version: 1,
    displayName: account.displayName.trim() || nickname.slice(1),
    nickname,
    phone: account.phone.trim(),
  };
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('account: failed to persist profile', error);
    throw error;
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