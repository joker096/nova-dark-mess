import { STICKER_PACKS, StickerPack } from '../data/stickers';
import { StickerData } from '../types/messenger';

export interface StickerEntry {
  sticker: StickerData;
  pack: StickerPack;
}

const RECENT_KEY = 'nova_sticker_recent';
const FAVORITES_KEY = 'nova_sticker_favorites';
const IMPORTED_PACKS_KEY = 'nova_imported_sticker_packs';

export const RECENT_LIMIT = 20;
const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const IMPORTED_PACK_LIMIT = 25;
export const IMPORTED_STICKER_LIMIT = 120;
export const IMPORTED_PACK_MAX_BYTES = 4 * 1024 * 1024;
const MAX_STICKER_MEDIA_CHARS = 2_000_000;

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function getRecentStickerIds(): string[] {
  return readIds(RECENT_KEY);
}

export function recordStickerUse(stickerId: string): string[] {
  const next = [stickerId, ...readIds(RECENT_KEY).filter((id) => id !== stickerId)].slice(
    0,
    RECENT_LIMIT,
  );
  writeIds(RECENT_KEY, next);
  return next;
}

export function getFavoriteStickerIds(): string[] {
  return readIds(FAVORITES_KEY);
}

export function toggleStickerFavorite(stickerId: string): string[] {
  const current = readIds(FAVORITES_KEY);
  const next = current.includes(stickerId)
    ? current.filter((id) => id !== stickerId)
    : [stickerId, ...current];
  writeIds(FAVORITES_KEY, next);
  return next;
}

export function isStickerPremium(sticker: StickerData, pack: StickerPack): boolean {
  return (sticker.access ?? pack.access ?? 'free') === 'premium';
}

export function isStickerLocked(
  sticker: StickerData,
  pack: StickerPack,
  premium: boolean,
): boolean {
  return !premium && isStickerPremium(sticker, pack);
}

export function sortStickerPacks(packs: StickerPack[]): StickerPack[] {
  return [...packs].sort((a, b) => {
    const aPremium = a.access === 'premium' ? 1 : 0;
    const bPremium = b.access === 'premium' ? 1 : 0;
    if (aPremium !== bPremium) return aPremium - bPremium;

    const aOrder = a.sortOrder ?? 1000;
    const bOrder = b.sortOrder ?? 1000;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return a.name.localeCompare(b.name);
  });
}

export function allStickerEntries(packs: StickerPack[]): StickerEntry[] {
  return packs.flatMap((pack) =>
    pack.stickers.map((sticker) => ({ sticker, pack })),
  );
}

export function entriesByIds(entries: StickerEntry[], ids: string[]): StickerEntry[] {
  const byId = new Map(entries.map((entry) => [entry.sticker.id, entry]));
  return ids
    .map((id) => byId.get(id))
    .filter((entry): entry is StickerEntry => Boolean(entry));
}

export function matchesStickerQuery(entry: StickerEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const { sticker, pack } = entry;
  const haystack = [
    sticker.name,
    sticker.emoji,
    sticker.packName,
    pack.name,
    pack.description,
    pack.category ?? '',
    ...(sticker.tags ?? []),
    ...(pack.tags ?? []),
  ];

  return haystack.some((value) => value.toLowerCase().includes(normalized));
}

export function isStickerNew(pack: StickerPack, now: number = Date.now()): boolean {
  if (!pack.releaseDate) return false;
  const releasedAt = Date.parse(pack.releaseDate);
  if (Number.isNaN(releasedAt)) return false;
  return now - releasedAt <= NEW_WINDOW_MS;
}

export function getStickerCategories(packs: StickerPack[]): string[] {
  const categories = new Set<string>();
  for (const pack of packs) {
    if (pack.category) categories.add(pack.category);
  }
  return [...categories];
}

// ---------------------------------------------------------------------------
// Sticker pack import (local file, stored on-device)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  const id = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) {
    throw new Error(`${field} must be 1-64 letters, digits, dots, dashes or underscores`);
  }
  return id;
}

function readOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readMediaUrl(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const url = value.trim();
  if (url.length > MAX_STICKER_MEDIA_CHARS) {
    throw new Error(`${field} is too large`);
  }
  const isDataMedia = /^data:(image|video)\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*,/i.test(url);
  const isRemoteMedia = /^https?:\/\//i.test(url);
  if (!isDataMedia && !isRemoteMedia) {
    throw new Error(`${field} must be an http(s) URL or an image/video data URL`);
  }
  return url;
}

function readTags(value: unknown, maxItems: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, maxItems);
  return tags.length > 0 ? tags : undefined;
}

