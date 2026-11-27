/**
 * Background Fetch Service
 *
 * Handles background data synchronization for:
 * - New messages (when app is backgrounded)
 * - Contact updates
 * - Channel posts
 * - Mesh network presence
 *
 * Uses:
 * - Tauri background-fetch plugin on native
 * - Web Background Fetch API on browsers (limited support)
 * - Periodic sync as fallback
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../utils/platform';

// Type extensions for experimental web APIs
interface BackgroundFetchManager {
  fetch(id: string, requests: Request[], options: BackgroundFetchOptions): Promise<BackgroundFetchRegistration>;
}

interface BackgroundFetchRegistration {
  id: string;
  uploadTotal: number;
  uploaded: number;
  downloadTotal: number;
  downloaded: number;
  result: string;
  failureReason: string;
  recordsAvailable: boolean;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface BackgroundFetchOptions {
  title?: string;
  icons?: Array<{ src: string; sizes: string; type: string }>;
  downloadTotal?: number;
  headers?: Record<string, string>;
}

interface ServiceWorkerRegistrationWithBackgroundFetch extends ServiceWorkerRegistration {
  backgroundFetch?: BackgroundFetchManager;
  periodicSync?: PeriodicSyncManager;
}

interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>;
  getTags(): Promise<string[]>;
  unregister(tag: string): Promise<void>;
}

type SyncCallback = () => Promise<void>;
let syncCallbacks: SyncCallback[] = [];
let backgroundFetchRegistered = false;

/**
 * Register background fetch
 */
export async function registerBackgroundFetch(): Promise<boolean> {
  if (backgroundFetchRegistered) return true;

  if (isTauri()) {
    return registerNativeBackgroundFetch();
  } else {
    return registerWebBackgroundFetch();
  }
}

/**
 * Native background fetch (Tauri plugin)
 */
async function registerNativeBackgroundFetch(): Promise<boolean> {
  try {
    // The Tauri plugin handles the native registration
    // We just need to set up the callback handler
    const { listen } = await import('@tauri-apps/api/event');

    // Listen for background fetch trigger
    await listen('background-fetch', async () => {
      console.log('[BackgroundFetch] Triggered');
      await runSyncCallbacks();
    });

    backgroundFetchRegistered = true;
    return true;
  } catch (error) {
    console.error('[BackgroundFetch] Native registration failed:', error);
    return false;
  }
}

/**
 * Web Background Fetch API (limited browser support)
 */
async function registerWebBackgroundFetch(): Promise<boolean> {
  if (!('BackgroundFetchManager' in window)) {
    console.warn('[BackgroundFetch] Web Background Fetch not supported');
    // Fallback to periodic sync
    return registerPeriodicSync();
  }

  try {
    const ready = await navigator.serviceWorker.ready;
    // Background Fetch is not in the TS DOM lib yet; the feature check above
    // guarantees the property exists by the time we get here.
    const registration = ready as ServiceWorkerRegistrationWithBackgroundFetch;
    const bgFetch = registration.backgroundFetch;

    if (!bgFetch) {
      console.warn('[BackgroundFetch] backgroundFetch not available on registration');
      return registerPeriodicSync();
    }

    // Background Fetch rejects an empty request list. A tiny same-origin
    // request is enough to wake the worker; the sync itself does not depend on
    // the response body.
    const faviconUrl = new URL('/favicon.ico', window.location.href);
    const request = new Request(faviconUrl.toString(), { 
      cache: 'no-store',
      credentials: 'same-origin',
      mode: 'same-origin'
    });
    
    await bgFetch.fetch(
      'nova-sync',
      [request],
      {
        title: 'Nova Messenger Sync',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
        downloadTotal: 0,
      },
    );

    // Listen for background fetch events
    // `self` may not exist outside a (dedicated) worker context.
    if (typeof self !== 'undefined' && 'addEventListener' in self) {
      self.addEventListener('backgroundfetchsuccess', async () => {
        await runSyncCallbacks();
      });
    }

    backgroundFetchRegistered = true;
    return true;
  } catch (error) {
    console.error('[BackgroundFetch] Web registration failed:', error);
    return registerPeriodicSync();
  }
}

/**
 * Periodic Background Sync (fallback)
 */
async function registerPeriodicSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[BackgroundFetch] Periodic sync not supported');
    return false;
  }

  try {
    const ready = await navigator.serviceWorker.ready;
    const registration = ready as ServiceWorkerRegistrationWithBackgroundFetch;
    const periodicSync = registration.periodicSync;

    if (!periodicSync) {
      console.warn('[BackgroundFetch] periodicSync not available on registration');
      return false;
    }

    // Check if periodic sync is allowed before registering
    const permission = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (permission.state === 'denied') {
      console.warn('[BackgroundFetch] Periodic sync permission denied');
      return false;
    }

    await periodicSync.register('nova-sync', {
      minInterval: 24 * 60 * 60 * 1000, // 24 hours
    });

    backgroundFetchRegistered = true;
    return true;
  } catch (error) {
    // NotAllowedError is expected if permission hasn't been granted yet
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      console.warn('[BackgroundFetch] Periodic sync permission not granted (expected until user grants permission)');
    } else {
      console.error('[BackgroundFetch] Periodic sync registration failed:', error);
    }
    return false;
  }
}

/**
 * Register a sync callback
 */
export function onBackgroundSync(callback: SyncCallback): () => void {
  syncCallbacks.push(callback);
  return () => {
    syncCallbacks = syncCallbacks.filter((cb) => cb !== callback);
  };
}

/**
 * Run all sync callbacks
 */
async function runSyncCallbacks(): Promise<void> {
  console.log('[BackgroundFetch] Running sync callbacks...');
  const results = await Promise.allSettled(
    syncCallbacks.map((cb) => cb())
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[BackgroundFetch] Sync callback ${index} failed:`, result.reason);
    }
  });
}

/**
 * Trigger immediate background sync (for testing or manual refresh)
 */
export async function triggerBackgroundSync(): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('plugin:background-fetch|trigger');
    } catch (error) {
      console.error('[BackgroundFetch] Native trigger failed:', error);
      // Fallback to running callbacks directly
      await runSyncCallbacks();
    }
  } else {
    await runSyncCallbacks();
  }
}

/**
 * Check if background fetch is active
 */
export function isBackgroundFetchActive(): boolean {
  return backgroundFetchRegistered;
}

/**
 * Configure background fetch options
 */
export async function configureBackgroundFetch(options: {
  minimumInterval?: number; // milliseconds
  enableOnMobile?: boolean;
  enableOnDesktop?: boolean;
}): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('plugin:background-fetch|configure', {
        minimumInterval: options.minimumInterval || 15 * 60 * 1000, // 15 minutes default
      });
    } catch (error) {
      console.error('[BackgroundFetch] Configure failed:', error);
    }
  }
}