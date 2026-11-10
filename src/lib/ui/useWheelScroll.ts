import { useEffect, useRef } from 'react';

/**
 * Returns a ref to attach to a horizontal overflow container.
 * Vertical wheel/trackpad gestures over the container scroll it horizontally
 * when the content overflows, and keeps the native thin scrollbar visible.
 */
export function useWheelScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const handler = useRef<((e: WheelEvent) => void) | null>(null);

  handler.current = (e: WheelEvent) => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    if (e.deltaY === 0 && e.deltaX === 0) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY * 1.15 + e.deltaX;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const listener = handler.current as EventListener;
    el.addEventListener('wheel', listener, false);
    return () => el.removeEventListener('wheel', listener, false);
  }, []);

  return ref;
}
