import React, { useState } from 'react';
import { Smile, Image as ImageIcon, Film, X, Search, Sparkles } from 'lucide-react';
import { STICKER_PACKS, MOCK_GIFS } from '../../data/stickers';
import { StickerData } from '../../types/messenger';
import { useLanguage } from '../../context/LanguageContext';

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

export const StickerPickerDrawer: React.FC<StickerPickerDrawerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  onSendSticker,
  onSendGif,
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'emoji' | 'stickers' | 'gifs'>('stickers');
  const [activePackId, setActivePackId] = useState<string>(STICKER_PACKS[0]?.id || 'cyber');
  const [gifSearch, setGifSearch] = useState('');
  const [gifCategory, setGifCategory] = useState<string>('All');

  if (!isOpen) return null;

  const currentPack = STICKER_PACKS.find((p) => p.id === activePackId) || STICKER_PACKS[0];

  const filteredGifs = MOCK_GIFS.filter((gif) => {
    const matchesCategory = gifCategory === 'All' || gif.category.toLowerCase() === gifCategory.toLowerCase();
    const matchesSearch = !gifSearch.trim() || gif.title.toLowerCase().includes(gifSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer"
          title={t('common.close', 'Close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* STICKERS TAB */}
      {activeTab === 'stickers' && (
        <div className="space-y-2">
          {/* Sticker Pack Selector Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {STICKER_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => setActivePackId(pack.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium shrink-0 border transition cursor-pointer ${
                  activePackId === pack.id
                    ? 'border-[var(--nova-accent-color,#ff4e18)]/70 bg-[var(--nova-accent-color,#ff4e18)]/20 text-white font-semibold'
                    : 'border-white/5 bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{pack.icon}</span>
                <span>{pack.name}</span>
              </button>
            ))}
          </div>

          {/* Stickers Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto no-scrollbar p-1">
            {currentPack?.stickers.map((stk) => (
              <button
                key={stk.id}
                type="button"
                onClick={() => onSendSticker(stk)}
                className="group relative flex flex-col items-center justify-center p-2 rounded-2xl bg-[#191a27] hover:bg-[#232438] border border-white/5 hover:border-[var(--nova-accent-color,#ff4e18)]/50 transition duration-150 cursor-pointer active:scale-95 shadow-md"
                title={`${stk.name} (${stk.emoji})`}
              >
                <div className="w-16 h-16 flex items-center justify-center group-hover:scale-110 transition duration-200">
                  {stk.imageUrl ? (
                    <img
                      src={stk.imageUrl}
                      alt={stk.name}
                      className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                    />
                  ) : (
                    <span className="text-3xl">{stk.emoji}</span>
                  )}
                </div>
                <span className="text-[9px] text-white/70 truncate w-full text-center mt-1 font-medium">
                  {stk.name}
                </span>
              </button>
            ))}
          </div>
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
