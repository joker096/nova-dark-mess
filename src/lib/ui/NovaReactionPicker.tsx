import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';

export interface NovaReactionPickerProps {
  /** Element that opens the picker; it receives the click and aria wiring. */
  trigger: ReactElement;
  /** Accessible name of the popup. */
  label: string;
  /** Emojis shown in the grid, in display order. */
  emojis: string[];
  /** Emojis the current user already reacted with. */
  selectedEmojis?: string[];
  onSelect: (emoji: string) => void;
  /** Shows a free-text emoji input under the grid. */
  allowCustom?: boolean;
  /** Accessible name of the custom emoji input. */
  customLabel?: string;
  /** Accessible name of the button that commits the custom emoji. */
  customSubmitLabel?: string;
  /** Grid columns; arrow-key navigation follows it. */
  columns?: number;
  align?: 'start' | 'end';
}

/**
 * Portaled reaction picker shared by chat messages and channel posts.
 *
 * The popup lives in a portal so scroll containers cannot clip it, focus returns
 * to the trigger on close, Escape closes it, and arrow keys walk the grid.
 */
export function NovaReactionPicker({
  trigger,
  label,
  emojis,
  selectedEmojis = [],
  onSelect,
  allowCustom = false,
  customLabel = 'Add a custom emoji',
  customSubmitLabel = 'Add',
  columns = 4,
  align = 'start',
}: NovaReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerId = useId();
  const customInputId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setPosition(null);
    setCustom('');
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // First pass anchors to the trigger box; a second pass measures the mounted
  // popup so it can flip above a trigger that sits near the bottom edge.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const pickerWidth = pickerRef.current?.offsetWidth ?? 160;
    const pickerHeight = pickerRef.current?.offsetHeight ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const anchorLeft = align === 'end' ? rect.right - pickerWidth : rect.left;
    const left = Math.min(Math.max(anchorLeft, 8), Math.max(8, viewportWidth - pickerWidth - 8));
    const openUpwards = rect.bottom + 6 + pickerHeight > viewportHeight - 8;
    const next = openUpwards
      ? { bottom: viewportHeight - rect.top + 6, left }
      : { top: rect.bottom + 6, left };
    setPosition((current) =>
      current && current.left === next.left && current.top === next.top && current.bottom === next.bottom
        ? current
        : next,
    );
  }, [open, align, position?.left, position?.top, position?.bottom]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (pickerRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close(false);
    };

    const onScroll = () => close(false);

    const frame = requestAnimationFrame(() => {
      pickerRef.current?.querySelector<HTMLElement>('[data-emoji-option]')?.focus();
    });

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open, close]);

  const onPickerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      // Let focus leave the popup, then tear it down without stealing focus back.
      close(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    const options = Array.from(
      pickerRef.current?.querySelectorAll<HTMLElement>('[data-emoji-option]') ?? [],
    );
    if (options.length === 0) return;
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    event.preventDefault();
    const delta =
      event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + delta + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  const commitCustom = () => {
    const emoji = custom.trim();
    if (!emoji) return;
    onSelect(emoji);
    close();
  };

  const triggerNode = cloneElement(trigger as ReactElement<Record<string, unknown>>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const innerRef = (trigger as unknown as { ref?: unknown }).ref;
      if (typeof innerRef === 'function') (innerRef as (node: HTMLElement | null) => void)(node);
    },
    onClick: (event: React.MouseEvent) => {
      event.stopPropagation();
      (trigger.props as { onClick?: (event: React.MouseEvent) => void }).onClick?.(event);
      setOpen((current) => !current);
    },
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? pickerId : undefined,
  });

  return (
    <>
      {triggerNode}
      {open &&
        position &&
        createPortal(
          <div
            ref={pickerRef}
            id={pickerId}
            role="dialog"
            aria-label={label}
            onKeyDown={onPickerKeyDown}
            className="fixed z-[80] rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-2)]"
            style={{
              top: position.top,
              bottom: position.bottom,
              left: position.left,
            }}
          >
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {emojis.map((emoji) => {
                const reacted = selectedEmojis.includes(emoji);
                return (
                  <button
                    key={emoji}
                    type="button"
                    data-emoji-option=""
                    onClick={() => {
                      onSelect(emoji);
                      close();
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)] active:scale-90 ${
                      reacted
                        ? 'bg-[var(--nova-accent-color)]/20 ring-1 ring-[var(--nova-accent-color)]/50'
                        : 'hover:bg-[var(--bg-surface-2)]'
                    }`}
                    aria-label={emoji}
                    aria-pressed={reacted}
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                );
              })}
            </div>
            {allowCustom && (
              <div className="mt-1.5 flex items-center gap-1 border-t border-[var(--border-strong)] pt-1.5">
                <label htmlFor={customInputId} className="sr-only">
                  {customLabel}
                </label>
                <input
                  id={customInputId}
                  type="text"
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitCustom();
                    }
                  }}
                  maxLength={8}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#1e2028] px-2 py-1.5 text-xs text-white placeholder-white/30 focus:border-[var(--nova-accent-color)]/50 focus:outline-none"
                  placeholder="❤️"
                />
                <button
                  type="button"
                  onClick={commitCustom}
                  disabled={!custom.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-sm transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={customSubmitLabel}
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}