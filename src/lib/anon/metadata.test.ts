import { describe, it, expect } from 'vitest';
import { ANON_PACKET_PROFILES, type PacketProfile } from './types';
import {
  decodeFixedFileChunks,
  decodeFixedPacket,
  encodeFixedFileChunks,
  encodeFixedPacket,
  profileSize,
} from './packet';

const PROFILES: PacketProfile[] = ['small', 'standard', 'large'];

/**
 * Metadata audit: every relay-bound packet must have exactly one of the fixed
 * profile sizes, regardless of its plaintext length. This is the core traffic
 * analysis resistance property of Phase D.
 */
describe('anon metadata audit', () => {
  it.each(PROFILES)('every packet has the exact %s profile size', (profile) => {
    const expected = profileSize(profile);
    const cases = [
      new TextEncoder().encode('a'),
      new TextEncoder().encode('a much longer message that still fits'),
      new TextEncoder().encode(
        JSON.stringify({ type: 'receipt', queueId: 'q_abc', packetId: 'p_xyz' }),
      ),
      new TextEncoder().encode(
        JSON.stringify({ type: 'typing', active: true, queueId: 'q_abc' }),
      ),
      new TextEncoder().encode(JSON.stringify({ type: 'ack', packetIds: ['p_1', 'p_2'] })),
    ];
    for (const plaintext of cases) {
      const packet = encodeFixedPacket(plaintext, profile);
      expect(packet.length).toBe(expected);
      const decoded = decodeFixedPacket(packet, profile);
      expect(decoded.length).toBe(plaintext.length);
      for (let i = 0; i < plaintext.length; i++) expect(decoded[i]).toBe(plaintext[i]);
    }
  });

  it.each(PROFILES)('empty plaintext still pads to the full %s profile size', (profile) => {
    const packet = encodeFixedPacket(new Uint8Array(0), profile);
    expect(packet.length).toBe(profileSize(profile));
    expect(decodeFixedPacket(packet, profile).length).toBe(0);
  });

  it.each(PROFILES)('oversized plaintext is rejected for %s', (profile) => {
    const tooBig = new Uint8Array(profileSize(profile) - 3); // exactly 4-byte length prefix does not fit
    expect(() => encodeFixedPacket(tooBig, profile)).toThrow();
  });

  it.each(PROFILES)('file chunks all have the exact %s profile size', (profile) => {
    const chunkSize = profileSize(profile) - 4;
    const sizes = [0, 1, chunkSize - 1, chunkSize, chunkSize + 1, chunkSize * 3 + 7];
    for (const size of sizes) {
      const file = Uint8Array.from({ length: size }, (_, i) => i % 256);
      const chunks = encodeFixedFileChunks(file, profile);
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.packet.length).toBe(profileSize(profile));
      }
      expect(decodeFixedFileChunks(chunks, profile)).toEqual(file);
    }
  });

  it('all profile sizes are distinct powers of two', () => {
    const values = Object.values(ANON_PACKET_PROFILES) as number[];
    expect(values).toEqual([4096, 16384, 65536]);
    for (const value of values) {
      expect((value & (value - 1)) === 0).toBe(true);
    }
  });
});
