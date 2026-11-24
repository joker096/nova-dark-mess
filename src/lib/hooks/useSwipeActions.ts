import { useState, useCallback, useRef, useEffect } from 'react';

interface SwipeActionConfig<T> {
  /** Unique identifier for the item */
  itemId: T;
  /** Called when swipe starts */
  onSwipeStart?: (itemId: T) => void;
  /** Called when swipe ends */
  onSwipeEnd?: (itemId: T) => void;
  /** Called when swipe is reset */
  onSwipeReset?: (itemId: T) => void;
  /** Maximum swipe offset in pixels */
  maxOffset?: number;
  /** Threshold to trigger action (pixels) */
  actionThreshold?: number;
}

interface SwipeActionState<T> {
  /** Currently swiping item ID */
  swipingId: T | null;
  /** Current swipe offset */
  offset: number;
  /** Whether a long press is active */
  isLongPressing: boolean;
}

interface SwipeActionHandlers {
  /** Handle touch start */
  onTouchStart: (e: React.TouchEvent, itemId: T) => void;
  /** Handle touch move */
  onTouchMove: (e: React.TouchEvent) => void;
  /** Handle touch end */
  onTouchEnd: (e: React.TouchEvent, itemId: T) => void;
  /** Handle touch cancel */
  onTouchCancel: () => void;
  /** Reset swipe state */
  resetSwipe: () => void;
  /** Start long press detection */
  startLongPress: (e: React.TouchEvent, itemId: T) => void;
  /** Cancel long press detection */
  cancelLongPress: () => void;
}

export function useSwipeActions<T = string>({
  onSwipeStart,
  onSwipeEnd,
  onSwipeReset,
  maxOffset = 320,
  actionThreshold = 80,
}: SwipeActionConfig<T>): [SwipeActionState<T>, SwipeActionHandlers] {
  const [state, setState] = useState<SwipeActionState<T>>({
    swipingId: null,
    offset: 0,
    isLongPressing: false,
  });

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startXRef = useRef<number>(0);
  const isSwipingRef = useRef(false);

  const resetSwipe = useCallback(() => {
    if (state.swipingId !== null) {
      onSwipeReset?.(state.swipingId);
    }
    setState({
      swipingId: null,
      offset: 0,
      isLongPressing: false,
    });
    isSwipingRef.current = false;
  }, [state.swipingId, onSwipeReset]);

  const startLongPress = useCallback((e: React.TouchEvent, itemId: T) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, isLongPressing: true }));
    }, 500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setState(prev => ({ ...prev, isLongPressing: false }));
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, itemId: T) => {
    startXRef.current = e.touches[0].clientX;
    setState(prev => ({ ...prev, swipingId: itemId, offset: 0 }));
    isSwipingRef.current = false;
    startLongPress(e, itemId);
    onSwipeStart?.(itemId);
  }, [onSwipeStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (state.swipingId === null) return;

    const currentX = e.touches[0].clientX;
    const deltaX = startXRef.current - currentX; // Positive = swipe left

    // Only allow left swipe (reveal actions from right)
    if (deltaX > 0) {
      if (!isSwipingRef.current && deltaX > 10) {
        isSwipingRef.current = true;
        cancelLongPress();
      }
      if (isSwipingRef.current) {
        const newOffset = Math.min(deltaX, maxOffset);
        setState(prev => ({ ...prev, offset: newOffset }));
      }
    } else if (isSwipingRef.current) {
      // Swiped back past start, reset
      resetSwipe();
    }
  }, [state.swipingId, maxOffset]);

  const handleTouchEnd = useCallback((e: React.TouchEvent, itemId: T) => {
    if (state.swipingId !== itemId) return;

    cancelLongPress();

    if (isSwipingRef.current) {
      // Check if swipe passed threshold to keep actions open
      if (state.offset >= actionThreshold) {
        // Keep actions open - offset stays at current position
        onSwipeEnd?.(itemId);
      } else {
        // Snap back
        resetSwipe();
      }
    } else if (state.isLongPressing) {
      // Long press activated but no swipe - could trigger context menu
      setState(prev => ({ ...prev, isLongPressing: false }));
    } else {
      // Tap - reset
      resetSwipe();
    }
    isSwipingRef.current = false;
  }, [state.swipingId, state.offset, actionThreshold, onSwipeEnd, resetSwipe]);

  const handleTouchCancel = useCallback(() => {
    cancelLongPress();
    resetSwipe();
  }, [cancelLongPress, resetSwipe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return [
    state,
    {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
      resetSwipe,
      startLongPress,
      cancelLongPress,
    },
  ];
}

export default useSwipeActions;