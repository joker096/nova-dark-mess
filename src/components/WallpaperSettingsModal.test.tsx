/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallpaperSettingsModal } from './WallpaperSettingsModal';
import { WALLPAPER_OPTIONS } from '../data/wallpapers';

const premiumState = { allowed: false };
const checkout = vi.fn();

vi.mock('../hooks/usePremium', () => ({
  usePremium: () => ({
    premium: premiumState.allowed,
    loading: false,
    checkout,
    canUse: (feature: string) => premiumState.allowed && feature === 'wallpaper',
    freeDaysRemaining: 0,
    minSubscriptionCost: 49,
  }),
}));

const premiumWallpaper = WALLPAPER_OPTIONS.find((option) => option.premium)!;
const freeWallpaper = WALLPAPER_OPTIONS.find((option) => !option.premium)!;

const renderModal = (onSelect = vi.fn()) => {
  render(
    <WallpaperSettingsModal
      isOpen
      currentWallpaper="neon-nebula"
      onSelect={onSelect}
      onCycle={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return onSelect;
};

beforeEach(() => {
  premiumState.allowed = false;
  checkout.mockClear();
});

describe('WallpaperSettingsModal premium gating', () => {
  it('marks premium wallpapers as locked and opens checkout instead of applying', () => {
    const onSelect = renderModal();

    const locked = screen.getByTestId(`wallpaper-${premiumWallpaper.id}`);
    expect(locked.getAttribute('data-premium-locked')).toBe('true');

    fireEvent.click(locked);
    expect(checkout).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies free wallpapers without checkout', () => {
    const onSelect = renderModal();

    fireEvent.click(screen.getByTestId(`wallpaper-${freeWallpaper.id}`));

    expect(onSelect).toHaveBeenCalledWith(freeWallpaper.id);
    expect(checkout).not.toHaveBeenCalled();
  });

  it('lets premium users pick premium wallpapers', () => {
    premiumState.allowed = true;
    const onSelect = renderModal();

    const unlocked = screen.getByTestId(`wallpaper-${premiumWallpaper.id}`);
    expect(unlocked.getAttribute('data-premium-locked')).toBeNull();

    fireEvent.click(unlocked);
    expect(onSelect).toHaveBeenCalledWith(premiumWallpaper.id);
    expect(checkout).not.toHaveBeenCalled();
  });
});
