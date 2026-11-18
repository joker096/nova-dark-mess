/// <reference types="vitest/globals" />

import { describe, expect, it } from 'vitest';
import { secureWipe, secureWipeMessage, wipeExpiredMessages } from './secureWipe';

describe('secureWipe', () => {
  it('clears nested arrays and byte views in place', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const buffer = new Uint8Array([4, 5]).buffer;
    const nested = { text: 'secret' };
    const payload = { items: [nested], bytes, buffer };

    secureWipe(payload);

    expect(payload.items).toHaveLength(0);
    expect(nested.text).toBe('');
    expect(bytes).toEqual(new Uint8Array([0, 0, 0]));
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([0, 0]));
  });

  it('wipes message content while preserving identity and lifecycle metadata', () => {
    const message = {
      id: 'm1',
      senderId: 'me',
      text: 'secret',
      images: ['data:image/png;base64,secret'],
      document: { name: 'secret.pdf', payload: new Uint8Array([5, 6]) },
      time: '12:00',
      expiresAt: 10,
    };
    const document = message.document;

    expect(secureWipeMessage(message)).toBe(message);
    expect(message).toMatchObject({
      id: 'm1',
      senderId: 'me',
      time: '12:00',
      expiresAt: 10,
      wiped: true,
    });
    expect(message.text).toBeUndefined();
    expect(message.images).toBeUndefined();
    expect(document.name).toBe('');
    expect(document.payload).toEqual(new Uint8Array([0, 0]));
  });

  it('does not reintroduce an expired message when purging', () => {
    const expired = { id: 'old', text: 'secret', expiresAt: 5 };
    const active = { id: 'active', text: 'keep', expiresAt: 10 };

    expect(wipeExpiredMessages([expired, active], 7)).toEqual([active]);
    expect(expired).toMatchObject({ id: 'old', wiped: true });
    expect(expired.text).toBeUndefined();
  });
});
