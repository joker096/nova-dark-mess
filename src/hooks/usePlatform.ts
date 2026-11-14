import { useEffect, useState } from 'react';

export type Platform = 'mac' | 'windows' | 'linux' | 'ios' | 'android';

/**
 * Best-effort platform detection for shortcut labels and touch affordances.
 *
 * The app ships as a web build, a desktop bundle and a mobile bundle, so the
 * user agent is the only signal available in all three.
 */
export function detectPlatform(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): Platform {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/mac os x|macintosh/.test(ua)) return 'mac';
  if (/windows/.test(ua)) return 'windows';
  return 'linux';
}

export interface PlatformInfo {
  platform: Platform;
  /** True on macOS and iOS, where the command key replaces Ctrl. */
  isApple: boolean;
  /** Symbol shown in shortcut hints (`⌘` or `Ctrl`). */
  modifierLabel: string;
}

export function platformInfo(platform: Platform): PlatformInfo {
  const isApple = platform === 'mac' || platform === 'ios';
  return {
    platform,
    isApple,
    modifierLabel: isApple ? '⌘' : 'Ctrl',
  };
}

export function usePlatform(): PlatformInfo {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return platformInfo(platform);
}
