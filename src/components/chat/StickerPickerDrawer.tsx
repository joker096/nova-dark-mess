import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Smile,
  Film,
  X,
  Search,
  Sparkles,
  Star,
  Clock,
  Lock,
  Crown,
  Upload,
  Trash2,
  LayoutGrid,
  Rows3,
  Type,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { STICKER_PACKS } from '../../data/stickers';
import { StickerData } from '../../types/messenger';
import { useLanguage } from '../../context/LanguageContext';
import { usePremium } from '../../hooks/usePremium';
import { LazyMedia } from '../LazyMedia';
import {
  STICKER_SIZE_OPTIONS,
  loadMediaPreferences,
  saveMediaPreferences,
} from '../../lib/ui/mediaPreferences';
import type { StickerPickerDensity } from '../../lib/ui/mediaPreferences';
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
import { searchGifs, getTrendingGifs, GIF_CATEGORIES, type GifResult, configureGifApiKeys, getConfiguredGifApis } from '../../lib/gif/gifSearch';

interface StickerPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onSendSticker: (sticker: StickerData) => void;
  onSendGif: (gifUrl: string, title?: string) => void;
  /** Insert the sticker into the message text instead of sending it right away. */
  onSelectStickerText?: (sticker: StickerData) => void;
  /** Default sticker size used in the bubble preview. */
  stickerSize?: 'sm' | 'md' | 'lg';
  /** Insert a sticker into the text field instead of sending it immediately. */
  insertInsteadOfSend?: boolean;
  /** Called when the in-drawer sticker size / insert-mode controls change. */
  onPreferencesChange?: (change: {
    stickerSize?: 'sm' | 'md' | 'lg';
    insertInsteadOfSend?: boolean;
  }) => void;
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
  onSelectStickerText,
  stickerSize: stickerSizeProp,
  insertInsteadOfSend: insertInsteadOfSendProp,
  onPreferencesChange,
}) => {
  const { t } = useLanguage();
  const { premium, checkout } = usePremium();
  const [localPrefs, setLocalPrefs] = useState(loadMediaPreferences);
  const [activeTab, setActiveTab] = useState<'emoji' | 'stickers' | 'gifs'>('stickers');
  const [activePackId, setActivePackId] = useState<string>(STICKER_PACKS[0]?.id || 'cyber');
  const [filter, setFilter] = useState<string>('all');
  const [stickerSearch, setStickerSearch] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>(getRecentStickerIds);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(getFavoriteStickerIds);
  const [gifSearch, setGifSearch] = useState('');
  const [gifCategory, setGifCategory] = useState<string>('trending');
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifOffset, setGifOffset] = useState(0);
  const [gifHasMore, setGifHasMore] = useState(true);
  const gifObserverRef = useRef<IntersectionObserver | null>(null);
  const gifListRef = useRef<HTMLDivElement>(null);
  const [importedPacks, setImportedPacks] = useState(() => loadImportedStickerPacks());
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [, setActionsForId] = useState<string | null>(null);
  const actionsTargetIdRef = useRef<string | null>(null);
  const actionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sticker view settings (size / insert mode) are shared with the chat bubbles.
  const stickerSize = stickerSizeProp ?? localPrefs.stickerSize;
  const insertMode = insertInsteadOfSendProp ?? localPrefs.stickerInsertInsteadOfSend;
  const density = localPrefs.stickerPickerDensity;

  useEffect(() => {
    return () => {
      if (actionsTimerRef.current) clearTimeout(actionsTimerRef.current);
    };
  }, []);

  const updatePrefs = (patch: Partial<typeof localPrefs>) => {
    const next = saveMediaPreferences({ ...localPrefs, ...patch });
    setLocalPrefs(next);
    onPreferencesChange?.({ stickerSize: next.stickerSize, insertInsteadOfSend: next.stickerInsertInsteadOfSend });
  };

  const setDensity = (value: StickerPickerDensity) => {
    const next = saveMediaPreferences({ ...localPrefs, stickerPickerDensity: value });
    setLocalPrefs(next);
  };

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

  // GIF Search Effect
  const performGifSearch = useCallback(async (query: string, category: string, reset = true) => {
    setGifLoading(true);
    try {
      let result;
      if (category === 'trending' && !query.trim()) {
        result = await getTrendingGifs({ offset: 0, limit: 20 });
      } else {
        const searchQuery = query.trim() || GIF_CATEGORIES.find(c => c.id === category)?.query || 'funny';
        result = await searchGifs(searchQuery, { offset: 0, limit: 20 });
      }
      if (reset) {
        setGifResults(result.gifs);
      } else {
        setGifResults(prev => [...prev, ...result.gifs]);
      }
      setGifHasMore(result.gifs.length >= 20);
      setGifOffset(result.gifs.length);
    } catch (error) {
      console.error('GIF search failed:', error);
      setGifResults([]);
      setGifHasMore(false);
    } finally {
      setGifLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'gifs') {
      performGifSearch(gifSearch, gifCategory, true);
      setGifOffset(0);
    }
  }, [activeTab, gifSearch, gifCategory, performGifSearch]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!gifListRef.current) return;
    gifObserverRef.current = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && gifHasMore && !gifLoading) {
          loadMoreGifs();
        }
      },
      { rootMargin: '100px' }
    );
    const sentinel = gifListRef.current.querySelector('[data-gif-sentinel]');
    if (sentinel) gifObserverRef.current.observe(sentinel);
    return () => gifObserverRef.current?.disconnect();
  }, [gifHasMore, gifLoading]);

  const loadMoreGifs = useCallback(async () => {
    if (gifLoading || !gifHasMore) return;
    setGifLoading(true);
    try {
      let result;
      if (gifCategory === 'trending' && !gifSearch.trim()) {
        result = await getTrendingGifs({ offset: gifOffset, limit: 20 });
      } else {
        const searchQuery = gifSearch.trim() || GIF_CATEGORIES.find(c => c.id === gifCategory)?.query || 'funny';
        result = await searchGifs(searchQuery, { offset: gifOffset, limit: 20 });
      }
      setGifResults(prev => [...prev, ...result.gifs]);
      setGifHasMore(result.gifs.length >= 20);
      setGifOffset(prev => prev + result.gifs.length);
    } catch (error) {
      console.error('GIF load more failed:', error);
      setGifHasMore(false);
    } finally {
      setGifLoading(false);
    }
  }, [gifLoading, gifHasMore, gifOffset, gifCategory, gifSearch]);

  if (!isOpen) return null;

  const handlePickSticker = (entry: StickerEntry) => {
    if (isStickerLocked(entry.sticker, entry.pack, premium)) {
      void checkout();
      return;
    }
    setRecentIds(recordStickerUse(entry.sticker.id));
    // "Insert, don't send" mode keeps the sticker out of the history until the
    // user actually sends the composed message.
    if (insertMode && onSelectStickerText) {
      onSelectStickerText(entry.sticker);
      return;
    }
    onSendSticker(entry.sticker);
  };

  const handleToggleFavorite = (event: React.MouseEvent, stickerId: string) => {
    event.stopPropagation();
    setFavoriteIds(toggleStickerFavorite(stickerId));
  };

  /**
   * Long-press on a sticker (or right click) opens a tiny action panel — much
   * easier to reach with a thumb than the 12px star in the corner.
   */
  const openActions = (stickerId: string) => {
    if (actionsTimerRef.current) clearTimeout(actionsTimerRef.current);
    actionsTargetIdRef.current = stickerId;
    setActionsForId(stickerId);
    actionsTimerRef.current = setTimeout(() => {
      actionsTargetIdRef.current = null;
      setActionsForId(null);
    }, 2500);
  };

  const scheduleLongPress = (stickerId: string) => {
    if (actionsTimerRef.current) clearTimeout(actionsTimerRef.current);
    actionsTimerRef.current = setTimeout(() => openActions(stickerId), 450);
  };

  const cancelLongPress = () => {
    if (actionsTimerRef.current) {
      clearTimeout(actionsTimerRef.current);
      actionsTimerRef.current = null;
    }
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

  const segButtonClass = (active: boolean) =>
    `px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${active ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white' : 'text-white/55 hover:text-white'}`;

  const renderViewSettings = () => (
    <div className="flex items-center justify-between gap-1.5 flex-wrap" data-testid="sticker-view-settings">
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 bg-[#10111a] p-0.5 rounded-xl border border-white/5" role="group" aria-label={t('stickers.size', 'Sticker size')}>
          {STICKER_SIZE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updatePrefs({ stickerSize: option.value })}
              className={segButtonClass(stickerSize === option.value)}
              aria-pressed={stickerSize === option.value}
              title={t(`stickers.size.${option.value}`, `Sticker size ${option.label}`)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 bg-[#10111a] p-0.5 rounded-xl border border-white/5" role="group" aria-label={t('stickers.pickerDensity', 'Picker density')}>
          <button
            type="button"
            onClick={() => setDensity('comfortable')}
            className={segButtonClass(density === 'comfortable')}
            aria-pressed={density === 'comfortable'}
            title={t('stickers.density.comfortable', 'Large stickers, fewer per row')}
          >
            <LayoutGrid className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setDensity('compact')}
            className={segButtonClass(density === 'compact')}
            aria-pressed={density === 'compact'}
            title={t('stickers.density.compact', 'Small stickers, more per row')}
          >
            <Rows3 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => updatePrefs({ stickerInsertInsteadOfSend: !insertMode })}
        className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold border transition cursor-pointer ${
          insertMode
            ? 'border-[var(--nova-accent-color,#ff4e18)]/70 bg-[var(--nova-accent-color,#ff4e18)]/20 text-white'
            : 'border-white/5 bg-white/5 text-white/55 hover:text-white'
        }`}
        aria-pressed={insertMode}
        title={t('stickers.insertModeHint', 'Tap a sticker to put it in the text field instead of sending it')}
      >
        <Type className="w-3 h-3" />
        {t('stickers.insertMode', 'Insert, don\'t send')}
      </button>
    </div>
  );

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
                aria-label="Clear sticker search"
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

          {/* Sticker view settings: size, picker density, insert-vs-send */}
          {renderViewSettings()}

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

          {/* Sticker Pack Selector Rail — compact icon tabs, thumb friendly */}
          {highlightedPacks && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label={t('stickers.packs', 'Sticker packs')}>
              <button
                type="button"
                onClick={() => setFilter('recent')}
                className={filterChipClass(false)}
                title={t('stickers.recent', 'Recent')}
                aria-label={t('stickers.recent', 'Recent')}
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFilter('favorites')}
                className={filterChipClass(false)}
                title={t('stickers.favorites', 'Favorites')}
                aria-label={t('stickers.favorites', 'Favorites')}
              >
                <Star className="w-3.5 h-3.5" />
              </button>
              <span className="w-px h-5 bg-white/10 shrink-0 mx-0.5" />
              {sortedPacks.map((pack) => {
                const isLockedPack = pack.access === 'premium' && !premium;
                const isActivePack = highlightedPacks && activePackId === pack.id;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setActivePackId(pack.id)}
                    title={`${pack.name} — ${pack.description}`}
                    aria-label={pack.name}
                    aria-pressed={isActivePack}
                    className={`relative flex flex-col items-center justify-center w-11 h-11 rounded-2xl shrink-0 border transition cursor-pointer active:scale-95 ${
                      isActivePack
                        ? 'border-[var(--nova-accent-color,#ff4e18)]/80 bg-[var(--nova-accent-color,#ff4e18)]/20 text-white'
                        : 'border-white/5 bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="text-base leading-none">{pack.icon}</span>
                    <span className="text-[8px] font-semibold truncate w-full text-center mt-0.5 px-0.5">
                      {pack.name}
                    </span>
                    {isStickerNew(pack) && (
                      <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                    )}
                    {isLockedPack && (
                      <Lock className="absolute top-1 right-1 w-2.5 h-2.5 text-amber-300" />
                    )}
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
            <div
              className={`grid gap-2 max-h-52 overflow-y-auto no-scrollbar p-1 ${density === 'compact' ? 'grid-cols-5 sm:grid-cols-8' : 'grid-cols-4 sm:grid-cols-6'}`}
              data-density={density}
            >
              {visibleEntries.map((entry) => {
                const { sticker, pack } = entry;
                const locked = isStickerLocked(sticker, pack, premium);
                const isFavorite = favoriteIds.includes(sticker.id);
                const compact = density === 'compact';
                return (
                  <div key={sticker.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => handlePickSticker(entry)}
                      onPointerDown={() => scheduleLongPress(sticker.id)}
                      onPointerUp={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onPointerCancel={cancelLongPress}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openActions(sticker.id);
                      }}
                      className={`w-full flex flex-col items-center justify-center rounded-2xl bg-[#191a27] border transition duration-150 cursor-pointer active:scale-95 shadow-md touch-manipulation ${
                        compact ? 'p-1' : 'p-2'
                      } ${
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
                      <div
                        className={`${compact ? 'w-11 h-11' : 'w-16 h-16'} flex items-center justify-center group-hover:scale-110 transition duration-200`}
                      >
                        <StickerMedia
                          sticker={sticker}
                          className={`w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] ${
                            locked ? 'grayscale opacity-30' : ''
                          }`}
                          emojiClassName={`${compact ? 'text-2xl' : 'text-3xl'} ${locked ? 'grayscale opacity-30' : ''}`}
                        />
                        {(sticker.animated || pack.animated) && !locked && !compact && (
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

                      {!compact && (
                        <span className="text-[9px] text-white/70 truncate w-full text-center mt-1 font-medium">
                          {sticker.name}
                        </span>
                      )}
                    </button>

                    {/* Quick action: insert into text instead of sending */}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (actionsTargetIdRef.current === sticker.id) {
                          if (actionsTimerRef.current) clearTimeout(actionsTimerRef.current);
                          actionsTargetIdRef.current = null;
                          setActionsForId(null);
                        }
                        onSelectStickerText?.(sticker);
                      }}
                      className={`absolute bottom-0.5 left-0.5 p-1 rounded-lg bg-black/60 backdrop-blur-sm transition cursor-pointer ${isFavorite ? 'text-white/70 hover:text-white' : 'text-white/60 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                      aria-label={t('stickers.insert', 'Insert sticker into message')}
                      title={t('stickers.insertHint', 'Insert into the text field')}
                    >
                      <Type className="w-3 h-3" />
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
          {renderViewSettings()}
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
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[150px] flex items-center gap-2 bg-[#10111a] px-2.5 py-1.5 rounded-xl border border-white/5">
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
                  aria-label="Clear GIF search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {GIF_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setGifCategory(cat.id);
                    setGifSearch('');
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-xl transition cursor-pointer font-medium flex items-center gap-1 ${
                    gifCategory === cat.id
                      ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white'
                      : 'bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  <span className="text-[12px]">{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            ref={gifListRef}
            className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto no-scrollbar p-1"
            role="list"
            aria-label={t('stickers.gifResults', 'GIF search results')}
          >
            {gifResults.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSendGif(gif.url, gif.title)}
                className="group relative rounded-2xl overflow-hidden h-24 bg-black/40 border border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)] transition cursor-pointer active:scale-95"
                role="listitem"
              >
                <LazyMedia
                  src={gif.previewUrl || gif.url}
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

            {/* Loading sentinel for infinite scroll */}
            {gifHasMore && (
              <div data-gif-sentinel className="col-span-full flex items-center justify-center py-4">
                {gifLoading && (
                  <Loader2 className="w-5 h-5 text-[var(--nova-accent-color)] animate-spin" />
                )}
              </div>
            )}

            {/* Empty state */}
            {gifResults.length === 0 && !gifLoading && (
              <div className="col-span-full text-center py-8 text-white/40 text-sm">
                {gifSearch.trim()
                  ? t('stickers.noGifsFound', 'No GIFs found for "{query}"', { query: gifSearch })
                  : t('stickers.noGifsCategory', 'No GIFs in this category')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
