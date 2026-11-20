/**
 * Local subscription state for channels.
 *
 * Subscribing is a per-device preference (no server knows about it), so it
 * lives next to the other channel state in localStorage.
 */

const STORAGE_KEY = 'nova.channel.subscriptions';
const NOTIFICATIONS_KEY = 'nova.channel.notifications';

type SubscriptionMap = Record<string, boolean>;

function read(): SubscriptionMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as SubscriptionMap;
  } catch {
    return {};
  }
}

function write(map: SubscriptionMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage can be full or disabled; the in-memory state still works.
  }
}

function readNotifications(): SubscriptionMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as SubscriptionMap;
  } catch {
    return {};
  }
}

function writeNotifications(map: SubscriptionMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(map));
  } catch {
    // Storage can be full or disabled; the in-memory state still works.
  }
}

/** Channels are subscribed by default until the user explicitly leaves. */
export function isSubscribed(channelId: string): boolean {
  return read()[channelId] !== false;
}

export function setSubscribed(channelId: string, subscribed: boolean): void {
  const map = read();
  map[channelId] = subscribed;
  write(map);
}

/** Notifications are enabled by default for subscribed channels. */
export function isNotificationsEnabled(channelId: string): boolean {
  return readNotifications()[channelId] !== false;
}

export function setNotificationsEnabledForChannel(channelId: string, enabled: boolean): void {
  const map = readNotifications();
  map[channelId] = enabled;
  writeNotifications(map);
}
