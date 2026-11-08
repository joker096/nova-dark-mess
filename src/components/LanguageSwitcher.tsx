import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, LanguageItem, Language } from '../context/LanguageContext';
import { Globe, Check, ChevronDown } from 'lucide-react';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, changeLanguage, languages } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l: LanguageItem) => l.code === language) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-xl transition-all duration-200 border border-slate-700/50 bg-slate-900/80 hover:bg-slate-800 text-slate-200 shadow-md backdrop-blur-sm ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
        }`}
        title="Change Language / Змінити мову / Сменить язык"
      >
        <span className="text-base leading-none">{currentLang.flag}</span>
        <span className="font-medium tracking-wide">{compact ? currentLang.code.toUpperCase() : currentLang.nativeName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl bg-slate-900/95 border border-slate-700/60 shadow-2xl backdrop-blur-md z-50 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-cyan-400" />
            Language / Мова
          </div>
          {languages.map((lang: LanguageItem) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                changeLanguage(lang.code as Language);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors ${
                language === lang.code ? 'text-cyan-400 font-semibold bg-cyan-500/5' : 'text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{lang.flag}</span>
                <span>{lang.nativeName}</span>
              </div>
              {language === lang.code && <Check className="w-4 h-4 text-cyan-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
