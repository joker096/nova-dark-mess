/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStickerPacks } from './useStickerPacks';
import { STICKER_PACKS } from '../data/stickers';

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('useStickerPacks', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('falls back to the bundled packs when no manifest ships', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));

    const { result } = renderHook(() => useStickerPacks());

    await waitFor(() => expect(result.current.manifestLoading).toBe(false));
    expect(result.current.manifestError).toBe('HTTP 404');
    expect(result.current.packs).toHaveLength(STICKER_PACKS.length);
    expect(result.current.packs.every((pack) => pack.loaded)).toBe(true);
    expect(result.current.isPackLoaded(STICKER_PACKS[0].id)).toBe(true);
  });

  it('loads a pack from the manifest and returns its stickers', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ packs: [{ id: 'beta', name: 'Beta', icon: '/b.webp', description: '' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ stickers: [{ id: 's1', url: '/s1.webp', emoji: 'x' }] }),
      );

    const { result } = renderHook(() => useStickerPacks());
    await waitFor(() => expect(result.current.packs).toHaveLength(1));
    expect(result.current.isPackLoaded('beta')).toBe(false);

    const pack = await result.current.getPack('beta');

    expect(fetchMock).toHaveBeenLastCalledWith('/stickers/manifests/beta.json');
    expect(pack?.loaded).toBe(true);
    expect(pack?.stickers).toHaveLength(1);
    await waitFor(() => expect(result.current.isPackLoaded('beta')).toBe(true));
  });

  it('exposes loadError on a failed pack fetch and allows a retry', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ packs: [{ id: 'gamma', name: 'G', icon: '', description: '' }] }))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ stickers: [{ id: 's2', url: '/s2.webp', emoji: 'y' }] }));

    const { result } = renderHook(() => useStickerPacks());
    await waitFor(() => expect(result.current.packs).toHaveLength(1));

    const failed = await result.current.loadPack('gamma');
    expect(failed?.loadError).toBe('HTTP 500');
    expect(failed?.loaded).toBe(false);

    const retried = await result.current.getPack('gamma');
    expect(retried?.loaded).toBe(true);
    expect(retried?.loadError).toBeUndefined();
  });

  it('deduplicates concurrent requests for the same pack', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ packs: [{ id: 'delta', name: 'D', icon: '', description: '' }] }))
      .mockResolvedValueOnce(jsonResponse({ stickers: [] }));

    const { result } = renderHook(() => useStickerPacks());
    await waitFor(() => expect(result.current.packs).toHaveLength(1));

    await Promise.all([result.current.loadPack('delta'), result.current.loadPack('delta')]);

    expect(fetchMock).toHaveBeenCalledTimes(2); // manifest + one pack request
  });
});
