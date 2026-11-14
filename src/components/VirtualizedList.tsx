import React, { useRef, useState, useCallback, useMemo } from 'react';

export interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
}

/**
 * Minimal windowed list: renders only the visible slice plus overscan.
 * Intended for long message lists to reduce DOM and reflow cost.
 */
export function VirtualizedList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  overscan = 4,
  className,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const visibleCount = Math.ceil(height / itemHeight);
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length, start + visibleCount + overscan * 2);
    return { startIndex: start, endIndex: end, offsetY: start * itemHeight };
  }, [scrollTop, height, itemHeight, items.length, overscan]);

  const totalHeight = items.length * itemHeight;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, overflow: 'auto' }}
      onScroll={onScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {items.slice(startIndex, endIndex).map((item, i) =>
            renderItem(item, startIndex + i),
          )}
        </div>
      </div>
    </div>
  );
}
