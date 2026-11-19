import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  uploadEncryptedBackup,
  downloadEncryptedBackup,
} from './relayBackup';

const baseUrl = 'http://relay.example';
const token = 'test-token';
const destination = 'fp-user-1';
const encryptedBlobJson = JSON.stringify({
  magic: 'NOVA_BACKUP',
  version: 2,
  kdf: { name: 'Argon2id', memoryKiB: 65536, iterations: 3, parallelism: 1 },
  salt: 'abc123',
  ciphertext: 'ciphertext',
  iv: 'iv',
  exportedAt: '2026-01-01T00:00:00.000Z',
});

describe('relayBackup', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploadEncryptedBackup posts blob and returns ok', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 202 }),
    );

    await uploadEncryptedBackup({ baseUrl, bearerToken: token, destination }, encryptedBlobJson);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/backup/upload`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.destination).toBe(destination);
    expect(body.blob).toBe(encryptedBlobJson);
  });

  it('uploadEncryptedBackup throws on 401', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), { status: 401 }));

    await expect(
      uploadEncryptedBackup({ baseUrl, bearerToken: token, destination }, encryptedBlobJson),
    ).rejects.toThrow('unauthorized');
  });

  it('uploadEncryptedBackup throws on 413', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, reason: 'backup too large' }), { status: 413 }));

    await expect(
      uploadEncryptedBackup({ baseUrl, bearerToken: token, destination }, encryptedBlobJson),
    ).rejects.toThrow('too large');
  });

  it('downloadEncryptedBackup returns blob and metadata', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, blob: encryptedBlobJson, storedAt: '2026-01-01T00:00:00.000Z', size: 123 }),
        { status: 200 },
      ),
    );

    const result = await downloadEncryptedBackup({ baseUrl, bearerToken: token, destination });

    expect(result).toEqual({
      blob: encryptedBlobJson,
      storedAt: '2026-01-01T00:00:00.000Z',
      size: 123,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/api/backup/download');
    expect(url).toContain(`destination=${encodeURIComponent(destination)}`);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('downloadEncryptedBackup returns null when no backup (404)', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, reason: 'no backup found' }), { status: 404 }));

    const result = await downloadEncryptedBackup({ baseUrl, bearerToken: token, destination });
    expect(result).toBeNull();
  });

  it('downloadEncryptedBackup throws on 401', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), { status: 401 }));

    await expect(
      downloadEncryptedBackup({ baseUrl, bearerToken: token, destination }),
    ).rejects.toThrow('unauthorized');
  });

  it('downloadEncryptedBackup throws on non-ok non-404', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 500 }));

    await expect(
      downloadEncryptedBackup({ baseUrl, bearerToken: token, destination }),
    ).rejects.toThrow('failed');
  });
});
