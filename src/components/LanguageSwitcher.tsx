import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage, LanguageItem, Language } from '../context/LanguageContext';
import { Globe, Check, ChevronDown } from 'lucide-react';

const MENU_WIDTH = 208;
const MENU_GAP = 6;
const MENU_MARGIN = 8;
const MENU_MAX_HEIGHT = 340;

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, changeLanguage, languages } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l: LanguageItem) => l.code === language) || languages[0];

  // Anchor the menu to the trigger but keep it fully inside the viewport, so it is
  // never clipped by a scrollable/overflow-hidden ancestor such as the settings modal.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, window.innerWidth - MENU_MARGIN * 2);
    // Prefer aligning the menu to the trigger's left edge; fall back to right-aligning
    // when it would run off the right side of the viewport.
    let left = rect.left;
    if (left + width > window.innerWidth - MENU_MARGIN) {
      left = rect.right - width;
    }
    left = Math.max(MENU_MARGIN, Math.min(left, window.innerWidth - width - MENU_MARGIN));
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - MENU_MARGIN;
    const spaceAbove = rect.top - MENU_GAP - MENU_MARGIN;
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 220) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? rect.top - MENU_GAP - maxHeight : rect.bottom + MENU_GAP;
    setMenuStyle({
      position: 'fixed',
      top: Math.max(MENU_MARGIN, top),
      left,
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    // Keep the dropdown open while it scrolls itself or while the settings
    // pane scrolls behind it; only close when the trigger leaves the viewport.
    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      if (target && triggerRef.current?.contains(target)) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        setIsOpen(false);
        return;
      }
      updatePosition();
    };
    const handleReflow = () => setIsOpen(false);

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleReflow);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleReflow);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className={`flex items-center gap-2 rounded-xl transition-all duration-200 border border-white/10 bg-[#1a1b26] hover:bg-[#22242f] text-white/90 hover:text-white shadow-md backdrop-blur-sm cursor-pointer ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
        }`}
        title="Change Language / Змінити мову / Сменить язык"
      >
        <span className="text-base leading-none">{currentLang.flag}</span>
        <span className="font-medium tracking-wide">{compact ? currentLang.code.toUpperCase() : currentLang.nativeName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/45 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="z-[120] flex flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] rounded-xl bg-[#14151d]/98 border border-white/15 shadow-2xl shadow-black/70 backdrop-blur-xl py-1.5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="sticky top-0 shrink-0 bg-[#14151d]/98 px-3 py-1.5 text-[10px] font-bold text-white/45 uppercase tracking-wider border-b border-white/5 flex items-center gap-1.5">
              <Globe className="w-3 h-3 text-[var(--nova-accent-color)]" />
              Language / Мова
            </div>
            {languages.map((lang: LanguageItem) => (
              <button
                key={lang.code}
                type="button"
                aria-pressed={language === lang.code}
                onClick={() => {
                  changeLanguage(lang.code as Language);
                  setIsOpen(false);
                }}
                className={`w-full shrink-0 text-left px-3.5 py-2.5 text-sm flex items-center justify-between hover:bg-white/[0.06] transition-colors cursor-pointer ${
                  language === lang.code
                    ? 'text-[var(--nova-accent-color)] font-semibold bg-[var(--nova-accent-color)]/10'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{lang.flag}</span>
                  <span>{lang.nativeName}</span>
                </div>
                {language === lang.code && <Check className="w-4 h-4 text-[var(--nova-accent-color)]" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
};