export function normalizeImportedStickerPack(input: unknown): StickerPack {
  if (!isRecord(input)) {
    throw new Error('Sticker pack must be a JSON object');
  }

  const id = readIdentifier(input.id, 'Pack id');
  if (STICKER_PACKS.some((pack) => pack.id === id)) {
    throw new Error(`Pack id "${id}" is reserved`);
  }

  const name = readOptionalString(input.name, 60);
  if (!name) {
    throw new Error('Pack name is required');
  }

  const rawStickers = input.stickers;
  if (!Array.isArray(rawStickers) || rawStickers.length === 0) {
    throw new Error('Pack must contain at least one sticker');
  }
  if (rawStickers.length > IMPORTED_STICKER_LIMIT) {
    throw new Error(`Pack cannot contain more than ${IMPORTED_STICKER_LIMIT} stickers`);
  }

  const usedIds = new Set<string>();
  const stickers: StickerData[] = rawStickers.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Sticker ${index + 1} must be an object`);
    }

    let stickerId = readIdentifier(entry.id, `Sticker ${index + 1} id`);
    if (usedIds.has(stickerId)) {
      stickerId = `${stickerId}-${index + 1}`;
    }
    usedIds.add(stickerId);

    const emoji = readOptionalString(entry.emoji, 16);
    const imageUrl = readMediaUrl(entry.imageUrl, `Sticker ${index + 1} imageUrl`);
    const animationUrl = readMediaUrl(entry.animationUrl, `Sticker ${index + 1} animationUrl`);
    if (!emoji && !imageUrl && !animationUrl) {
      throw new Error(`Sticker ${index + 1} needs an emoji, imageUrl or animationUrl`);
    }

    return {
      id: stickerId,
      packId: id,
      packName: name,
      name: readOptionalString(entry.name, 40) ?? `Sticker ${index + 1}`,
      emoji: emoji ?? '🙂',
      imageUrl,
      animationUrl,
      animated: Boolean(entry.animated) || Boolean(animationUrl),
      tags: readTags(entry.tags, 8),
      access: 'free',
    };
  });

  return {
    id,
    name,
    icon: readOptionalString(input.icon, 8) ?? '📦',
    description: readOptionalString(input.description, 200) ?? '',
    category: 'imported',
    sortOrder: 500,
    tags: ['imported', ...(readTags(input.tags, 8) ?? []).filter((tag) => tag !== 'imported')],
    license: readOptionalString(input.license, 80),
    attribution: readOptionalString(input.attribution, 120),
    animated: stickers.some((sticker) => sticker.animated),
    stickers,
    imported: true,
  };
}

export function parseImportedStickerPack(rawJson: string): StickerPack {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Sticker pack file is not valid JSON');
  }
  return normalizeImportedStickerPack(parsed);
}

export async function readImportedStickerPackFile(file: File): Promise<StickerPack> {
  if (file.size > IMPORTED_PACK_MAX_BYTES) {
    throw new Error('Sticker pack file is too large (max 4 MB)');
  }
  return parseImportedStickerPack(await file.text());
}

export function loadImportedStickerPacks(): StickerPack[] {
  try {
    const raw = localStorage.getItem(IMPORTED_PACKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const packs: StickerPack[] = [];
    for (const item of parsed) {
      try {
        const pack = normalizeImportedStickerPack(item);
        if (!packs.some((existing) => existing.id === pack.id)) {
          packs.push(pack);
        }
      } catch {
        // Ignore corrupted entries instead of losing the whole library.
      }
    }
    return packs.slice(0, IMPORTED_PACK_LIMIT);
  } catch {
    return [];
  }
}

export function saveImportedStickerPacks(packs: StickerPack[]): void {
  try {
    localStorage.setItem(
      IMPORTED_PACKS_KEY,
      JSON.stringify(packs.slice(0, IMPORTED_PACK_LIMIT)),
    );
  } catch {
    throw new Error('Not enough local storage to save this sticker pack');
  }
}

export function addImportedStickerPack(pack: StickerPack): StickerPack[] {
  const normalized = normalizeImportedStickerPack(pack);
  const current = loadImportedStickerPacks().filter((item) => item.id !== normalized.id);
  const next = [normalized, ...current].slice(0, IMPORTED_PACK_LIMIT);
  saveImportedStickerPacks(next);
  return next;
}

export function removeImportedStickerPack(packId: string): StickerPack[] {
  const next = loadImportedStickerPacks().filter((pack) => pack.id !== packId);
  saveImportedStickerPacks(next);
  return next;
}
