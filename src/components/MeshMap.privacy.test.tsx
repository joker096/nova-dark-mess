import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { MeshMap } from './MeshMap';
import { clearLastGpsFix, loadLastGpsFix } from '../lib/p2p/meshMapNodes';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-leaflet', async () => {
  const ReactModule = await import('react');
  return {
    MapContainer: ({ children }: { children: ReactNode }) =>
      ReactModule.createElement('div', { 'data-testid': 'map' }, children),
    Marker: ({ children }: { children: ReactNode }) =>
      ReactModule.createElement('div', null, children),
    Popup: ({ children }: { children: ReactNode }) =>
      ReactModule.createElement('div', null, children),
    Polyline: () => null,
    TileLayer: () => ReactModule.createElement('div', { 'data-testid': 'external-tiles' }),
    useMap: () => ({ fitBounds: vi.fn() }),
  };
});

describe('MeshMap location privacy', () => {
  const originalGeolocation = navigator.geolocation;
  const originalOnLine = navigator.onLine;
  const getCurrentPosition = vi.fn();

  beforeEach(() => {
    clearLastGpsFix();
    getCurrentPosition.mockReset();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    clearLastGpsFix();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine });
  });

  it('does not request GPS on mount and pauses external tiles while showing a precise fix', () => {
    render(<MeshMap nodes={[]} links={[]} />);

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByTestId('external-tiles')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'meshMap.locateMe' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    const [onSuccess] = getCurrentPosition.mock.calls[0] as [
      (position: GeolocationPosition) => void,
    ];
    act(() => {
      onSuccess({
        coords: { latitude: 50.45, longitude: 30.52 },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });

    expect(loadLastGpsFix()?.latitude).toBe(50.45);
    expect(screen.queryByTestId('external-tiles')).toBeNull();
    expect(screen.getByText('meshMap.localOnly')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'meshMap.hideLocation' }));
    expect(loadLastGpsFix()).toBeNull();
    expect(screen.getByTestId('external-tiles')).toBeTruthy();
  });
});
