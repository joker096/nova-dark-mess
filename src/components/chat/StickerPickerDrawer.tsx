import React, { useMemo, useRef, useState } from 'react';
import { Smile, Film, X, Search, Sparkles, Star, Clock, Lock, Crown, Upload, Trash2 } from 'lucide-react';
import { STICKER_PACKS, MOCK_GIFS } from '../../data/stickers';
import { StickerData } from '../../types/messenger';
import { useLanguage } from '../../context/LanguageContext';
import { usePremium } from '../../hooks/usePremium';
import {
  addImportedStickerPack,
  allStickerEntries,
  entriesByIds,
  getFavoriteStickerIds,
  getRecentStickerIds,
  getStickerCategories,
  isStickerLocked,
  isStickerNew,
  isStickerPremium,
  loadImportedStickerPacks,
  matchesStickerQuery,
  readImportedStickerPackFile,
  recordStickerUse,
  removeImportedStickerPack,
  sortStickerPacks,
  toggleStickerFavorite,
} from '../../lib/stickers';
import type { StickerEntry } from '../../lib/stickers';
import { StickerMedia } from './StickerMedia';

interface StickerPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onSendSticker: (sticker: StickerData) => void;
  onSendGif: (gifUrl: string, title?: string) => void;
}

const EXTENDED_EMOJIS = [
  '😊', '❤️', '🔥', '👍', '😂', '🎉', '🏖️', '✨', '🙌', '🍹', '😍', '👏',
  '🚀', '💯', '😎', '🤩', '🥳', '🤯', '😭', '💀', '👀', '⚡', '💡', '🥂',
  '☕', '🍕', '🎯', '🥑', '🌮', '🎈', '⭐', '🌈', '💎', '🦾', '👾', '🤙',
];

const CATEGORY_PREFIX = 'category:';

