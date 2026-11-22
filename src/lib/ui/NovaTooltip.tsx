import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { usePlatform } from '../../hooks/usePlatform';
import { formatShortcut } from '../../hooks/useShortcuts';

export interface NovaTooltipProps {
  /** Text announced and shown on hover/focus. */
  label: string;
  /** Shortcut combo (`mod+k`) rendered next to the label. */
  shortcut?: string;
  /** Delay before the tooltip appears on pointer hover (default 400 ms). */
  delay?: number;
  children: ReactElement;
}

/**
 * Hover/focus hint for icon-only controls.
 *
 * Pointer hover waits `delay` so sweeping the mouse across a toolbar does not
 * flash labels; keyboard focus shows it immediately, which is when a sighted
 * keyboard user actually needs it.
 */
export function NovaTooltip({ label, shortcut, delay = 400, children }: NovaTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const { isApple } = usePlatform();

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const showAfterDelay = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => setVisible(true), delay);
  }, [clearTimer, delay]);

  useEffect(() => clearTimer, [clearTimer]);

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return;
        showAfterDelay();
      }}
      onPointerLeave={() => {
        clearTimer();
        setVisible(false);
      }}
      onFocusCapture={() => {
        clearTimer();
        setVisible(true);
      }}
      onBlurCapture={() => {
        clearTimer();
        setVisible(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setVisible(false);
      }}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-[60] mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] shadow-[var(--shadow-2)] border border-[var(--border-strong)] animate-in fade-in duration-100"
        >
          {label}
          {shortcut && (
            <span className="ml-1.5 text-[var(--text-secondary)]">{formatShortcut(shortcut, isApple)}</span>
          )}
        </span>
      )}
    </span>
  );
}
