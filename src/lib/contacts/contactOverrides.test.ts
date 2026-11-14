/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONTACT_OVERRIDES_KEY,
  applyContactOverrides,
  loadContactOverrides,
  saveContactOverride,
} from './contactOverrides';
import { CONTACT_PROFILES } from '../../data/mockMessengerData';

const initialProfiles = Object.fromEntries(
  Object.entries(CONTACT_PROFILES).map(([id, profile]) => [id, { ...profile }]),
);

beforeEach(() => {
  localStorage.clear();
  for (const [id, profile] of Object.entries(initialProfiles)) {
    Object.assign(CONTACT_PROFILES[id], profile);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('contactOverrides', () => {
  it('returns an empty map when nothing is stored', () => {
    expect(loadContactOverrides()).toEqual({});
  });

  it('persists patches and merges later edits for the same contact', () => {
    saveContactOverride('katie', { name: 'Katie Updated' });
    saveContactOverride('katie', { nickname: '@k' });

    expect(loadContactOverrides()).toEqual({
      katie: { name: 'Katie Updated', nickname: '@k' },
    });
    expect(JSON.parse(localStorage.getItem(CONTACT_OVERRIDES_KEY)!)).toEqual({
      katie: { name: 'Katie Updated', nickname: '@k' },
    });
  });

  it('keeps overrides for different contacts separate', () => {
    saveContactOverride('katie', { phone: '+1' });
    saveContactOverride('kurt', { phone: '+2' });

    expect(loadContactOverrides()).toEqual({
      katie: { phone: '+1' },
      kurt: { phone: '+2' },
    });
  });

  it('ignores malformed JSON and invalid entries', () => {
    localStorage.setItem(CONTACT_OVERRIDES_KEY, '{not json');
    expect(loadContactOverrides()).toEqual({});

    localStorage.setItem(CONTACT_OVERRIDES_KEY, JSON.stringify(['katie']));
    expect(loadContactOverrides()).toEqual({});

    localStorage.setItem(
      CONTACT_OVERRIDES_KEY,
      JSON.stringify({
        katie: { name: 'Valid', phone: 42, nickname: null, avatar: '' },
        broken: 'nope',
        empty: {},
      }),
    );
    expect(loadContactOverrides()).toEqual({
      katie: { name: 'Valid', avatar: '' },
    });
  });

  it('updates the shared profile object immediately', () => {
    saveContactOverride('katie', { name: 'Synced Katie', avatar: '' });
    expect(CONTACT_PROFILES.katie.name).toBe('Synced Katie');
    expect(CONTACT_PROFILES.katie.avatar).toBe('');
  });

  it('applies all stored overrides to the profile registry', () => {
    localStorage.setItem(
      CONTACT_OVERRIDES_KEY,
      JSON.stringify({
        katie: { nickname: '@stored' },
        kurt: { phone: '+9 999' },
        unknown: { name: 'Ignored' },
      }),
    );

    applyContactOverrides();

    expect(CONTACT_PROFILES.katie.nickname).toBe('@stored');
    expect(CONTACT_PROFILES.kurt.phone).toBe('+9 999');
    expect(CONTACT_PROFILES.unknown).toBeUndefined();
  });

  it('still updates memory when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => saveContactOverride('katie', { name: 'No Storage' })).not.toThrow();
    expect(CONTACT_PROFILES.katie.name).toBe('No Storage');
  });
});
