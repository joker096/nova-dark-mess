import { describe, it, expect } from 'vitest';
import { decodeFixedPacket, encodeFixedPacket } from './packet';

/**
 * Deterministic PRNG (mulberry32). The fuzzers must reproduce byte-for-byte on
 * every run so a failure can be replayed instead of hunting a lucky seed.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes(length: number, random: () => number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(random() * 256);
  return bytes;
}

describe('anon packet fuzz', () => {
  it('never throws an uncaught error on arbitrary bytes', () => {
    const random = seededRandom(0x5eed);
    for (let i = 0; i < 2000; i++) {
      const length = Math.floor(random() * 70000);
      const bytes = randomBytes(length, random);
      try {
        decodeFixedPacket(bytes);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    }
  });

  it('rejects length prefixes larger than the packet', () => {
    const packet = new Uint8Array(4096);
    const view = new DataView(packet.buffer);
    view.setUint32(0, 4096, false); // 4 > available (4092)
    expect(() => decodeFixedPacket(packet, 'standard')).toThrow();
  });

  it('round-trips random payloads of every legal size', () => {
    const random = seededRandom(0xf11e);
    for (const profile of ['small', 'standard', 'large'] as const) {
      for (let i = 0; i < 20; i++) {
        const maxPayload = { small: 4092, standard: 16380, large: 65532 }[profile];
        const payloadLen = Math.floor(random() * (maxPayload + 1));
        const payload = randomBytes(payloadLen, random);
        const packet = encodeFixedPacket(payload, profile);
        const decoded = decodeFixedPacket(packet, profile);
        expect(decoded.length).toBe(payloadLen);
        expect(Array.from(decoded)).toEqual(Array.from(payload));
      }
    }
  });
});
