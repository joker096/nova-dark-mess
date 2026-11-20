const READ_CHATS_KEY = 'nova_read_chats_v1';
export const CHAT_READ_EVENT = 'nova:chat-read';

import { getCachedItem, setCachedItem } from '../storage/localStorageCache';

export function loadReadChats(): Set<string> {
  try {
    const cached = getCachedItem<string[]>(READ_CHATS_KEY);
    if (cached) return new Set(cached);
    const raw = localStorage.getItem(READ_CHATS_KEY);
    if (!raw) return new Set();
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) {
      console.error('unread: stored read chat state is invalid');
      return new Set();
    }
    const ids = stored.filter((id: unknown): id is string => typeof id === 'string');
    setCachedItem(READ_CHATS_KEY, ids);
    return new Set(ids);
  } catch (error) {
    console.error('unread: failed to load read chat state', error);
    return new Set();
  }
}

export function markChatRead(chatId: string): void {
  if (!chatId) return;
  const readChats = loadReadChats();
  if (readChats.has(chatId)) return;
  readChats.add(chatId);
  try {
    localStorage.setItem(READ_CHATS_KEY, JSON.stringify([...readChats]));
    setCachedItem(READ_CHATS_KEY, [...readChats]);
  } catch (error) {
    console.error('unread: failed to persist read chat state', error);
  }
  window.dispatchEvent(new Event(CHAT_READ_EVENT));
}
