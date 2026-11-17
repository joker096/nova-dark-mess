import { describe, it, expect } from 'vitest';
import { decodeFixedPacket, encodeFixedPacket } from './packet';

describe('anon packet fuzz', () => {
  it('never throws an uncaught error on arbitrary bytes', () => {
    for (let i = 0; i < 2000; i++) {
      const length = Math.floor(Math.random() * 70000);
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes.subarray(0, Math.min(length, 65535)));
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
    for (const profile of ['small', 'standard', 'large'] as const) {
      for (let i = 0; i < 20; i++) {
        const maxPayload = { small: 4092, standard: 16380, large: 65532 }[profile];
        const payloadLen = Math.floor(Math.random() * (maxPayload + 1));
        const payload = new Uint8Array(payloadLen);
        crypto.getRandomValues(payload);
        const packet = encodeFixedPacket(payload, profile);
        const decoded = decodeFixedPacket(packet, profile);
        expect(decoded.length).toBe(payloadLen);
        expect(Array.from(decoded)).toEqual(Array.from(payload));
      }
    }
  });
});
