/**
 * React hooks for accessibility features.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  useReducedMotion,
  announce,
  trapFocus,
  getFocusableElements,
  focusElement,
  initAccessibility,
  REDUCED_MOTION_QUERY,
} from './a11y';

// ─── Reduced Motion Hook ──────────────────────────────────────────────

/** Hook to get reduced motion preference */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion();
}

/** Get animation duration respecting reduced motion */
export function useAnimationDuration(normalMs: number): number {
  const reduced = useReducedMotion();
  return reduced ? 0 : normalMs;
}

// ─── Live Announcements ───────────────────────────────────────────────

/** Hook for announcing messages to screen readers */
export function useAnnounce() {
  const [, forceUpdate] = useState(0);

  const announceMessage = useCallback(
    (message: string, politeness: 'polite' | 'assertive' = 'polite') => {
      announce(message, politeness);
      forceUpdate((n) => n + 1);
    },
    []
  );

  return announceMessage;
}

// ─── Focus Management ─────────────────────────────────────────────────

/** Hook for focus trapping in modals/drawers */
export function useFocusTrap(
  isActive: boolean,
  onEscape?: () => void
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !ref.current) return;
    const cleanup = trapFocus(ref.current, onEscape);
    return cleanup;
  }, [isActive, onEscape]);

  return ref;
}

/** Hook to manage focus restoration */
export function useFocusRestore(): [
  (el: HTMLElement | null) => void,
  () => void
] {
  const previousRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback((el: HTMLElement | null) => {
    previousRef.current = el ?? (document.activeElement as HTMLElement);
  }, []);

  const restoreFocus = useCallback(() => {
    if (previousRef.current?.isConnected) {
      previousRef.current.focus({ preventScroll: true });
      previousRef.current = null;
    }
  }, []);

  return [saveFocus, restoreFocus];
}

/** Hook to auto-focus an element on mount */
export function useAutoFocus<T extends HTMLElement>(
  condition = true
): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (condition && ref.current) {
      ref.current.focus({ preventScroll: true });
    }
  }, [condition]);
  return ref;
}

// ─── Keyboard Navigation ──────────────────────────────────────────────

/** Hook for arrow key navigation in lists/grids */
export function useArrowNavigation(
  total: number,
  onSelect: (index: number) => void,
  options: {
    orientation?: 'horizontal' | 'vertical' | 'grid';
    cols?: number;
    loop?: boolean;
    initialIndex?: number;
  } = {}
) {
  const { orientation = 'vertical', cols = 1, loop = true, initialIndex = 0 } = options;
  const [index, setIndex] = useState(initialIndex);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const { currentIndex, total: t, onChange, orientation: o, cols: c, loop: l } = {
        currentIndex: index,
        total,
        onChange: setIndex,
        orientation,
        cols,
        loop,
      };

      let nextIndex = currentIndex;
      let handled = false;

      const isHorizontal = o === 'horizontal';
      const isGrid = o === 'grid';

      switch (event.key) {
        case 'ArrowRight':
          if (isHorizontal || isGrid) {
            nextIndex = currentIndex + 1;
            handled = true;
          }
          break;
        case 'ArrowLeft':
          if (isHorizontal || isGrid) {
            nextIndex = currentIndex - 1;
            handled = true;
          }
          break;
        case 'ArrowDown':
          if (!isHorizontal) {
            nextIndex = isGrid ? currentIndex + c : currentIndex + 1;
            handled = true;
          }
          break;
        case 'ArrowUp':
          if (!isHorizontal) {
            nextIndex = isGrid ? currentIndex - c : currentIndex - 1;
            handled = true;
          }
          break;
        case 'Home':
          nextIndex = 0;
          handled = true;
          break;
        case 'End':
          nextIndex = t - 1;
          handled = true;
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          onSelect(currentIndex);
          return;
        default:
          return;
      }

      if (handled) {
        if (l) {
          nextIndex = (nextIndex + t) % t;
        } else {
          nextIndex = Math.max(0, Math.min(t - 1, nextIndex));
        }
        if (nextIndex !== currentIndex) {
          setIndex(nextIndex);
        }
        event.preventDefault();
      }
    },
    [index, total, orientation, cols, loop, onSelect]
  );

  return { index, setIndex, onKeyDown: handleKeyDown };
}

// ─── Skip Link ────────────────────────────────────────────────────────

/** Hook to ensure skip link exists */
export function useSkipLink(mainId = 'main-content'): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('a11y-skip-link')) {
      const link = document.createElement('a');
      link.id = 'a11y-skip-link';
      link.href = `#${mainId}`;
      link.textContent = 'Skip to main content';
      Object.assign(link.style, {
        position: 'absolute',
        top: '-100%',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        background: 'var(--nova-accent-color, #ff4e18)',
        color: 'white',
        fontWeight: 600,
        borderRadius: '8px',
        zIndex: 9999,
        transition: 'top 0.2s',
      });
      link.addEventListener('focus', () => {
        link.style.top = '8px';
      });
      link.addEventListener('blur', () => {
        link.style.top = '-100%';
      });
      document.body.prepend(link);
    }
  }, [mainId]);
}

// ─── Heading Structure ────────────────────────────────────────────────

/** Hook to validate heading hierarchy */
export function useHeadingStructure(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let prevLevel = 0;
    headings.forEach((h) => {
      const level = parseInt(h.tagName[1], 10);
      if (level > prevLevel + 1) {
        console.warn(
          `[A11y] Heading level jump: h${prevLevel} -> h${level}`,
          h
        );
      }
      prevLevel = level;
    });
  }, []);
}

// ─── Initialization ───────────────────────────────────────────────────

/** Initialize accessibility on app start */
export function useInitAccessibility(): void {
  useEffect(() => {
    initAccessibility();
  }, []);
}

// ─── Focus Visible Polyfill ───────────────────────────────────────────

/** Apply focus-visible styles globally */
export function useFocusVisible(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Add focus-visible class for keyboard focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        document.body.classList.add('keyboard-nav');
      }
    };
    const handleMouseDown = () => {
      document.body.classList.remove('keyboard-nav');
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);
}