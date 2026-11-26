import { useCallback, useEffect, useRef, useState } from 'react';
import { STICKER_PACKS, type StickerPack } from '../data/stickers';
import type { StickerData } from '../types/messenger';

const MANIFEST_URL = '/stickers/manifest.json';

export interface LazyStickerPack extends StickerPack {
  stickers: StickerData[]; // full sticker data when loaded
  loading?: boolean;
  loaded?: boolean;
  loadError?: string;
}

export function useStickerPacks() {
  const [packs, setPacks] = useState<LazyStickerPack[]>([]);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const loadedPackIds = useRef<Set<string>>(new Set());
  const loadingPackIds = useRef<Set<string>>(new Set());
  // Load manifest (pack list)
  useEffect(() => {
    let cancelled = false;
    const loadManifest = async () => {
      try {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const manifestPacks: LazyStickerPack[] = (data.packs ?? []).map((p: StickerPack) => ({
            ...p,
            stickers: [],
            loaded: false,
          }));
          setPacks(manifestPacks);
          setManifestLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setManifestError(e instanceof Error ? e.message : 'Failed to load manifest');
          // No manifest shipped: fall back to the packs bundled with the app.
          const fallback: LazyStickerPack[] = STICKER_PACKS.map((pack) => ({
            ...pack,
            loaded: true,
          }));
          fallback.forEach((pack) => loadedPackIds.current.add(pack.id));
          setPacks(fallback);
          setManifestLoading(false);
        }
      }
    };
    loadManifest();
    return () => { cancelled = true; };
  }, []);

  // Load individual pack
  const loadPack = useCallback(async (packId: string): Promise<LazyStickerPack | undefined> => {
    if (loadedPackIds.current.has(packId) || loadingPackIds.current.has(packId)) {
      return packs.find((p) => p.id === packId);
    }

    const existing = packs.find((p) => p.id === packId);
    loadingPackIds.current.add(packId);
    setPacks(prev => prev.map(p => p.id === packId ? { ...p, loading: true } : p));

    try {
      const res = await fetch(`/stickers/manifests/${packId}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const packData = await res.json();

      const updated: LazyStickerPack | undefined = existing
        ? { ...existing, ...packData, loading: false, loaded: true, loadError: undefined }
        : undefined;
      setPacks(prev => prev.map(p => {
        if (p.id !== packId) return p;
        return { ...p, ...packData, loading: false, loaded: true, loadError: undefined };
      }));
      loadedPackIds.current.add(packId);
      return updated;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed';
      const failed: LazyStickerPack | undefined = existing
        ? { ...existing, loading: false, loaded: false, loadError: message }
        : undefined;
      setPacks(prev => prev.map(p => p.id === packId ? { ...p, loading: false, loadError: message } : p));
      return failed;
    } finally {
      loadingPackIds.current.delete(packId);
    }
  }, [packs]);

  // Get pack by id (loads if not loaded)
  const getPack = useCallback(async (packId: string): Promise<LazyStickerPack | undefined> => {
    const pack = packs.find(p => p.id === packId);
    if (!pack) return undefined;
    if (!pack.loaded) return (await loadPack(packId)) ?? packs.find(p => p.id === packId);
    return pack;
  }, [packs, loadPack]);

  return {
    packs,
    manifestLoading,
    manifestError,
    loadPack,
    getPack,
    isPackLoaded: (id: string) => loadedPackIds.current.has(id),
    isPackLoading: (id: string) => loadingPackIds.current.has(id),
  };
}