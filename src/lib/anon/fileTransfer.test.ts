import { describe, it, expect } from 'vitest';
import {
  FILE_CHUNK_BYTES,
  MAX_FILE_BYTES,
  assembleFile,
  createFileEnvelopes,
  parseFileEnvelope,
} from './fileTransfer';

function pattern(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => index % 251);
}

describe('anonymous file transfer', () => {
  it('splits, parses and reassembles a file', async () => {
    const file = pattern(FILE_CHUNK_BYTES * 2 + 123);
    const envelopes = await createFileEnvelopes(file, 'photo.png', 'image/png');
    expect(envelopes).toHaveLength(3);
    expect(envelopes.every((envelope) => envelope.total === 3)).toBe(true);
    expect(envelopes.every((envelope) => envelope.size === file.length)).toBe(true);

    const parsed = envelopes.map((envelope) => parseFileEnvelope(JSON.stringify(envelope)));
    expect(parsed.every((envelope) => envelope !== null)).toBe(true);
    const assembled = await assembleFile(parsed as NonNullable<(typeof parsed)[number]>[]);
    expect(assembled?.name).toBe('photo.png');
    expect(assembled?.mime).toBe('image/png');
    expect(assembled?.bytes).toEqual(file);
  });

  it('keeps every envelope inside the large packet profile', async () => {
    const file = pattern(FILE_CHUNK_BYTES);
    const [envelope] = await createFileEnvelopes(file, 'blob', 'application/octet-stream');
    expect(JSON.stringify(envelope).length).toBeLessThan(65536 - 4 - 1024);
  });

  it('rejects tampered or incomplete transfers', async () => {
    const envelopes = await createFileEnvelopes(pattern(1000), 'a.bin', 'application/octet-stream');
    const [envelope] = envelopes;
    const tampered = { ...envelope, data: `${envelope.data.slice(0, -4)}AAAA` };
    expect(await assembleFile([tampered])).toBeNull();

    const bigger = await createFileEnvelopes(pattern(FILE_CHUNK_BYTES + 1), 'b.bin', '');
    expect(await assembleFile([bigger[0]])).toBeNull();
    expect(await assembleFile([bigger[0], bigger[0]])).toBeNull();
  });

  it('rejects oversized files and malformed envelopes', async () => {
    await expect(
      createFileEnvelopes(pattern(MAX_FILE_BYTES + 1), 'big.bin', ''),
    ).rejects.toThrow();
    expect(parseFileEnvelope('not json')).toBeNull();
    expect(parseFileEnvelope(JSON.stringify({ type: 'nova-anon-file' }))).toBeNull();
    const envelopes = await createFileEnvelopes(pattern(10), 'x', '');
    const bad = { ...envelopes[0], index: 5 };
    expect(parseFileEnvelope(JSON.stringify(bad))).toBeNull();
  });
});
