import { beforeEach, describe, expect, it } from 'vitest';
import { STICKER_PACKS } from '../data/stickers';
import {
  allStickerEntries,
  entriesByIds,
  getFavoriteStickerIds,
  getRecentStickerIds,
  getStickerCategories,
  isStickerLocked,
  isStickerNew,
  isStickerPremium,
  matchesStickerQuery,
  recordStickerUse,
  sortStickerPacks,
  toggleStickerFavorite,
  RECENT_LIMIT,
} from './stickers';

const DAY_MS = 24 * 60 * 60 * 1000;

function findPack(id: string) {
  const pack = STICKER_PACKS.find((item) => item.id === id);
  if (!pack) throw new Error(`Missing pack ${id}`);
  return pack;
}

function findSticker(packId: string, stickerId: string) {
  const pack = findPack(packId);
  const sticker = pack.stickers.find((item) => item.id === stickerId);
  if (!sticker) throw new Error(`Missing sticker ${stickerId}`);
  return { sticker, pack };
}

beforeEach(() => {
  localStorage.clear();
});

describe('sticker access gating', () => {
  it('keeps free stickers unlocked for free users', () => {
    const { sticker, pack } = findSticker('cyber', 'cyber-cat');
    expect(isStickerPremium(sticker, pack)).toBe(false);
    expect(isStickerLocked(sticker, pack, false)).toBe(false);
  });

  it('locks premium packs for free users', () => {
    const { sticker, pack } = findSticker('reactions', 'react-party');
    expect(isStickerPremium(sticker, pack)).toBe(true);
    expect(isStickerLocked(sticker, pack, false)).toBe(true);
    expect(isStickerLocked(sticker, pack, true)).toBe(false);
  });

  it('locks individual premium stickers inside free packs', () => {
    const { sticker, pack } = findSticker('memes', 'meme-chad');
    expect(isStickerLocked(sticker, pack, false)).toBe(true);
    expect(isStickerLocked(sticker, pack, true)).toBe(false);

    const { sticker: freeSticker } = findSticker('memes', 'pepe-chill');
    expect(isStickerLocked(freeSticker, pack, false)).toBe(false);
  });

  it('defaults to free when no access is declared', () => {
    const { sticker, pack } = findSticker('cyber', 'cyber-cat');
    const barePack = { ...pack, access: undefined };
    expect(isStickerPremium(sticker, barePack)).toBe(false);
  });
});

describe('sticker pack sorting', () => {
  it('puts free packs before premium packs', () => {
    const sorted = sortStickerPacks(STICKER_PACKS);
    const firstPremiumIndex = sorted.findIndex((pack) => pack.access === 'premium');
    const lastFreeIndex = sorted.map((pack) => pack.access === 'premium').lastIndexOf(false);

    expect(firstPremiumIndex).toBeGreaterThan(lastFreeIndex);
  });

  it('does not mutate the source array', () => {
    const original = [...STICKER_PACKS];
    sortStickerPacks(STICKER_PACKS);
    expect(STICKER_PACKS).toEqual(original);
  });

  it('uses sortOrder before pack name for free packs', () => {
    const sorted = sortStickerPacks(STICKER_PACKS).filter((pack) => pack.access !== 'premium');
    expect(sorted.map((pack) => pack.id)).toEqual(['cyber', 'memes']);
  });
});

describe('recent stickers', () => {
  it('deduplicates, caps and keeps newest first', () => {
    for (let index = 0; index < RECENT_LIMIT + 5; index += 1) {
      recordStickerUse(`sticker-${index}`);
    }
    recordStickerUse('sticker-3');

    const recent = getRecentStickerIds();
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0]).toBe('sticker-3');
    expect(recent.filter((id) => id === 'sticker-3')).toHaveLength(1);
    expect(recent).not.toContain('sticker-0');
  });

  it('resolves entries in recent order', () => {
    const entries = allStickerEntries(STICKER_PACKS);
    const resolved = entriesByIds(entries, ['cyber-cat', 'meme-chad']);
    expect(resolved.map((entry) => entry.sticker.id)).toEqual(['cyber-cat', 'meme-chad']);
  });

  it('ignores unknown ids', () => {
    const entries = allStickerEntries(STICKER_PACKS);
    expect(entriesByIds(entries, ['missing'])).toEqual([]);
  });
});

describe('favorite stickers', () => {
  it('toggles favorites on and off', () => {
    expect(toggleStickerFavorite('cyber-cat')).toEqual(['cyber-cat']);
    expect(getFavoriteStickerIds()).toEqual(['cyber-cat']);
    expect(toggleStickerFavorite('cyber-cat')).toEqual([]);
    expect(getFavoriteStickerIds()).toEqual([]);
  });
});

describe('sticker search', () => {
  it('matches sticker and pack metadata', () => {
    const entries = allStickerEntries(STICKER_PACKS);
    const pepe = entries.find((entry) => entry.sticker.id === 'pepe-chill');
    const cyber = entries.find((entry) => entry.sticker.id === 'cyber-cat');
    if (!pepe || !cyber) throw new Error('Missing test stickers');

    expect(matchesStickerQuery(pepe, 'frog')).toBe(true);
    expect(matchesStickerQuery(cyber, 'neon')).toBe(true);
    expect(matchesStickerQuery(pepe, 'cyber')).toBe(false);
    expect(matchesStickerQuery(pepe, '  ')).toBe(true);
  });
});

describe('new pack badge', () => {
  const pack = findPack('cyber');

  it('marks recently released packs as new', () => {
    const fresh = { ...pack, releaseDate: new Date(Date.now() - DAY_MS).toISOString() };
    expect(isStickerNew(fresh)).toBe(true);
  });

  it('expires after two weeks', () => {
    const stale = { ...pack, releaseDate: new Date(Date.now() - 15 * DAY_MS).toISOString() };
    expect(isStickerNew(stale)).toBe(false);
  });

  it('handles missing or invalid dates', () => {
    expect(isStickerNew({ ...pack, releaseDate: undefined })).toBe(false);
    expect(isStickerNew({ ...pack, releaseDate: 'not-a-date' })).toBe(false);
  });
});

describe('sticker categories', () => {
  it('returns unique pack categories', () => {
    expect(getStickerCategories(STICKER_PACKS)).toEqual(['cyber', 'memes', 'reactions']);
  });
});
