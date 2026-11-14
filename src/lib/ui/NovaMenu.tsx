import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShortcutLabel } from '../../hooks/useShortcuts';

export interface NovaMenuItemDef {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Renders the row in red, for destructive actions. */
  danger?: boolean;
  disabled?: boolean;
  /** Shortcut combo shown on the right (`mod+c`). */
  shortcut?: string;
  /** Draws a separator above this row. */
  separatorBefore?: boolean;
}

export interface NovaMenuProps {
  /** Element that opens the menu; it receives the click and aria wiring. */
  trigger: ReactElement;
  items: NovaMenuItemDef[];
  align?: 'start' | 'end';
  /** Accessible name of the popup. */
  label: string;
}

/**
 * Portaled dropdown shared by message actions, chat headers and channel posts.
 *
 * Portal keeps the popup out of scroll containers, focus returns to the
 * trigger on close, and arrow keys move between rows.
 */
export function NovaMenu({ trigger, items, align = 'end', label }: NovaMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // First pass uses the trigger box only; once the popup is mounted a second
  // pass measures it so it can flip above a trigger near the bottom edge.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 200;
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const anchorLeft = align === 'end' ? rect.right - menuWidth : rect.left;
    const left = Math.min(Math.max(anchorLeft, 8), Math.max(8, viewportWidth - menuWidth - 8));
    const openUpwards = rect.bottom + 6 + menuHeight > viewportHeight - 8;
    const next = openUpwards
      ? { bottom: viewportHeight - rect.top + 6, left }
      : { top: rect.bottom + 6, left };
    setPosition((current) =>
      current &&
      current.left === next.left &&
      current.top === next.top &&
      current.bottom === next.bottom
        ? current
        : next,
    );
  }, [open, align, position?.left, position?.top, position?.bottom]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close(false);
    };

    const focusFirst = () => {
      const rows = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])');
      rows?.[0]?.focus();
    };
    const frame = requestAnimationFrame(focusFirst);

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, close]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = rows[(index + delta + rows.length) % rows.length];
      next?.focus();
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      rows[event.key === 'Home' ? 0 : rows.length - 1]?.focus();
      return;
    }
    if (event.key === 'Tab') {
      close(false);
    }
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
      // A menu without rows keeps the trigger a plain button.
      if (items.length === 0) return;
      setOpen((current) => !current);
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
  });

  return (
    <>
      {triggerNode}
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className="fixed z-[80] min-w-[180px] max-w-[260px] rounded-xl border border-white/10 bg-[#141520] p-1 shadow-2xl shadow-black/80"
            style={{
              top: position.top,
              bottom: position.bottom,
              // `left` is already anchored (rect.right - menuWidth for 'end'),
              // so no translateX here — that would shift the menu a second
              // full menu-width away from the trigger.
              left: position.left,
            }}
          >
            {items.map((item) => (
              <NovaMenuRow key={item.key} item={item} onClose={close} />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function NovaMenuRow({ item, onClose }: { item: NovaMenuItemDef; onClose: (returnFocus?: boolean) => void }) {
  const shortcutLabel = useShortcutLabel(item.shortcut ?? '');
  return (
    <>
      {item.separatorBefore && <div className="my-1 h-px bg-white/10" role="separator" />}
      <button
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (item.disabled) return;
          onClose(false);
          item.onSelect();
        }}
        className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)] disabled:opacity-40 disabled:cursor-not-allowed ${
          item.danger ? 'text-red-400 hover:bg-red-500/15' : 'text-white/85 hover:bg-white/[0.08] hover:text-white'
        }`}
      >
        {item.icon && <span className="w-4 h-4 shrink-0 [&>svg]:w-4 [&>svg]:h-4">{item.icon}</span>}
        <span className="flex-1 truncate">{item.label}</span>
        {shortcutLabel && <span className="text-[10px] text-white/40">{shortcutLabel}</span>}
      </button>
    </>
  );
}
