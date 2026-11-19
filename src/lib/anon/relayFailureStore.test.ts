import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadFailureMap,
  saveFailureMap,
  clearFailureMap,
} from './relayFailureStore';

function clearStorage(): void {
  try {
    localStorage.removeItem('anon_relay_failures_v1');
  } catch {
    /* ignore */
  }
}

describe('relayFailureStore', () => {
  beforeEach(() => {
    clearStorage();
  });

  afterEach(() => {
    clearStorage();
  });

  it('loads empty map when nothing stored', () => {
    expect(loadFailureMap()).toEqual({});
  });

  it('saves and loads failure map', () => {
    saveFailureMap({ 'https://r1.example': 2, 'https://r2.example': 1 });
    expect(loadFailureMap()).toEqual({ 'https://r1.example': 2, 'https://r2.example': 1 });
  });

  it('clears failure map', () => {
    saveFailureMap({ 'https://r1.example': 3 });
    clearFailureMap();
    expect(loadFailureMap()).toEqual({});
  });

  it('ignores corrupted storage', () => {
    try {
      localStorage.setItem('anon_relay_failures_v1', '{not json');
    } catch {
      /* ignore */
    }
    expect(loadFailureMap()).toEqual({});
  });

  it('ignores non-object storage', () => {
    try {
      localStorage.setItem('anon_relay_failures_v1', JSON.stringify([1, 2, 3]));
    } catch {
      /* ignore */
    }
    expect(loadFailureMap()).toEqual({});
  });

  it('filters invalid entries', () => {
    try {
      localStorage.setItem(
        'anon_relay_failures_v1',
        JSON.stringify({
          'https://r1.example': 2,
          'https://bad.example': 'not-a-number',
          'https://neg.example': -1,
          'https://inf.example': Infinity,
        }),
      );
    } catch {
      /* ignore */
    }
    expect(loadFailureMap()).toEqual({ 'https://r1.example': 2 });
  });

  it('does not throw when localStorage unavailable', () => {
    const original = globalThis.localStorage;
    // @ts-ignore
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => loadFailureMap()).not.toThrow();
    expect(() => saveFailureMap({})).not.toThrow();
    expect(() => clearFailureMap()).not.toThrow();
    // @ts-ignore
    globalThis.localStorage = original;
  });
});
