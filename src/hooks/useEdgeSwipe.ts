import { useCallback, useRef, useState } from 'react';

interface UseEdgeSwipeProps {
  onBack: () => void;
  enabled?: boolean;
  edgeThreshold?: number;
  swipeThreshold?: number;
  maxOffset?: number;
}

interface UseEdgeSwipeReturn {
  edgeSwipeOffset: number;
  isEdgeSwiping: boolean;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;
}

export function useEdgeSwipe({
  onBack,
  enabled = true,
  edgeThreshold = 44,
  swipeThreshold = 75,
  maxOffset = 160,
}: UseEdgeSwipeProps): UseEdgeSwipeReturn {
  const [edgeSwipeOffset, setEdgeSwipeOffset] = useState(0);
  const [isEdgeSwiping, setIsEdgeSwiping] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isEligibleEdgeSwipeRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartXRef.current = touch.clientX;
      touchStartYRef.current = touch.clientY;
      if (touch.clientX <= edgeThreshold) {
        isEligibleEdgeSwipeRef.current = true;
      } else {
        isEligibleEdgeSwipeRef.current = false;
      }
    },
    [enabled, edgeThreshold],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !isEligibleEdgeSwipeRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartXRef.current;
      const dy = Math.abs(touch.clientY - touchStartYRef.current);

      if (dy > dx && dx < 24) {
        isEligibleEdgeSwipeRef.current = false;
        setIsEdgeSwiping(false);
        setEdgeSwipeOffset(0);
        return;
      }

      if (dx > 0) {
        setIsEdgeSwiping(true);
        setEdgeSwipeOffset(Math.min(dx, maxOffset));
      }
    },
    [enabled, maxOffset],
  );

  const handleTouchEnd = useCallback(() => {
    if (isEligibleEdgeSwipeRef.current && edgeSwipeOffset > swipeThreshold) {
      onBack();
    }
    isEligibleEdgeSwipeRef.current = false;
    setIsEdgeSwiping(false);
    setEdgeSwipeOffset(0);
  }, [onBack, edgeSwipeOffset, swipeThreshold]);

  return {
    edgeSwipeOffset,
    isEdgeSwiping,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}