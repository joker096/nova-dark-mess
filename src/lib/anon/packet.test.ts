import { describe, it, expect } from 'vitest';
import { ANON_PACKET_PROFILES } from './types';
import {
  decodeFixedFileChunks,
  decodeFixedPacket,
  encodeFixedFileChunks,
  encodeFixedPacket,
  profileForPacketSize,
  profileSize,
} from './packet';

describe('anon packet framing', () => {
  it('round-trips a payload', () => {
    const payload = new TextEncoder().encode('hello anonymous world');
    const packet = encodeFixedPacket(payload, 'standard');
    expect(packet.length).toBe(ANON_PACKET_PROFILES.standard);
    const decoded = decodeFixedPacket(packet, 'standard');
    expect(new TextDecoder().decode(decoded)).toBe('hello anonymous world');
  });

  it('pads to the exact profile size', () => {
    const packet = encodeFixedPacket(new Uint8Array([1, 2, 3]), 'small');
    expect(packet.length).toBe(profileSize('small'));
  });

  it('rejects oversized payloads', () => {
    const tooBig = new Uint8Array(profileSize('small'));
    expect(() => encodeFixedPacket(tooBig, 'small')).toThrow();
  });

  it('recovers the profile from the wire length', () => {
    expect(profileForPacketSize(profileSize('small'))).toBe('small');
    expect(profileForPacketSize(profileSize('standard'))).toBe('standard');
    expect(profileForPacketSize(profileSize('large'))).toBe('large');
    expect(() => profileForPacketSize(profileSize('large') + 8)).toThrow(
      'Unexpected packet length',
    );
  });

  it('rejects invalid packet lengths', () => {
    const broken = new Uint8Array(10);
    expect(() => decodeFixedPacket(broken, 'small')).toThrow();
  });

  it('all standard packets have identical length', () => {
    const a = encodeFixedPacket(new TextEncoder().encode('a'), 'standard');
    const b = encodeFixedPacket(new TextEncoder().encode('a much longer message that still fits'), 'standard');
    expect(a.length).toBe(b.length);
  });

  it('pads receipt and control payloads to the same fixed profile size', () => {
    const receipt = encodeFixedPacket(new TextEncoder().encode('{"type":"receipt"}'), 'small');
    const control = encodeFixedPacket(new TextEncoder().encode('{"type":"typing","active":true}'), 'small');
    expect(receipt.length).toBe(profileSize('small'));
    expect(control.length).toBe(profileSize('small'));
  });

  it.each([
    ['small', profileSize('small')],
    ['standard', profileSize('standard')],
    ['large', profileSize('large')],
  ] as const)('splits and reassembles a file with the %s profile', (profile, size) => {
    const chunkSize = size - 4;
    const file = Uint8Array.from({ length: chunkSize * 2 + 7 }, (_, index) => index % 256);
    const chunks = encodeFixedFileChunks(file, profile);

    expect(chunks.every((chunk) => chunk.packet.length === size)).toBe(true);
    expect(decodeFixedFileChunks([...chunks].reverse(), profile)).toEqual(file);
  });

  it('represents an empty file with one padded block per profile', () => {
    for (const profile of ['small', 'standard', 'large'] as const) {
      const chunks = encodeFixedFileChunks(new Uint8Array(), profile);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].packet.length).toBe(profileSize(profile));
      expect(decodeFixedFileChunks(chunks, profile)).toEqual(new Uint8Array());
    }
  });

  it('rejects missing, duplicate, or malformed file chunks', () => {
    const chunks = encodeFixedFileChunks(new Uint8Array(profileSize('small')), 'small');
    expect(() => decodeFixedFileChunks([], 'small')).toThrow();
    expect(() => decodeFixedFileChunks([chunks[0], chunks[0]], 'small')).toThrow();
    expect(() => decodeFixedFileChunks([chunks[0]], 'small')).toThrow();
  });
});
