/**
 * Accessibility utilities for Nova Dark Messenger.
 * Provides helpers for ARIA, focus management, live regions, and WCAG compliance.
 */

// ─── Reduced Motion ────────────────────────────────────────────────────

/** Media query for prefers-reduced-motion */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Hook to detect reduced motion preference */
export function useReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  return mq.matches;
}

/** CSS class for elements that should respect reduced motion */
export const RESPECT_REDUCED_MOTION = 'respect-reduced-motion';

/** Apply reduced motion styles via CSS custom properties */
export function initReducedMotionStyles(): void {
  if (typeof document === 'undefined') return;
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  const apply = (matches: boolean) => {
    document.documentElement.style.setProperty(
      '--animation-duration',
      matches ? '0.01ms' : 'var(--animation-duration-default, 200ms)'
    );
    document.documentElement.style.setProperty(
      '--transition-duration',
      matches ? '0.01ms' : 'var(--transition-duration-default, 200ms)'
    );
  };
  apply(mq.matches);
  mq.addEventListener('change', (e) => apply(e.matches));
}

// ─── Live Regions (Announcements for Screen Readers) ──────────────────

interface LiveRegionOptions {
  /** Politeness level: 'polite' (default) or 'assertive' */
  politeness?: 'polite' | 'assertive';
  /** Optional ID for the live region */
  id?: string;
}

/** Creates a live region element for announcements */
export function createLiveRegion(options: LiveRegionOptions = {}): HTMLDivElement {
  const region = document.createElement('div');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', options.politeness ?? 'polite');
  region.setAttribute('aria-atomic', 'true');
  if (options.id) region.id = options.id;
  // Visually hidden but accessible
  Object.assign(region.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
  document.body.appendChild(region);
  return region;
}

/** Announce a message to screen readers */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  const region = createLiveRegion({ politeness });
  // Clear and set to trigger announcement
  region.textContent = '';
  // Force reflow
  void region.offsetHeight;
  region.textContent = message;
  // Clean up after announcement
  setTimeout(() => {
    region.remove();
  }, 3000);
}

/** Hook for easy announcements in components */
export function useAnnounce() {
  return (message: string, politeness?: 'polite' | 'assertive') => announce(message, politeness);
}

// ─── Focus Management ──────────────────────────────────────────────────

/** Focus an element with proper scroll behavior */
export function focusElement(el: HTMLElement | null, preventScroll = true): void {
  if (!el) return;
  el.focus({ preventScroll });
}

/** Restore focus to previously focused element */
export function restoreFocus(previous: HTMLElement | null): void {
  if (previous && previous.isConnected) {
    previous.focus({ preventScroll: true });
  }
}

/** Get all focusable elements within a container */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(',');
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/** Trap focus within a container (for modals, drawers) */
export function trapFocus(
  container: HTMLElement,
  onEscape?: () => void
): () => void {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return () => {};

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;

    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || active === container) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', handler, true);
  first.focus({ preventScroll: true });

  return () => document.removeEventListener('keydown', handler, true);
}

// ─── Keyboard Navigation Helpers ──────────────────────────────────────

/** Handle arrow key navigation in a list/grid */
export interface ArrowNavigationOptions {
  /** Current index */
  currentIndex: number;
  /** Total items */
  total: number;
  /** On index change */
  onChange: (index: number) => void;
  /** Orientation: 'horizontal' | 'vertical' | 'grid' */
  orientation?: 'horizontal' | 'vertical' | 'grid';
  /** Grid columns (for grid orientation) */
  cols?: number;
  /** Wrap around */
  loop?: boolean;
}

/** Handle arrow key event for navigation */
export function handleArrowNavigation(
  event: React.KeyboardEvent,
  options: ArrowNavigationOptions
): boolean {
  const { currentIndex, total, onChange, orientation = 'vertical', cols = 1, loop = true } = options;
  let nextIndex = currentIndex;
  let handled = false;

  const isHorizontal = orientation === 'horizontal';
  const isGrid = orientation === 'grid';

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
        nextIndex = isGrid ? currentIndex + cols : currentIndex + 1;
        handled = true;
      }
      break;
    case 'ArrowUp':
      if (!isHorizontal) {
        nextIndex = isGrid ? currentIndex - cols : currentIndex - 1;
        handled = true;
      }
      break;
    case 'Home':
      nextIndex = 0;
      handled = true;
      break;
    case 'End':
      nextIndex = total - 1;
      handled = true;
      break;
    default:
      return false;
  }

  if (handled) {
    if (loop) {
      nextIndex = (nextIndex + total) % total;
    } else {
      nextIndex = Math.max(0, Math.min(total - 1, nextIndex));
    }
    if (nextIndex !== currentIndex) {
      onChange(nextIndex);
    }
    event.preventDefault();
    return true;
  }

  return false;
}

// ─── Color Contrast & Visual ──────────────────────────────────────────

/** WCAG contrast ratio between two colors (sRGB) */
export function getContrastRatio(hex1: string, hex2: string): number {
  const luminance = (hex: string): number => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  const expanded = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(expanded, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/** Check if contrast meets WCAG AA (4.5:1) or AAA (7:1) */
export function meetsContrast(hex1: string, hex2: string, level: 'AA' | 'AAA' = 'AA'): boolean {
  const ratio = getContrastRatio(hex1, hex2);
  return level === 'AA' ? ratio >= 4.5 : ratio >= 7;
}

// ─── ARIA Helpers ─────────────────────────────────────────────────────

/** Generate unique ID for ARIA relationships */
let idCounter = 0;
export function generateId(prefix = 'a11y'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${++idCounter}-${hex}`;
}

/** Common ARIA attributes for buttons */
export interface ButtonAriaProps {
  'aria-label'?: string;
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  'aria-haspopup'?: 'dialog' | 'menu' | 'listbox' | 'tree' | 'grid';
  disabled?: boolean;
}

/** Common ARIA attributes for dialogs */
export interface DialogAriaProps {
  role: 'dialog' | 'alertdialog';
  'aria-modal': 'true';
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/** Common ARIA attributes for lists */
export interface ListAriaProps {
  role?: 'list' | 'listbox' | 'menu' | 'tree' | 'grid';
  'aria-label'?: string;
  'aria-orientation'?: 'horizontal' | 'vertical';
}

/** Common ARIA attributes for list items */
export interface ListItemAriaProps {
  role?: 'listitem' | 'option' | 'menuitem' | 'treeitem' | 'gridcell';
  'aria-selected'?: boolean;
  'aria-checked'?: boolean;
  'aria-disabled'?: boolean;
  'aria-level'?: number;
  'aria-posinset'?: number;
  'aria-setsize'?: number;
}

/** Visually hidden but screen-reader accessible style */
export const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

// ─── Skip Link ────────────────────────────────────────────────────────

/** Create a skip-to-main-content link */
export function createSkipLink(mainId = 'main-content'): HTMLAnchorElement {
  const link = document.createElement('a');
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
  return link;
}

// ─── Initialization ────────────────────────────────────────────────────

/** Initialize all accessibility features */
export function initAccessibility(): void {
  initReducedMotionStyles();
  // Add skip link if not present
  if (typeof document !== 'undefined' && !document.getElementById('a11y-skip-link')) {
    const skipLink = createSkipLink();
    skipLink.id = 'a11y-skip-link';
    document.body.prepend(skipLink);
  }
}

// Auto-init on import (client-side only)
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccessibility);
  } else {
    initAccessibility();
  }
}