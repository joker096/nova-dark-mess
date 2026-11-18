import { describe, it, expect } from 'vitest';
import {
  encodeFixedPacket,
  decodeFixedPacket,
  encodeFixedFileChunks,
  decodeFixedFileChunks,
  profileSize,
} from './packet';
import { generateQueueId, generateQueueToken } from './ids';

function pattern(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => index & 0xff);
}

function fillPattern(bytes: Uint8Array) {
  for (let index = 0; index < bytes.length; index++) bytes[index] = index & 0xff;
}

const GOLDEN_SHA = [
  'd6','5e','80','49','e9','86','74','a3','4c','1c','f5','a4','b7','d6','1a','6a',
  'c4','59','53','15','35','72','69','69','2c','18','c1','c2','36','81','d6','0d',
].join('');

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

describe('golden vectors', () => {
  it('queue id and token encoding are stable', () => {
    expect(generateQueueId(pattern)).toBe('q_000102030405060708090a0b0c0d0e0f');
    const tokenBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const expectedToken = btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(generateQueueToken(pattern)).toBe(expectedToken);
  });

  it('small-profile packet matches the pinned vector', async () => {
    const packet = encodeFixedPacket(new TextEncoder().encode('golden'), 'small', fillPattern);
    expect(packet.length).toBe(profileSize('small'));
    // 4-byte big-endian length, payload, then deterministic padding.
    expect(Array.from(packet.subarray(0, 16))).toEqual([
      0, 0, 0, 6, 0x67, 0x6f, 0x6c, 0x64, 0x65, 0x6e, 0, 1, 2, 3, 4, 5,
    ]);
    expect(await sha256Hex(packet)).toBe(GOLDEN_SHA);
    expect(new TextDecoder().decode(decodeFixedPacket(packet, 'small'))).toBe('golden');
  });

  it('file chunking uses the profile size and round-trips', () => {
    const chunkSize = profileSize('small') - 4;
    const file = pattern(chunkSize + 5);
    const chunks = encodeFixedFileChunks(file, 'small');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].packet.length).toBe(profileSize('small'));
    expect(chunks[1].packet.length).toBe(profileSize('small'));
    expect(chunks.map((chunk) => chunk.total)).toEqual([2, 2]);
    expect(decodeFixedFileChunks(chunks, 'small')).toEqual(file);
  });

  it('rejects out-of-profile payloads', () => {
    expect(() => encodeFixedPacket(new Uint8Array(profileSize('small') - 3), 'small')).toThrow();
  });
});
