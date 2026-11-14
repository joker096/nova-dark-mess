import { useEffect, useRef } from 'react';
import { usePlatform } from './usePlatform';

export type ShortcutHandler = (event: KeyboardEvent) => void;
export type ShortcutMap = Record<string, ShortcutHandler>;

interface ParsedShortcut {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  enter: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
};

function parseShortcut(combo: string): ParsedShortcut {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed: ParsedShortcut = {
    key: '',
    mod: false,
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
  };

  for (const part of parts) {
    if (part === 'mod' || part === 'cmdorctrl' || part === 'commandorcontrol') parsed.mod = true;
    else if (part === 'ctrl' || part === 'control') parsed.ctrl = true;
    else if (part === 'meta' || part === 'cmd' || part === 'command') parsed.meta = true;
    else if (part === 'shift') parsed.shift = true;
    else if (part === 'alt' || part === 'option') parsed.alt = true;
    else parsed.key = KEY_ALIASES[part] ?? part;
  }

  return parsed;
}

function matches(shortcut: ParsedShortcut, event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== shortcut.key) return false;
  const wantMeta = shortcut.mod ? event.metaKey : shortcut.meta;
  const wantCtrl = shortcut.mod ? event.ctrlKey : shortcut.ctrl;
  // `mod` means "the platform command key", so resolve it against the event.
  if (shortcut.mod) {
    if (!event.metaKey && !event.ctrlKey) return false;
  } else {
    if (wantMeta !== event.metaKey) return false;
    if (wantCtrl !== event.ctrlKey) return false;
  }
  if (shortcut.shift !== event.shiftKey) return false;
  if (shortcut.alt !== event.altKey) return false;
  return true;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export interface UseShortcutsOptions {
  /** Fire even while a text field has focus (default: false). */
  allowInInputs?: boolean;
  /** Disable the whole map, e.g. while a modal owns the keyboard. */
  enabled?: boolean;
}

/** Registers global keyboard shortcuts such as `mod+k` or `shift+escape`. */
export function useShortcuts(map: ShortcutMap, options: UseShortcutsOptions = {}): void {
  const { allowInInputs = false, enabled = true } = options;
  const handlers = useRef(map);
  handlers.current = map;

  useEffect(() => {
    if (!enabled) return;
    const parsed = Object.entries(handlers.current).map(([combo, handler]) => ({
      shortcut: parseShortcut(combo),
      handler,
      combo,
    }));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!allowInInputs && isEditableTarget(event.target)) return;
      for (const entry of parsed) {
        if (!entry.shortcut.key) continue;
        if (!matches(entry.shortcut, event)) continue;
        // Handlers live in a ref so re-registering is unnecessary.
        const current = handlers.current[entry.combo];
        if (!current) continue;
        current(event);
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [allowInInputs, enabled]);
}

/** Renders a shortcut the way the current platform expects: `⌘K` vs `Ctrl K`. */
export function formatShortcut(combo: string, isApple: boolean): string {
  const parsed = parseShortcut(combo);
  const key = parsed.key === ' ' ? 'Space' : parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1);
  const parts: string[] = [];
  if (parsed.mod || parsed.ctrl || parsed.meta) parts.push(isApple ? '⌘' : 'Ctrl');
  if (parsed.alt) parts.push(isApple ? '⌥' : 'Alt');
  if (parsed.shift) parts.push(isApple ? '⇧' : 'Shift');
  parts.push(key);
  return isApple ? parts.join('') : parts.join('+');
}

/** Convenience wrapper that reads the platform for `formatShortcut`. */
export function useShortcutLabel(combo: string): string {
  const { isApple } = usePlatform();
  return formatShortcut(combo, isApple);
}
