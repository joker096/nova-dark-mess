/**
 * Unified Push Notification Service
 *
 * Supports both:
 * - Web Push (Service Worker + VAPID) for browsers
 * - Native Push (FCM/APNs via Tauri plugin) for mobile/desktop apps
 *
 * The frontend calls registerForPush() which detects the platform and uses
 * the appropriate implementation.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../utils/platform';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushMessage {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string; icon?: string }>;
}

type PushCallback = (message: PushMessage) => void;

let pushListener: ((message: PushMessage) => void) | null = null;
let tauriPushListener: (() => void) | null = null;

/**
 * Check if we're running in Tauri (native app)
 */
function isNativeApp(): boolean {
  return isTauri();
}

/**
 * Register for push notifications
 * Returns the push token/endpoint for sending notifications from server
 */
export async function registerForPush(): Promise<string | null> {
  if (isNativeApp()) {
    return registerNativePush();
  } else {
    return registerWebPush();
  }
}

/**
 * Native push registration (Tauri + FCM/APNs)
 */
async function registerNativePush(): Promise<string | null> {
  try {
    // Invoke Tauri command to register for push
    const token = await invoke<string>('register_push_token');
    console.log('[Push] Native push token:', token);

    // Set up listener for incoming push notifications
    if (!tauriPushListener) {
      const { listen } = await import('@tauri-apps/api/event');
      tauriPushListener = await listen('push-notification', (event) => {
        const payload = event.payload as PushMessage;
        if (pushListener) {
          pushListener(payload);
        }
      });
    }

    // Also listen for token updates
    const { listen } = await import('@tauri-apps/api/event');
    await listen('push-token', (event) => {
      const token = event.payload as string;
      console.log('[Push] Token updated:', token);
    });

    return token;
  } catch (error) {
    console.error('[Push] Native registration failed:', error);
    // Fallback to web push if available
    return registerWebPush();
  }
}

/**
 * Web Push registration (Service Worker + VAPID)
 */
async function registerWebPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Web Push not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast to BufferSource: the key is copied into a plain ArrayBuffer below.
      applicationServerKey: urlBase64ToUint8Array(
        import.meta.env.VITE_VAPID_PUBLIC_KEY || '',
      ) as unknown as BufferSource,
    });

    const token = JSON.stringify(subscription.toJSON());
    console.log('[Push] Web Push subscription:', token);

    // Set up message listener
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && pushListener) {
        pushListener(event.data);
      }
    });

    return token;
  } catch (error) {
    console.error('[Push] Web Push registration failed:', error);
    return null;
  }
}

/**
 * Unregister from push notifications
 */
export async function unregisterFromPush(): Promise<void> {
  if (isNativeApp()) {
    try {
      await invoke('unregister_push_token');
      if (tauriPushListener) {
        tauriPushListener();
        tauriPushListener = null;
      }
    } catch (error) {
      console.error('[Push] Native unregister failed:', error);
    }
  } else {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }
    } catch (error) {
      console.error('[Push] Web Push unregister failed:', error);
    }
  }
}

/**
 * Get current push token
 */
export async function getPushToken(): Promise<string | null> {
  if (isNativeApp()) {
    try {
      return await invoke<Option<string>>('get_push_token');
    } catch {
      return null;
    }
  } else {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        return JSON.stringify(subscription.toJSON());
      }
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * Set callback for incoming push messages
 */
export function setPushListener(callback: PushCallback): void {
  pushListener = callback;
}

/**
 * Show local notification (works both native and web)
 */
export async function showLocalNotification(message: PushMessage): Promise<void> {
  if (isNativeApp()) {
    try {
      await invoke('plugin:notification|show', {
        title: message.title,
        body: message.body,
        identifier: message.tag || 'nova-notification',
        ...(message.icon && { icon: message.icon }),
        ...(message.data && { extra: message.data }),
      });
    } catch (error) {
      console.error('[Push] Native notification failed:', error);
    }
  } else {
    // Web notification (requires permission)
    if (Notification.permission === 'granted') {
      // `actions` is part of the Notifications spec but not of the TS lib yet.
      const options: NotificationOptions & {
        actions?: Array<{ action: string; title: string; icon?: string }>;
      } = {
        body: message.body,
        icon: message.icon,
        badge: message.badge,
        tag: message.tag,
        data: message.data,
        requireInteraction: message.requireInteraction,
        actions: message.actions,
      };
      new Notification(message.title, options);
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        showLocalNotification(message);
      }
    }
  }
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isNativeApp()) {
    // Native apps handle permissions via OS settings
    return 'granted';
  } else {
    return Notification.requestPermission();
  }
}

/**
 * Check if notifications are supported
 */
export function isPushSupported(): boolean {
  if (isNativeApp()) return true;
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Convert VAPID public key to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Type for optional return
 */
type Option<T> = T | null;