export const StickerPickerDrawer: React.FC<StickerPickerDrawerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  onSendSticker,
  onSendGif,
}) => {
  const { t } = useLanguage();
  const { premium, checkout } = usePremium();
  const [activeTab, setActiveTab] = useState<'emoji' | 'stickers' | 'gifs'>('stickers');
  const [activePackId, setActivePackId] = useState<string>(STICKER_PACKS[0]?.id || 'cyber');
  const [filter, setFilter] = useState<string>('all');
  const [stickerSearch, setStickerSearch] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>(getRecentStickerIds);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(getFavoriteStickerIds);
  const [gifSearch, setGifSearch] = useState('');
  const [gifCategory, setGifCategory] = useState<string>('All');
  const [importedPacks, setImportedPacks] = useState(() => loadImportedStickerPacks());
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const sortedPacks = useMemo(
    () => sortStickerPacks([...STICKER_PACKS, ...importedPacks]),
    [importedPacks]
  );
  const entries = useMemo(() => allStickerEntries(sortedPacks), [sortedPacks]);
  const categories = useMemo(() => getStickerCategories(sortedPacks), [sortedPacks]);

  const selectedPack =
    sortedPacks.find((pack) => pack.id === activePackId) || sortedPacks[0];

  const visibleEntries = useMemo(() => {
    if (stickerSearch.trim()) {
      return entries.filter((entry) => matchesStickerQuery(entry, stickerSearch));
    }
    if (filter === 'recent') return entriesByIds(entries, recentIds);
    if (filter === 'favorites') return entriesByIds(entries, favoriteIds);
    if (filter === 'premium') {
      return entries.filter((entry) => isStickerPremium(entry.sticker, entry.pack));
    }
    if (filter.startsWith(CATEGORY_PREFIX)) {
      const category = filter.slice(CATEGORY_PREFIX.length);
      return entries.filter((entry) => entry.pack.category === category);
    }
    if (!selectedPack) return [];
    return selectedPack.stickers.map((sticker) => ({ sticker, pack: selectedPack }));
  }, [entries, filter, favoriteIds, recentIds, selectedPack, stickerSearch]);

  if (!isOpen) return null;

  const filteredGifs = MOCK_GIFS.filter((gif) => {
    const matchesCategory = gifCategory === 'All' || gif.category.toLowerCase() === gifCategory.toLowerCase();
    const matchesSearch = !gifSearch.trim() || gif.title.toLowerCase().includes(gifSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handlePickSticker = (entry: StickerEntry) => {
    if (isStickerLocked(entry.sticker, entry.pack, premium)) {
      void checkout();
      return;
    }
    setRecentIds(recordStickerUse(entry.sticker.id));
    onSendSticker(entry.sticker);
  };

  const handleToggleFavorite = (event: React.MouseEvent, stickerId: string) => {
    event.stopPropagation();
    setFavoriteIds(toggleStickerFavorite(stickerId));
  };

  const handleImportClick = () => {
    setImportError(null);
    importInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    try {
      const pack = await readImportedStickerPackFile(file);
      const next = addImportedStickerPack(pack);
      setImportedPacks(next);
      setActivePackId(pack.id);
      setFilter('all');
      setStickerSearch('');
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : t('stickers.importError', 'Could not import this sticker pack')
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleRemoveImportedPack = (packId: string) => {
    try {
      const next = removeImportedStickerPack(packId);
      setImportedPacks(next);
      if (activePackId === packId) {
        setActivePackId(STICKER_PACKS[0]?.id ?? 'cyber');
      }
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : t('stickers.importError', 'Could not import this sticker pack')
      );
    }
  };

  const highlightedPacks = filter === 'all' && !stickerSearch.trim();
  const showPremiumBanner = filter === 'premium' && !premium;

  const filterChipClass = (active: boolean) =>
    `flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium shrink-0 border transition cursor-pointer ${
      active
        ? 'border-[var(--nova-accent-color,#ff4e18)]/70 bg-[var(--nova-accent-color,#ff4e18)]/20 text-white'
        : 'border-white/5 bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
    }`;

  const emptyMessage = stickerSearch.trim()
    ? t('stickers.emptySearch', 'Nothing found')
    : filter === 'recent'
      ? t('stickers.emptyRecent', 'No recent stickers yet')
      : filter === 'favorites'
        ? t('stickers.emptyFavorites', 'No favorite stickers yet')
        : t('stickers.emptyPack', 'No stickers in this pack');

  return (
    <div
      data-testid="sticker-drawer"
      className="p-2.5 bg-[#141520]/98 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl animate-in slide-in-from-bottom-2 duration-150 select-none overflow-hidden max-w-full no-scrollbar"
    >
      {/* Top Header & Tab Switcher */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 gap-2">
        <div className="flex items-center gap-1 bg-[#10111a] p-1 rounded-2xl border border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab('stickers')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'stickers'
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('stickers.title', 'Stickers')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('emoji')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'emoji'
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>{t('common.emojis', 'Emojis')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gifs')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'gifs'
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>{t('stickers.gifs', 'GIFs')}</span>
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleImportClick}
            disabled={isImporting}
            className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-40 disabled:cursor-wait"
            title={t('stickers.importPack', 'Import local sticker pack')}
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title={t('common.close', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".json,.novasticker,application/json"
        className="hidden"
        data-testid="sticker-pack-import-input"
        onChange={handleImportFile}
      />

      {/* STICKERS TAB */}
      {activeTab === 'stickers' && (
        <div className="space-y-2">
          {importError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-200">
              <span className="flex-1">{importError}</span>
              <button
                type="button"
                onClick={() => setImportError(null)}
                className="text-red-300/70 hover:text-red-100 cursor-pointer"
                title={t('common.close', 'Close')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {/* Sticker search */}
          <div className="flex items-center gap-2 bg-[#10111a] px-2.5 py-1.5 rounded-xl border border-white/5">
            <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <input
              type="text"
              value={stickerSearch}
              onChange={(event) => setStickerSearch(event.target.value)}
              placeholder={t('stickers.searchStickers', 'Search stickers...')}
              className="w-full bg-transparent text-xs text-white placeholder-white/30 focus:outline-none"
            />
            {stickerSearch && (
              <button
                type="button"
                onClick={() => setStickerSearch('')}
                className="text-white/40 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sorting & category filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button type="button" onClick={() => setFilter('all')} className={filterChipClass(filter === 'all')}>
              {t('stickers.all', 'All')}
            </button>
            <button
              type="button"
              onClick={() => setFilter('recent')}
              className={filterChipClass(filter === 'recent')}
            >
              <Clock className="w-3 h-3" />
              {t('stickers.recent', 'Recent')}
            </button>
            <button
              type="button"
              onClick={() => setFilter('favorites')}
              className={filterChipClass(filter === 'favorites')}
            >
              <Star className="w-3 h-3" />
              {t('stickers.favorites', 'Favorites')}
              {favoriteIds.length > 0 && <span className="opacity-60">{favoriteIds.length}</span>}
            </button>
            <button
              type="button"
              onClick={() => setFilter('premium')}
              className={filterChipClass(filter === 'premium')}
            >
              <Crown className="w-3 h-3" />
              {t('stickers.premium', 'Premium')}
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setFilter(`${CATEGORY_PREFIX}${category}`)}
                className={filterChipClass(filter === `${CATEGORY_PREFIX}${category}`)}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>

          {showPremiumBanner && (
            <button
              type="button"
              onClick={() => void checkout()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-[11px] font-semibold hover:bg-amber-400/20 transition cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5" />
              {t('stickers.unlockPremium', 'Unlock all premium stickers')}
            </button>
          )}

          {/* Sticker Pack Selector Pills */}
          {highlightedPacks && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {sortedPacks.map((pack) => {
                const isLockedPack = pack.access === 'premium' && !premium;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setActivePackId(pack.id)}
                    title={pack.description}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium shrink-0 border transition cursor-pointer ${
                      activePackId === pack.id
                        ? 'border-[var(--nova-accent-color,#ff4e18)]/70 bg-[var(--nova-accent-color,#ff4e18)]/20 text-white font-semibold'
                        : 'border-white/5 bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{pack.icon}</span>
                    <span>{pack.name}</span>
                    {isStickerNew(pack) && (
                      <span className="text-[8px] px-1 py-0.5 rounded-md bg-emerald-400/20 text-emerald-300 font-bold">
                        NEW
                      </span>
                    )}
                    {isLockedPack && <Lock className="w-3 h-3 text-amber-300" />}
                  </button>
                );
              })}
            </div>
          )}

          {selectedPack?.imported && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5">
              <span className="flex-1 text-[10px] text-white/70 truncate">
                {t('stickers.importedPack', 'Imported pack')} • {selectedPack.stickers.length} stickers
              </span>
              <button
                type="button"
                onClick={() => handleRemoveImportedPack(selectedPack.id)}
                className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[9px] font-semibold text-red-300 hover:bg-red-500/20 transition cursor-pointer"
                title={t('stickers.removePack', 'Remove imported pack')}
              >
                <Trash2 className="w-3 h-3" />
                {t('stickers.removePack', 'Remove pack')}
              </button>
            </div>
          )}

          {/* Stickers Grid */}
          {visibleEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-white/40">
              <Sparkles className="w-5 h-5" />
              <span className="text-[11px]">{emptyMessage}</span>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto no-scrollbar p-1">
              {visibleEntries.map((entry) => {
                const { sticker, pack } = entry;
                const locked = isStickerLocked(sticker, pack, premium);
                const isFavorite = favoriteIds.includes(sticker.id);
                return (
                  <div key={sticker.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => handlePickSticker(entry)}
                      className={`w-full flex flex-col items-center justify-center p-2 rounded-2xl bg-[#191a27] border transition duration-150 cursor-pointer active:scale-95 shadow-md ${
                        locked
                          ? 'border-amber-400/20 hover:border-amber-400/50'
                          : 'border-white/5 hover:border-[var(--nova-accent-color,#ff4e18)]/50 hover:bg-[#232438]'
                      }`}
                      title={
                        locked
                          ? `${sticker.name} — ${t('stickers.premium', 'Premium')}`
                          : `${sticker.name} (${sticker.emoji})`
                      }
                    >
                      <div className="w-16 h-16 flex items-center justify-center group-hover:scale-110 transition duration-200">
                        <StickerMedia
                          sticker={sticker}
                          className={`w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] ${
                            locked ? 'grayscale opacity-30' : ''
                          }`}
                          emojiClassName={`text-3xl ${locked ? 'grayscale opacity-30' : ''}`}
                        />
                        {(sticker.animated || pack.animated) && !locked && (
                          <span className="absolute top-7 right-1 flex items-center gap-0.5 px-1 py-0.5 rounded-md bg-fuchsia-500/20 text-fuchsia-300 text-[7px] font-bold tracking-wider">
                            <Film className="w-2 h-2" />
                            ANIM
                          </span>
                        )}
                      </div>

                      {locked && (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-black/45">
                          <Lock className="w-4 h-4 text-amber-300" />
                          <span className="text-[8px] font-bold tracking-wider text-amber-300">PRO</span>
                        </span>
                      )}

                      <span className="text-[9px] text-white/70 truncate w-full text-center mt-1 font-medium">
                        {sticker.name}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(event) => handleToggleFavorite(event, sticker.id)}
                      className={`absolute top-1 right-1 p-1 rounded-lg transition cursor-pointer ${
                        isFavorite
                          ? 'text-amber-300'
                          : 'text-white/25 hover:text-white/80 opacity-0 group-hover:opacity-100 focus:opacity-100'
                      }`}
                      aria-label={
                        isFavorite
                          ? t('stickers.removeFavorite', 'Remove from favorites')
                          : t('stickers.addFavorite', 'Add to favorites')
                      }
                    >
                      <Star className={`w-3 h-3 ${isFavorite ? 'fill-current' : ''}`} />
                    </button>

                    {isStickerNew(pack) && !locked && (
                      <span className="absolute top-1 left-1 text-[7px] px-1 py-0.5 rounded-md bg-emerald-400/20 text-emerald-300 font-bold pointer-events-none">
                        NEW
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* EMOJIS TAB */}
      {activeTab === 'emoji' && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-semibold px-1">
            <span>{t('stickers.tapToInsert', 'Tap emoji to insert:')}</span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto no-scrollbar p-1">
            {EXTENDED_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelectEmoji(emoji)}
                className="text-2xl p-2 rounded-2xl hover:bg-white/10 hover:scale-125 transition active:scale-90 cursor-pointer shrink-0"
                title={`Insert ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* GIFS TAB */}
      {activeTab === 'gifs' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[#10111a] px-2.5 py-1.5 rounded-xl border border-white/5">
              <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
              <input
                type="text"
                value={gifSearch}
                onChange={(e) => setGifSearch(e.target.value)}
                placeholder={t('stickers.searchGifs', 'Search GIFs...')}
                className="w-full bg-transparent text-xs text-white placeholder-white/30 focus:outline-none"
              />
              {gifSearch && (
                <button
                  type="button"
                  onClick={() => setGifSearch('')}
                  className="text-white/40 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {['All', 'Cyberpunk', 'Celebration', 'Vibes'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGifCategory(cat)}
                  className={`text-[11px] px-2.5 py-1 rounded-xl transition cursor-pointer font-medium ${
                    gifCategory === cat
                      ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white'
                      : 'bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto no-scrollbar p-1">
            {filteredGifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSendGif(gif.url, gif.title)}
                className="group relative rounded-2xl overflow-hidden h-24 bg-black/40 border border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)] transition cursor-pointer active:scale-95"
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2 opacity-90 group-hover:opacity-100">
                  <span className="text-[10px] text-white font-medium truncate drop-shadow-md">
                    {gif.title}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
