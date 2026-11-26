export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (lastArgs) fn(...lastArgs);
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  debounced.flush = () => {
    if (timeoutId && lastArgs) {
      clearTimeout(timeoutId);
      timeoutId = null;
      fn(...lastArgs);
    }
  };

  return debounced;
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    }
  };

  throttled.cancel = () => {
    inThrottle = false;
    lastArgs = null;
  };

  return throttled;
}

export function rafThrottle<T extends (...args: unknown[]) => unknown>(fn: T): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (lastArgs) fn(...lastArgs);
      });
    }
  };

  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return throttled;
}

export function createDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): T {
  const callbackRef = { current: callback };
  const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };

  callbackRef.current = callback;

  return ((...args: Parameters<T>) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }) as T;
}

export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): T {
  const callbackRef = React.useRef(callback);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...deps]);

  return React.useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  limit: number,
  deps: React.DependencyList = []
): T {
  const callbackRef = React.useRef(callback);
  const inThrottleRef = React.useRef(false);
  const lastArgsRef = React.useRef<Parameters<T> | null>(null);

  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...deps]);

  return React.useCallback(
    ((...args: Parameters<T>) => {
      lastArgsRef.current = args;
      if (!inThrottleRef.current) {
        callbackRef.current(...args);
        inThrottleRef.current = true;
        setTimeout(() => {
          inThrottleRef.current = false;
          if (lastArgsRef.current) {
            callbackRef.current(...lastArgsRef.current);
            lastArgsRef.current = null;
          }
        }, limit);
      }
    }) as T,
    [limit]
  );
}

export function useRafCallback<T extends (...args: unknown[]) => unknown>(callback: T): T {
  const callbackRef = React.useRef(callback);
  const rafIdRef = React.useRef<number | null>(null);
  const lastArgsRef = React.useRef<Parameters<T> | null>(null);

  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const rafCallback = React.useCallback(
    ((...args: Parameters<T>) => {
      lastArgsRef.current = args;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (lastArgsRef.current) callbackRef.current(...lastArgsRef.current);
        });
      }
    }) as T,
    []
  );

  React.useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return rafCallback;
}

export function useEventCallback<T extends (...args: unknown[]) => unknown>(callback: T): T {
  const callbackRef = React.useRef(callback);
  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  return React.useCallback(
    ((...args: Parameters<T>) => callbackRef.current(...args)) as T,
    []
  );
}

export function useStableCallback<T extends (...args: unknown[]) => unknown>(callback: T): T {
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;
  return React.useCallback(
    ((...args: Parameters<T>) => callbackRef.current(...args)) as T,
    []
  );
}

import React from 'react';

export interface TouchGestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onTap?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  onPinchZoom?: (scale: number) => void;
  onPan?: (deltaX: number, deltaY: number) => void;
}

