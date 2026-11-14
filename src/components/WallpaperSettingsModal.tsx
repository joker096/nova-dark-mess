import React, { useState } from 'react';
import {
  X,
  Check,
  RotateCw,
  Palette,
  Layers,
  Sparkles,
  Sliders,
  CheckCheck,
  Lock,
} from 'lucide-react';
import {
  WALLPAPER_OPTIONS,
  WallpaperId,
  WallpaperOption,
  WallpaperCategory,
} from '../data/wallpapers';
import { DoodleBackground } from './DoodleBackground';
import { usePremium } from '../hooks/usePremium';

interface WallpaperSettingsModalProps {
  isOpen: boolean;
  currentWallpaper: WallpaperId;
  intensity?: number;
  onSelect: (id: WallpaperId) => void;
  onIntensityChange?: (intensity: number) => void;
  onCycle: () => void;
  onClose: () => void;
}

export const WallpaperSettingsModal: React.FC<WallpaperSettingsModalProps> = ({
  isOpen,
  currentWallpaper,
  intensity = 70,
  onSelect,
  onIntensityChange,
  onCycle,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<WallpaperCategory>('all');
  const [localIntensity, setLocalIntensity] = useState<number>(intensity);
  const { canUse, checkout } = usePremium();
  const premiumWallpapers = canUse('wallpaper');

  if (!isOpen) return null;

  const filteredWallpapers = WALLPAPER_OPTIONS.filter((item) => {
    if (selectedCategory === 'all') return true;
    return item.category === selectedCategory;
  });

  const activeOption =
    WALLPAPER_OPTIONS.find((w) => w.id === currentWallpaper) || WALLPAPER_OPTIONS[0];

  const handleIntensitySlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalIntensity(val);
    if (onIntensityChange) {
      onIntensityChange(val);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md p-4 text-white shadow-2xl space-y-4 animate-in slide-in-from-bottom-4 duration-300 max-h-[92vh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/30 flex items-center justify-center text-[var(--nova-accent-color)]">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white leading-tight">
                Chat Background
              </h3>
              <p className="text-[10.5px] text-[#828795]">
                Dark abstract gradients & geometric patterns
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Cycle / Shuffle button */}
            <button
              onClick={onCycle}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color)] hover:text-white border border-white/10 text-white/80 transition flex items-center gap-1.5 text-[11px] font-medium cursor-pointer active:scale-95"
              title="Cycle to next wallpaper"
            >
              <RotateCw className="w-3 h-3" />
              <span>Cycle</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
              title="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Mini Preview with Chat Message Samples */}
        <div className="relative rounded-2xl overflow-hidden border border-white/10 p-3 h-24 flex flex-col justify-between shadow-inner">
          <DoodleBackground wallpaperId={currentWallpaper} intensity={localIntensity} />

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-white/90 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10">
                {activeOption.name}
              </span>
              <span className="text-[9px] text-[var(--nova-accent-color)] font-medium bg-[var(--nova-accent-color)]/15 px-1.5 py-0.5 rounded-full border border-[var(--nova-accent-color)]/30 uppercase tracking-wider">
                Active
              </span>
            </div>
            <span className="text-[9.5px] text-white/60 bg-black/40 px-2 py-0.5 rounded-full">
              Live Preview
            </span>
          </div>

          {/* Sample Chat Bubbles */}
          <div className="relative z-10 space-y-1.5">
            <div className="flex justify-start">
              <div className="bg-[#181921]/90 border border-white/[0.08] text-[#e5e7eb] rounded-[14px] rounded-tl-[2px] px-2.5 py-1 text-[11px] shadow-sm max-w-[70%]">
                Sounds good, let's meet at 7pm!
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-gradient-to-r from-[var(--nova-accent-color, ff521a)] to-[var(--nova-accent-color, ff3b00)] text-white rounded-[14px] rounded-br-[2px] px-2.5 py-1 text-[11px] shadow-md shadow-[var(--nova-accent-color)]/20 flex items-center gap-1.5">
                <span>Deal! See you there 🙌</span>
                <CheckCheck className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Category Segmented Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#181924] rounded-xl border border-white/5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              selectedCategory === 'all'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-sm shadow-[var(--nova-accent-color)]/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>All ({WALLPAPER_OPTIONS.length})</span>
          </button>

          <button
            onClick={() => setSelectedCategory('gradients')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              selectedCategory === 'gradients'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-sm shadow-[var(--nova-accent-color)]/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Abstract Gradients</span>
          </button>

          <button
            onClick={() => setSelectedCategory('geometric')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              selectedCategory === 'geometric'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-sm shadow-[var(--nova-accent-color)]/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>Geometric</span>
          </button>
        </div>

        {/* Wallpaper Grid */}
        <div className="grid grid-cols-2 gap-2.5 overflow-y-auto no-scrollbar py-1 pr-0.5 flex-1 max-h-[38vh]">
          {filteredWallpapers.map((item: WallpaperOption) => {
            const isSelected = item.id === currentWallpaper;
            const isLocked = item.premium === true && !premiumWallpapers;

            return (
              <div
                key={item.id}
                data-testid={`wallpaper-${item.id}`}
                data-premium-locked={isLocked ? 'true' : undefined}
                role="button"
                tabIndex={0}
                aria-label={`${item.name}${isLocked ? ' (Premium)' : ''}`}
                aria-disabled={isLocked || undefined}
                onClick={() => {
                  // Premium wallpapers open the local checkout instead of applying.
                  if (isLocked) {
                    void checkout();
                    return;
                  }
                  onSelect(item.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  if (isLocked) {
                    void checkout();
                    return;
                  }
                  onSelect(item.id);
                }}
                className={`relative rounded-2xl overflow-hidden border p-3 cursor-pointer transition-all duration-200 flex flex-col justify-between min-h-[104px] group active:scale-[0.98] ${
                  isSelected
                    ? 'border-[var(--nova-accent-color)] ring-2 ring-[var(--nova-accent-color)]/40 shadow-lg shadow-[var(--nova-accent-color)]/15 bg-[#1b1d28]'
                    : 'border-white/10 hover:border-white/25 bg-[#161722]'
                }`}
              >
                {/* Visual Swatch Preview with actual SVG/Gradient Wallpaper */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none opacity-90">
                  <DoodleBackground wallpaperId={item.id} intensity={localIntensity} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#12131c] via-[#12131c]/50 to-transparent" />
                </div>

                {/* Top Badge / Active indicator */}
                <div className="relative z-10 flex items-center justify-between">
                  {item.badge ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-white/80 font-medium">
                      {item.badge}
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/50 font-medium">
                      {item.category === 'gradients' ? 'Gradient' : 'Geometric'}
                    </span>
                  )}

                  {isLocked ? (
                    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-black/45 backdrop-blur-md text-amber-300 border border-amber-400/40 font-semibold">
                      <Lock className="w-2.5 h-2.5" />
                      Premium
                    </span>
                  ) : (
                    isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[var(--nova-accent-color)] flex items-center justify-center text-white shadow-md shadow-[var(--nova-accent-color)]/50 animate-in zoom-in-75 duration-150">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )
                  )}
                </div>

                {/* Bottom Title & Subtitle */}
                <div className="relative z-10 mt-4">
                  <p className="text-xs font-bold text-white truncate group-hover:text-[var(--nova-accent-color)] transition">
                    {item.name}
                  </p>
                  <p className="text-[9.5px] text-[#9196a6] truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pattern & Glow Intensity Slider */}
        <div className="bg-[#171824] border border-white/5 rounded-2xl p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/70 font-medium flex items-center gap-1.5">
              <Sliders className="w-3 h-3 text-[var(--nova-accent-color)]" />
              Pattern & Glow Intensity
            </span>
            <span className="text-white/90 font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded-md">
              {localIntensity}%
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[9px] text-white/40">Subtle</span>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={localIntensity}
              onChange={handleIntensitySlider}
              className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff4e18]"
            />
            <span className="text-[9px] text-white/40">Vivid</span>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center pt-1 border-t border-white/5 flex items-center justify-between text-[10.5px] text-[#6a6f7e]">
          <span>Saved across sessions in browser</span>
          <button
            onClick={() => onSelect('neon-nebula')}
            className="text-[var(--nova-accent-color)] hover:underline cursor-pointer"
          >
            Reset default
          </button>
        </div>
      </div>
    </div>
  );
};
