import { useCallback, useEffect, useRef, useState } from 'react';
import type { StickerPack, StickerData } from '../types/messenger';

const MANIFEST_URL = '/stickers/manifest.json';

export interface LazyStickerPack extends StickerPack {
  stickers: StickerData[]; // full sticker data when loaded
  loading?: boolean;
  loaded?: boolean;
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
          setPacks(data.packs.map((p: any) => ({ ...p, stickers: [], loaded: false })));
          setManifestLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setManifestError(e instanceof Error ? e.message : 'Failed to load manifest');
          setManifestLoading(false);
        }
      }
    };
    loadManifest();
    return () => { cancelled = true; };
  }, []);

  // Load individual pack
  const loadPack = useCallback(async (packId: string) => {
    if (loadedPackIds.current.has(packId) || loadingPackIds.current.has(packId)) return;

    loadingPackIds.current.add(packId);
    setPacks(prev => prev.map(p => p.id === packId ? { ...p, loading: true } : p));

    try {
      const res = await fetch(`/stickers/manifests/${packId}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const packData = await res.json();

      setPacks(prev => prev.map(p => {
        if (p.id !== packId) return p;
        return { ...p, ...packData, loading: false, loaded: true };
      }));
      loadedPackIds.current.add(packId);
    } catch (e) {
      setPacks(prev => prev.map(p => p.id === packId ? { ...p, loading: false, loadError: e instanceof Error ? e.message : 'Failed' } : p));
    } finally {
      loadingPackIds.current.delete(packId);
    }
  }, []);

  // Get pack by id (loads if not loaded)
  const getPack = useCallback(async (packId: string): Promise<LazyStickerPack | undefined> => {
    const pack = packs.find(p => p.id === packId);
    if (!pack) return undefined;
    if (!pack.loaded) await loadPack(packId);
    return packs.find(p => p.id === packId);
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