import { forwardRef, useEffect, useRef } from 'react';

interface ScrollableRowProps {
  children?: React.ReactNode;
  className?: string;
  gap?: string;
  wheelScroll?: boolean;
}

export const ScrollableRow = forwardRef<HTMLDivElement, ScrollableRowProps>(
  ({ children, className, gap = '2', wheelScroll = false, ...rest }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!wheelScroll) return;
      const el = containerRef.current;
      if (!el) return undefined;
      const handler = (e: WheelEvent) => {
        if (el.scrollWidth <= el.clientWidth) return;
        if (e.deltaY === 0 && e.deltaX === 0) return;
        e.preventDefault();
        el.scrollLeft += e.deltaY * 1.15 + e.deltaX;
      };
      el.addEventListener('wheel', handler, { passive: false });
      return () => el.removeEventListener('wheel', handler);
    }, [wheelScroll]);

    const mergedRef: React.Ref<HTMLDivElement> = (node) => {
      containerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    return (
      <div
        ref={mergedRef}
        className={`flex items-center overflow-x-auto no-scrollbar gap-[${gap}] ${className ?? ''}`.trim()}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

ScrollableRow.displayName = 'ScrollableRow';
