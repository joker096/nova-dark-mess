/**
 * Platform detection utilities
 */

/**
 * Check if running in Tauri (native app)
 */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

/**
 * Check if running on mobile (iOS/Android)
 */
export function isMobile(): boolean {
  if (isTauri()) {
    // In Tauri, check for mobile via user agent or Tauri API
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Check if running on iOS
 */
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Check if running on Android
 */
export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/**
 * Check if running in a browser (not Tauri)
 */
export function isBrowser(): boolean {
  return !isTauri();
}

/**
 * Get platform name
 */
export function getPlatform(): 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'web' {
  if (isTauri()) {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    if (navigator.userAgent.includes('Windows')) return 'windows';
    if (navigator.userAgent.includes('Mac')) return 'macos';
    if (navigator.userAgent.includes('Linux')) return 'linux';
  }
  return 'web';
}

/**
 * Check if background fetch is supported
 */
export function isBackgroundFetchSupported(): boolean {
  if (isTauri()) return true; // Native background fetch
  return 'BackgroundFetchManager' in window;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  if (isTauri()) return true;
  return 'serviceWorker' in navigator && 'PushManager' in window;
}