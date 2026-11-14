import { beforeEach, describe, expect, it } from 'vitest';
import { StickerPack } from '../data/stickers';
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

const FREE_PACK: StickerPack = {
  id: 'test-free',
  name: 'Test Free',
  icon: '🧪',
  description: 'Free test pack',
  category: 'test',
  sortOrder: 10,
  stickers: [
    { id: 'free-1', packId: 'test-free', packName: 'Test Free', name: 'Free One', emoji: '🅰️' },
    { id: 'free-premium', packId: 'test-free', packName: 'Test Free', name: 'Locked In Free', emoji: '🔒', access: 'premium' },
  ],
};

const PREMIUM_PACK: StickerPack = {
  id: 'test-premium',
  name: 'Test Premium',
  icon: '💎',
  description: 'Premium test pack',
  category: 'premium-test',
  sortOrder: 20,
  access: 'premium',
  stickers: [
    { id: 'prem-1', packId: 'test-premium', packName: 'Test Premium', name: 'Premium One', emoji: '💠' },
  ],
};

const PACKS: StickerPack[] = [FREE_PACK, PREMIUM_PACK];

function findPack(id: string) {
  const pack = PACKS.find((item) => item.id === id);
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
    const { sticker, pack } = findSticker('test-free', 'free-1');
    expect(isStickerPremium(sticker, pack)).toBe(false);
    expect(isStickerLocked(sticker, pack, false)).toBe(false);
  });

  it('locks premium packs for free users', () => {
    const { sticker, pack } = findSticker('test-premium', 'prem-1');
    expect(isStickerPremium(sticker, pack)).toBe(true);
    expect(isStickerLocked(sticker, pack, false)).toBe(true);
    expect(isStickerLocked(sticker, pack, true)).toBe(false);
  });

  it('locks individual premium stickers inside free packs', () => {
    const { sticker, pack } = findSticker('test-free', 'free-premium');
    expect(isStickerLocked(sticker, pack, false)).toBe(true);
    expect(isStickerLocked(sticker, pack, true)).toBe(false);

    const { sticker: freeSticker } = findSticker('test-free', 'free-1');
    expect(isStickerLocked(freeSticker, pack, false)).toBe(false);
  });

  it('defaults to free when no access is declared', () => {
    const { sticker, pack } = findSticker('test-free', 'free-1');
    const barePack = { ...pack, access: undefined };
    expect(isStickerPremium(sticker, barePack)).toBe(false);
  });
});

describe('sticker pack sorting', () => {
  it('puts free packs before premium packs', () => {
    const sorted = sortStickerPacks(PACKS);
    expect(sorted[0].id).toBe('test-free');
    expect(sorted[1].id).toBe('test-premium');
  });

  it('does not mutate the source array', () => {
    const original = [...PACKS];
    sortStickerPacks(PACKS);
    expect(PACKS).toEqual(original);
  });

  it('uses sortOrder before pack name for free packs', () => {
    const sorted = sortStickerPacks(PACKS).filter((pack) => pack.access !== 'premium');
    expect(sorted.map((pack) => pack.id)).toEqual(['test-free']);
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
    const entries = allStickerEntries(PACKS);
    const resolved = entriesByIds(entries, ['free-1', 'prem-1']);
    expect(resolved.map((entry) => entry.sticker.id)).toEqual(['free-1', 'prem-1']);
  });

  it('ignores unknown ids', () => {
    const entries = allStickerEntries(PACKS);
    expect(entriesByIds(entries, ['missing'])).toEqual([]);
  });
});

describe('favorite stickers', () => {
  it('toggles favorites on and off', () => {
    expect(toggleStickerFavorite('free-1')).toEqual(['free-1']);
    expect(getFavoriteStickerIds()).toEqual(['free-1']);
    expect(toggleStickerFavorite('free-1')).toEqual([]);
    expect(getFavoriteStickerIds()).toEqual([]);
  });
});

describe('sticker search', () => {
  it('matches sticker and pack metadata', () => {
    const entries = allStickerEntries(PACKS);
    const freeOne = entries.find((entry) => entry.sticker.id === 'free-1');
    const premiumOne = entries.find((entry) => entry.sticker.id === 'prem-1');
    if (!freeOne || !premiumOne) throw new Error('Missing test stickers');

    expect(matchesStickerQuery(freeOne, 'test')).toBe(true);
    expect(matchesStickerQuery(freeOne, 'premium-test')).toBe(false);
    expect(matchesStickerQuery(freeOne, '  ')).toBe(true);
  });
});

describe('new pack badge', () => {
  const pack = findPack('test-free');

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
    expect(getStickerCategories(PACKS)).toEqual(['test', 'premium-test']);
  });
});
