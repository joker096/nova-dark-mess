import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAB_SIDE_EVENT,
  FAB_SIDE_KEY,
  isFabSide,
  readFabSide,
  saveFabSide,
} from './appearance';

describe('one-handed FAB side preference', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to the right edge', () => {
    expect(readFabSide()).toBe('right');
    localStorage.setItem(FAB_SIDE_KEY, 'sideways');
    expect(readFabSide()).toBe('right');
  });

  it('persists and reads back a left-handed preference', () => {
    saveFabSide('left');
    expect(localStorage.getItem(FAB_SIDE_KEY)).toBe('left');
    expect(readFabSide()).toBe('left');
  });

  it('announces the change to the same tab (storage events do not fire there)', () => {
    const listener = vi.fn();
    window.addEventListener(FAB_SIDE_EVENT, listener);
    saveFabSide('left');
    window.removeEventListener(FAB_SIDE_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe('left');
  });

  it('only accepts the two known sides', () => {
    expect(isFabSide('left')).toBe(true);
    expect(isFabSide('right')).toBe(true);
    expect(isFabSide('centre')).toBe(false);
    expect(isFabSide(undefined)).toBe(false);
  });
});
