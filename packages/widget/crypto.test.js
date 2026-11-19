import { describe, it, expect } from 'vitest';
import {
  b64u,
  fromB64u,
  ab2str,
  str2ab,
  generateGuestKeys,
  powDigest,
  leadingZeroBits,
  solvePow,
  encryptMessage,
  decryptMessage,
} from './crypto.js';

describe('base64url round-trip', () => {
  it('encodes and decodes back to original bytes', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64, 32, 16]);
    const encoded = b64u(original);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toMatch(/=+$/);
    const decoded = fromB64u(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('ab2str / str2ab round-trip', () => {
    const text = 'привет hello 世界';
    expect(ab2str(str2ab(text))).toBe(text);
  });
});

describe('generateGuestKeys', () => {
  it('produces 32-byte secret and public keys', async () => {
    const { priv, pub } = await generateGuestKeys();
    expect(priv).toBeInstanceOf(Uint8Array);
    expect(pub).toBeInstanceOf(Uint8Array);
    expect(priv.length).toBe(32);
    expect(pub.length).toBe(32);
    // two calls should differ
    const { priv: priv2 } = await generateGuestKeys();
    expect(Array.from(priv)).not.toEqual(Array.from(priv2));
  });
});

describe('powDigest', () => {
  it('is deterministic for same input', async () => {
    const challenge = new Uint8Array([1, 2, 3, 4]);
    const h1 = await powDigest(challenge, 42n);
    const h2 = await powDigest(challenge, 42n);
    expect(Array.from(h1)).toEqual(Array.from(h2));
  });

  it('returns 32-byte SHA-256 digest', async () => {
    const challenge = new Uint8Array([]);
    const h = await powDigest(challenge, 0n);
    expect(h.length).toBe(32);
  });
});

describe('leadingZeroBits', () => {
  it('counts leading zero bits correctly', () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0]))).toBe(24);
    expect(leadingZeroBits(new Uint8Array([0x80, 0, 0]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0x40, 0, 0]))).toBe(1);
    expect(leadingZeroBits(new Uint8Array([0, 0x80, 0]))).toBe(8);
  });
});

describe('solvePow', () => {
  it('finds nonce meeting difficulty', async () => {
    const challenge = new Uint8Array([1, 2, 3, 4, 5]);
    const { nonce, digest } = await solvePow(challenge, 4);
    expect(typeof nonce).toBe('number');
    expect(nonce).toBeGreaterThanOrEqual(0);
    // verify: leadingZeroBits(digest) >= 4
    const { leadingZeroBits: lzb } = await import('./crypto.js');
    expect(lzb(fromB64u(digest))).toBeGreaterThanOrEqual(4);
  });

  it('difficulty 0 returns immediately', async () => {
    const start = Date.now();
    const { nonce } = await solvePow(new Uint8Array([1]), 0);
    expect(nonce).toBe(0);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('encryptMessage / decryptMessage round-trip', () => {
  const threadId = 'test-thread-123';

  it('encrypts and decrypts back to original plaintext', async () => {
    const { priv, pub } = await generateGuestKeys();
    const peerPub = b64u(pub);
    const plaintext = 'секретное сообщение secret';

    const enc = await encryptMessage(plaintext, peerPub, threadId);
    expect(enc.ciphertext).toBeTypeOf('string');
    expect(enc.nonce).toBeTypeOf('string');
    expect(enc.ephemeral_pubkey).toBeTypeOf('string');

    const decrypted = await decryptMessage(enc.ciphertext, enc.nonce, enc.ephemeral_pubkey, priv, threadId);
    expect(decrypted).toBe(plaintext);
  });

  it('fails to decrypt with wrong private key', async () => {
    const { priv, pub } = await generateGuestKeys();
    const { priv: wrongPriv } = await generateGuestKeys();
    const enc = await encryptMessage('hello', b64u(pub), threadId);
    await expect(decryptMessage(enc.ciphertext, enc.nonce, enc.ephemeral_pubkey, wrongPriv, threadId)).rejects.toThrow();
  });

  it('fails to decrypt with wrong threadId (different info)', async () => {
    const { priv, pub } = await generateGuestKeys();
    const enc = await encryptMessage('hello', b64u(pub), 'thread-A');
    await expect(decryptMessage(enc.ciphertext, enc.nonce, enc.ephemeral_pubkey, priv, 'thread-B')).rejects.toThrow();
  });
});
