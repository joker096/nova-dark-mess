import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadEncryptedBackup, downloadEncryptedBackup } from './cloudBackup';

describe('cloudBackup', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('uploads a blob and throws on failure', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    await uploadEncryptedBackup({ url: 'https://example.com/backup' }, new Blob(['x']));
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/backup', expect.objectContaining({ method: 'PUT' }));

    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
    await expect(uploadEncryptedBackup({ url: 'https://example.com/backup' }, new Blob(['x']))).rejects.toThrow('upload failed');
  });

  it('downloads a blob', async () => {
    const blob = new Blob(['data']);
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', blob: async () => blob });
    const result = await downloadEncryptedBackup({ url: 'https://example.com/backup' });
    expect(result).toBe(blob);
  });
});
