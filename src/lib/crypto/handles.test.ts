/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import { deriveShortId, createHandle, parseHandle, isValidHandle } from './handles';

describe('handles', () => {
  it('derives a stable short id', () => {
    const key = btoa('public-key-bytes');
    const a = deriveShortId(key);
    const b = deriveShortId(key);
    expect(a).toBe(b);
    expect(a).toHaveLength(12);
  });

  it('creates and parses a handle', () => {
    const key = btoa('public-key-bytes');
    const h = createHandle(key, 'Alice');
    expect(h.handle).toBe(`nova://${h.shortId}`);
    expect(isValidHandle(h.handle)).toBe(true);
    const parsed = parseHandle(`${h.handle} Alice`);
    expect(parsed?.shortId).toBe(h.shortId);
    expect(parsed?.displayName).toBe('Alice');
  });

  it('rejects invalid handles', () => {
    expect(isValidHandle('https://example.com')).toBe(false);
    expect(parseHandle('nova://zzzz')).toBeNull();
  });
});
