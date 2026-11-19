/**
 * Tests for src/lib/bots/miniApp.ts (Phase B7 — Mini Apps).
 */

import { describe, it, expect } from 'vitest';
import {
  createInitData,
  verifyInitData,
  serializeInitData,
  parseInitDataString,
  iframeOrigin,
  DEFAULT_THEME_PARAMS,
} from './miniApp';

describe('createInitData / verifyInitData', () => {
  const secret = 'bot-secret-key';

  it('signs and verifies init data', () => {
    const data = createInitData('echo_bot', 'user_1', secret);
    expect(data.bot_id).toBe('echo_bot');
    expect(data.user_id).toBe('user_1');
    expect(typeof data.auth_date).toBe('number');
    expect(typeof data.hash).toBe('string');
    expect(data.hash.length).toBe(64); // SHA-256 hex

    const verified = verifyInitData(serializeInitData(data), secret);
    expect(verified).not.toBeNull();
    expect(verified!.bot_id).toBe('echo_bot');
    expect(verified!.user_id).toBe('user_1');
  });

  it('rejects tampered hash', () => {
    const data = createInitData('echo_bot', 'user_1', secret);
    const tampered = serializeInitData({ ...data, hash: '0'.repeat(64) });
    expect(verifyInitData(tampered, secret)).toBeNull();
  });

  it('rejects wrong secret', () => {
    const data = createInitData('echo_bot', 'user_1', 'secret-a');
    expect(verifyInitData(serializeInitData(data), 'secret-b')).toBeNull();
  });

  it('rejects expired init data', () => {
    const old = createInitData('echo_bot', 'user_1', secret, Math.floor(Date.now() / 1000) - 100);
    expect(verifyInitData(serializeInitData(old), secret, 60)).toBeNull();
  });

  it('rejects malformed init data', () => {
    expect(parseInitDataString('not-a-query-string')).toBeNull();
    expect(parseInitDataString('bot_id=x')).toBeNull();
    expect(verifyInitData('garbage', secret)).toBeNull();
  });
});

describe('serializeInitData / parseInitDataString', () => {
  it('round-trips', () => {
    const payload = { bot_id: 'b', user_id: 'u', auth_date: 123, hash: 'abc' };
    expect(parseInitDataString(serializeInitData(payload))).toEqual(payload);
  });
});

describe('iframeOrigin', () => {
  it('accepts https origins', () => {
    expect(iframeOrigin('https://example.com/app')).toBe('https://example.com');
  });

  it('rejects non-https', () => {
    expect(iframeOrigin('http://example.com/app')).toBeNull();
    expect(iframeOrigin('ftp://example.com/app')).toBeNull();
    expect(iframeOrigin('not-a-url')).toBeNull();
  });
});

describe('DEFAULT_THEME_PARAMS', () => {
  it('has all fields', () => {
    expect(DEFAULT_THEME_PARAMS.bg_color).toBeDefined();
    expect(DEFAULT_THEME_PARAMS.text_color).toBeDefined();
    expect(DEFAULT_THEME_PARAMS.button_color).toBe('#ff4e18');
  });
});
