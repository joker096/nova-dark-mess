/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_STORAGE_KEY,
  ACCOUNT_UPDATED_EVENT,
  loadAccount,
  normalizeNickname,
  saveAccount,
  updateAccount,
} from './account';

describe('account store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns a default local account when nothing is stored', () => {
    const account = loadAccount();
    expect(account.version).toBe(1);
    expect(account.id).toBeTruthy();
    expect(account.displayName).toBe('Nova user');
    expect(account.nickname.startsWith('@')).toBe(true);
    expect(account.phone).toBe('');
  });

  it('normalizes Unicode nicknames without requiring uniqueness', () => {
    expect(normalizeNickname('  @  Мира  🌙  ')).toBe('@Мира 🌙');
  });

  it('persists and reloads updated profile fields', () => {
    const updated = updateAccount({
      displayName: '  Nova Tester  ',
      nickname: '  @nova_tester ',
      phone: '+1 555 0100',
    });

    expect(updated.displayName).toBe('Nova Tester');
    expect(updated.nickname).toBe('@nova_tester');
    expect(loadAccount()).toEqual(updated);
  });

  it('keeps the stable account id even if a stored profile tries to change it', () => {
    const original = loadAccount();
    saveAccount({ ...original, id: 'someone-else' });
    expect(loadAccount().id).toBe(original.id);
  });

  it('falls back to defaults for corrupt storage', () => {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, '{not-json');
    expect(loadAccount().id).toBeTruthy();
    expect(loadAccount().displayName).toBeTruthy();
  });

  it('dispatches an update event when the profile is saved', () => {
    const listener = vi.fn();
    window.addEventListener(ACCOUNT_UPDATED_EVENT, listener);
    updateAccount({ displayName: 'Event User' });
    window.removeEventListener(ACCOUNT_UPDATED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('surfaces storage failures instead of reporting a successful save', () => {
    const account = loadAccount();
    const storageError = new Error('storage is unavailable');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw storageError;
    });

    expect(() => saveAccount(account)).toThrow(storageError);
  });
});