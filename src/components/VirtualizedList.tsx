import React, { useRef, useState, useCallback, useLayoutEffect, useMemo } from 'react';

export interface VirtualizedListProps<T> {
  items: T[];
  /**
   * Estimated height of a single row in px. Rendered rows are measured and
   * their real heights are used; unrendered rows fall back to this estimate.
   * For variable-height content (e.g. message bubbles) pass a reasonable
   * average — the list self-corrects as rows scroll into view.
   */
  itemHeight: number;
  /** Pixel height of the visible viewport (the scroller). */
  height: number;
  /** Key for each item; used to identify rows across renders. */
  getItemKey?: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  /**
   * Forward a ref to the scroll container so the parent can read
   * `scrollHeight`/`scrollTop` or imperatively scroll (e.g. "jump to
   * bottom").
   */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Extra scroll handler (in addition to the internal windowing one). */
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Windowed list: renders only the visible slice plus overscan to keep the DOM
 * and reflow cost low for long lists.
 *
 * Rendered rows are measured after paint and their measured heights are used
 * for layout, so the component works for both fixed-height rows and
 * variable-height rows (message bubbles, etc.). Unrendered rows are estimated
 * from `itemHeight`.
 */
export function VirtualizedList<T>({
  items,
  itemHeight,
  height,
  getItemKey,
  renderItem,
  overscan = 6,
  className,
  containerRef,
  onScroll,
  onClick,
}: VirtualizedListProps<T>) {
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [recompute, setRecompute] = useState(0);
  const [viewport, setViewport] = useState(height);

  // Measured row heights (by index). Rows render in a top-down slice so an
  // index is stable and measuring them doesn't shift the viewport.
  const heightsRef = useRef<Map<number, number>>(new Map());
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollTicking = useRef(false);
  const onScrollRef = useRef(onScroll);

  // Keep the latest onScroll handler without recreating handleScroll (and thus
  // re-attaching the DOM listener) on every render when the parent passes an
  // inline arrow function.
  useLayoutEffect(() => {
    onScrollRef.current = onScroll;
  });

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      onScrollRef.current?.(e);
      const value = e.currentTarget.scrollTop;
      if (scrollTicking.current) return;
      scrollTicking.current = true;
      requestAnimationFrame(() => {
        scrollTicking.current = false;
        setScrollTop((prev) => (prev === value ? prev : value));
      });
    },
    [],
  );

  // Track the visible viewport height from the DOM so the window follows
  // resizes (the list can flex-fill its parent).
  useLayoutEffect(() => {
    const node = innerContainerRef.current;
    if (!node) return;
    setViewport(node.clientHeight || height);
    const ro = new ResizeObserver(() => {
      const next = node.clientHeight || height;
      setViewport((prev) => (prev === next ? prev : next));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [height]);

  // Measure rendered rows after they mount and paint. A 0 height (e.g. under
  // jsdom, which has no layout) is treated as "not yet measured" so the row
  // falls back to the `itemHeight` estimate instead of collapsing the window.
  useLayoutEffect(() => {
    rowRefs.current.forEach((node, index) => {
      const measured = node.offsetHeight;
      if (measured <= 0) return;
      const cached = heightsRef.current.get(index);
      if (measured !== cached) {
        heightsRef.current.set(index, measured);
        setRecompute((k) => k + 1);
      }
    });
  }, [items, recompute]);

  const getItemSize = useCallback(
    (index: number) => heightsRef.current.get(index) ?? itemHeight,
    [itemHeight],
  );

  const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
    // `recompute` is read so the window follows new measurements / resizes.
    void recompute;
    if (items.length === 0) {
      return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
    }

    // Viewport not measurable yet (hidden container, jsdom, first paint):
    // render everything rather than an empty window.
    if (viewport <= 0) {
      let total = 0;
      for (let i = 0; i < items.length; i++) total += getItemSize(i);
      return { startIndex: 0, endIndex: items.length, offsetY: 0, totalHeight: total };
    }

    // Walk forward from the top, skipping rows until we reach the scroll
    // position (the start of the visible window).
    let start = 0;
    let offset = 0;
    while (start < items.length && offset + getItemSize(start) <= scrollTop) {
      offset += getItemSize(start);
      start += 1;
    }

    // Grow the window to cover the visible viewport (plus a safety margin).
    let end = start;
    let visible = 0;
    while (end < items.length && visible < viewport + itemHeight) {
      visible += getItemSize(end);
      end += 1;
    }
    end = Math.min(items.length, end + overscan);

    let total = offset;
    for (let i = start; i < items.length; i++) total += getItemSize(i);

    return { startIndex: start, endIndex: end, offsetY: offset, totalHeight: total };
  }, [
    items,
    scrollTop,
    viewport,
    itemHeight,
    overscan,
    getItemSize,
    recompute,
  ]);

  // Render the visible slice once per window change. Scrolling re-renders this
  // component every animation frame, but as long as the window bounds and the
  // incoming props are unchanged the row trees are reused, so the (potentially
  // expensive) row bodies never re-run during a scroll.
  const rows = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, i) => {
      const index = startIndex + i;
      return (
        <div
          key={getItemKey ? getItemKey(item, index) : String(index)}
          ref={(node) => {
            if (node) rowRefs.current.set(index, node);
            else rowRefs.current.delete(index);
          }}
          className="pb-3"
        >
          {renderItem(item, index)}
        </div>
      );
    });
  }, [items, startIndex, endIndex, renderItem, getItemKey]);

  return (
    <div
      ref={(node) => {
        innerContainerRef.current = node;
        if (containerRef) containerRef.current = node;
      }}
      className={className}
      style={{ overflow: 'auto' }}
      onScroll={handleScroll}
      onClick={onClick}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>{rows}</div>
      </div>
    </div>
  );
}