export function useTouchGestures(
  elementRef: React.RefObject<HTMLElement | null>,
  handlers: TouchGestureHandlers,
  options: {
    swipeThreshold?: number;
    tapMaxDelay?: number;
    longPressDelay?: number;
    doubleTapDelay?: number;
  } = {}
) {
  const {
    swipeThreshold = 50,
    tapMaxDelay = 200,
    longPressDelay = 500,
    doubleTapDelay = 300,
  } = options;

  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = React.useRef<{ time: number; x: number; y: number } | null>(null);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressFiredRef = React.useRef(false);
  const isPanningRef = React.useRef(false);
  const pinchStartDistanceRef = React.useRef<number | null>(null);
  const pinchStartScaleRef = React.useRef<number>(1);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isLongPressFiredRef.current = false;
  }, []);

  const handleTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      isLongPressFiredRef.current = false;
      isPanningRef.current = false;

      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        pinchStartDistanceRef.current = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        pinchStartScaleRef.current = 1;
        clearLongPress();
        return;
      }

      longPressTimerRef.current = setTimeout(() => {
        isLongPressFiredRef.current = true;
        handlers.onLongPress?.();
      }, longPressDelay);
    },
    [handlers, longPressDelay, clearLongPress]
  );

  const handleTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;

      if (e.touches.length === 2 && pinchStartDistanceRef.current !== null) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        const scale = distance / pinchStartDistanceRef.current;
        handlers.onPinchZoom?.(scale * pinchStartScaleRef.current);
        return;
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;

        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          clearLongPress();
          if (!isLongPressFiredRef.current) {
            isPanningRef.current = true;
            handlers.onPan?.(dx, dy);
          }
        }
      }
    },
    [handlers, clearLongPress]
  );

  const handleTouchEnd = React.useCallback(
    (e: React.TouchEvent) => {
      clearLongPress();

      if (pinchStartDistanceRef.current !== null) {
        pinchStartDistanceRef.current = null;
        return;
      }

      if (!touchStartRef.current) return;

      const now = Date.now();
      const dt = now - touchStartRef.current.time;

      if (!isPanningRef.current && !isLongPressFiredRef.current && dt < tapMaxDelay) {
        const lastTap = lastTapRef.current;
        if (lastTap && now - lastTap.time < doubleTapDelay) {
          const dx = touchStartRef.current.x - lastTap.x;
          const dy = touchStartRef.current.y - lastTap.y;
          if (Math.hypot(dx, dy) < 20) {
            handlers.onDoubleTap?.();
            lastTapRef.current = null;
            touchStartRef.current = null;
            return;
          }
        }
        lastTapRef.current = { time: now, x: touchStartRef.current.x, y: touchStartRef.current.y };
        handlers.onTap?.();
      }

      if (isPanningRef.current) {
        const dx = (e.changedTouches[0]?.clientX ?? touchStartRef.current.x) - touchStartRef.current.x;
        const dy = (e.changedTouches[0]?.clientY ?? touchStartRef.current.y) - touchStartRef.current.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dx) > swipeThreshold) {
            dx > 0 ? handlers.onSwipeRight?.() : handlers.onSwipeLeft?.();
          }
        } else {
          if (Math.abs(dy) > swipeThreshold) {
            dy > 0 ? handlers.onSwipeDown?.() : handlers.onSwipeUp?.();
          }
        }
      }

      touchStartRef.current = null;
      isPanningRef.current = false;
    },
    [handlers, swipeThreshold, tapMaxDelay, doubleTapDelay, clearLongPress]
  );

  React.useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart as unknown as EventListener, { passive: true });
    el.addEventListener('touchmove', handleTouchMove as unknown as EventListener, { passive: false });
    el.addEventListener('touchend', handleTouchEnd as unknown as EventListener, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd as unknown as EventListener, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart as unknown as EventListener);
      el.removeEventListener('touchmove', handleTouchMove as unknown as EventListener);
      el.removeEventListener('touchend', handleTouchEnd as unknown as EventListener);
      el.removeEventListener('touchcancel', handleTouchEnd as unknown as EventListener);
      clearLongPress();
    };
  }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd, clearLongPress]);

  return { clearLongPress };
}

export function useKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
  options: { target?: HTMLElement | Document; enabled?: boolean } = {}
) {
  const { target = document, enabled = true } = options;

  React.useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();
      const modifier = e.ctrlKey || e.metaKey ? 'ctrl+' : e.shiftKey ? 'shift+' : e.altKey ? 'alt+' : '';
      const combo = `${modifier}${key}`;

      const handler = shortcuts[combo] || shortcuts[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    target.addEventListener('keydown', handleKeyDown);
    return () => target.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, target, enabled]);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}

export function useFocusTrap(enabled: boolean, onEscape?: () => void) {
  const containerRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
      if (e.key === 'Escape' && onEscape) {
        onEscape();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onEscape]);

  return containerRef;
}

export function useClickOutside(onClickOutside: () => void, enabled = true) {
  const ref = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClickOutside, enabled]);

  return ref;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}