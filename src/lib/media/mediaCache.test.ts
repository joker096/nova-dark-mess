/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { createMediaCache, type MediaCache } from './mediaCache';

function bytes(n: number): Uint8Array {
  return new Uint8Array(n).fill(n % 256);
}

describe('createMediaCache', () => {
  it('stores and retrieves an entry', () => {
    const cache = createMediaCache();
    const data = bytes(16);
    cache.set('a', data, 'image/png');
    const entry = cache.get('a');
    expect(entry).not.toBeNull();
    expect(entry!.data).toEqual(data);
    expect(entry!.mime).toBe('image/png');
    expect(entry!.size).toBe(16);
  });

  it('returns null for missing keys', () => {
    const cache = createMediaCache();
    expect(cache.get('missing')).toBeNull();
  });

  it('overwrites an existing entry', () => {
    const cache = createMediaCache();
    cache.set('a', bytes(16), 'image/png');
    const updated = bytes(32);
    cache.set('a', updated, 'image/jpeg');
    const entry = cache.get('a');
    expect(entry!.data).toEqual(updated);
    expect(entry!.mime).toBe('image/jpeg');
    expect(entry!.size).toBe(32);
  });

  it('evicts LRU entries when maxEntries is exceeded', () => {
    const cache = createMediaCache({ maxEntries: 3 });
    cache.set('a', bytes(10), 'image/png');
    cache.set('b', bytes(10), 'image/png');
    cache.set('c', bytes(10), 'image/png');
    // 'a' is LRU (never accessed).

    cache.set('d', bytes(10), 'image/png'); // evicts 'a'
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('promotes accessed entries to MRU', () => {
    const cache = createMediaCache({ maxEntries: 3 });
    cache.set('a', bytes(10), 'image/png');
    cache.set('b', bytes(10), 'image/png');
    cache.set('c', bytes(10), 'image/png');
    // Access 'a' to make it MRU.
    cache.get('a');

    cache.set('d', bytes(10), 'image/png'); // evicts 'b' (LRU)
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('evicts by byte cap', () => {
    const cache = createMediaCache({ maxEntries: 100, maxBytes: 50 });
    cache.set('a', bytes(20), 'image/png');
    cache.set('b', bytes(20), 'image/png'); // total 40
    cache.set('c', bytes(20), 'image/png'); // total 60 > 50, evicts 'a' (20 -> 40)
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.byteSize()).toBeLessThanOrEqual(50);
  });

  it('tracks entry count and byte size', () => {
    const cache = createMediaCache();
    cache.set('a', bytes(100), 'image/png');
    cache.set('b', bytes(200), 'image/png');
    expect(cache.size()).toBe(2);
    expect(cache.byteSize()).toBe(300);
  });

  it('remove deletes an entry and updates byte size', () => {
    const cache = createMediaCache();
    cache.set('a', bytes(100), 'image/png');
    expect(cache.byteSize()).toBe(100);
    cache.remove('a');
    expect(cache.has('a')).toBe(false);
    expect(cache.byteSize()).toBe(0);
  });

  it('clear removes all entries', () => {
    const cache = createMediaCache();
    cache.set('a', bytes(100), 'image/png');
    cache.set('b', bytes(200), 'image/png');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.byteSize()).toBe(0);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('keys returns LRU-to-MRU order', () => {
    const cache = createMediaCache();
    cache.set('a', bytes(10), 'image/png');
    cache.set('b', bytes(10), 'image/png');
    cache.set('c', bytes(10), 'image/png');
    expect(cache.keys()).toEqual(['a', 'b', 'c']);
    // Access 'a' to make it MRU.
    cache.get('a');
    expect(cache.keys()).toEqual(['b', 'c', 'a']);
  });

  it('default maxEntries and maxBytes', () => {
    const cache = createMediaCache();
    expect(cache.maxEntries).toBe(100);
    expect(cache.maxBytes).toBe(20 * 1024 * 1024);
  });
});

describe('createMediaCache single large entry', () => {
  it('stores a single entry larger than maxBytes', () => {
    const cache = createMediaCache({ maxEntries: 10, maxBytes: 50 });
    const big = bytes(200);
    cache.set('big', big, 'image/png');
    expect(cache.has('big')).toBe(true);
    expect(cache.size()).toBe(1);
    expect(cache.byteSize()).toBe(200);
  });
});
