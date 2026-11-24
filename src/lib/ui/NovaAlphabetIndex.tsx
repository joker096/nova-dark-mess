import { forwardRef, type HTMLAttributes, useRef, useState, useEffect } from 'react';

interface NovaAlphabetIndexProps extends HTMLAttributes<HTMLDivElement> {
  letters?: string[];
  onLetterClick?: (letter: string) => void;
  activeLetter?: string;
  scrollContainer?: HTMLElement | null;
}

const DEFAULT_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'
];

export const NovaAlphabetIndex = forwardRef<HTMLDivElement, NovaAlphabetIndexProps>(
  ({
    letters = DEFAULT_LETTERS,
    onLetterClick,
    activeLetter,
    scrollContainer,
    className,
    style,
    ...props
  }, ref) => {
    const [hoveredLetter, setHoveredLetter] = useState<string | null>(null);
    const lettersRef = useRef<HTMLDivElement>(null);
    const touchStartYRef = useRef(0);
    const touchLetterIndexRef = useRef(-1);

    const handleLetterClick = (letter: string, index: number) => {
      onLetterClick?.(letter);
    };

    const handleTouchStart = (e: React.TouchEvent, letter: string, index: number) => {
      e.preventDefault();
      touchStartYRef.current = e.touches[0].clientY;
      touchLetterIndexRef.current = index;
      handleLetterClick(letter, index);
      setHoveredLetter(letter);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      e.preventDefault();
      const currentY = e.touches[0].clientY;
      const delta = currentY - touchStartYRef.current;
      const letterHeight = 16; // approximate height per letter
      const newIndex = Math.max(0, Math.min(letters.length - 1, touchLetterIndexRef.current + Math.round(delta / letterHeight)));
      
      if (newIndex !== touchLetterIndexRef.current) {
        touchLetterIndexRef.current = newIndex;
        const newLetter = letters[newIndex];
        handleLetterClick(newLetter, newIndex);
        setHoveredLetter(newLetter);
      }
    };

    const handleTouchEnd = () => {
      setHoveredLetter(null);
    };

    const handleMouseEnter = (letter: string) => {
      setHoveredLetter(letter);
    };

    const handleMouseLeave = () => {
      setHoveredLetter(null);
    };

    return (
      <div
        ref={(el) => {
          lettersRef.current = el;
          if (ref) {
            if (typeof ref === 'function') ref(el);
            else ref.current = el;
          }
        }}
        className={`fixed right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-0.5 py-1 px-1 rounded-full bg-[var(--bg-field)]/80 backdrop-blur-sm ${className ?? ''}`}
        style={style}
        onTouchStart={(e) => {
          if (e.target === e.currentTarget) return;
        }}
        onTouchMove={(e) => {
          if (e.target === e.currentTarget) return;
        }}
        {...props}
      >
        {letters.map((letter, index) => (
          <button
            key={letter}
            type="button"
            onClick={() => handleLetterClick(letter, index)}
            onTouchStart={(e) => handleTouchStart(e, letter, index)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseEnter={() => handleMouseEnter(letter)}
            onMouseLeave={handleMouseLeave}
            className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
              activeLetter === letter
                ? 'text-[var(--c-primary)] bg-[var(--c-primary)]/10'
                : hoveredLetter === letter
                ? 'text-[var(--c-primary)] bg-[var(--c-primary)]/10'
                : 'text-[var(--text-secondary)] hover:text-[var(--c-primary)] hover:bg-[var(--c-primary)]/10'
            } min-w-4`}
            aria-label={letter === '#' ? 'Numbers and symbols' : letter}
          >
            {letter}
          </button>
        ))}
      </div>
    );
  }
);

NovaAlphabetIndex.displayName = 'NovaAlphabetIndex';

export type { NovaAlphabetIndexProps };