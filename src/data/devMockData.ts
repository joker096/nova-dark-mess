import type { ChatItem, ContactProfile, Story, ChatMessage, ChannelPost, SharedMediaItem } from '../types/messenger';
import { STICKER_PACKS } from './stickers';

let mockDataPromise: Promise<{
  CURRENT_USER: { id: string; name: string; avatar: string; unreadTotal: number };
  MOCK_STORIES: Story[];
  MOCK_CHATS: ChatItem[];
  CONTACT_PROFILES: Record<string, ContactProfile>;
  CONVERSATION_HISTORIES: Record<string, ChatMessage[]>;
  KATIE_SHARED_MEDIA: SharedMediaItem[];
  STICKER_PACKS: typeof STICKER_PACKS;
} | null> = null;

export async function loadDevMockData() {
  if (mockDataPromise) return mockDataPromise;

  if (import.meta.env.DEV) {
    mockDataPromise = import('./mockMessengerData').then(module => ({
      CURRENT_USER: module.CURRENT_USER,
      MOCK_STORIES: module.MOCK_STORIES,
      MOCK_CHATS: module.MOCK_CHATS,
      CONTACT_PROFILES: module.CONTACT_PROFILES,
      CONVERSATION_HISTORIES: module.CONVERSATION_HISTORIES,
      KATIE_SHARED_MEDIA: module.KATIE_SHARED_MEDIA,
      STICKER_PACKS,
    }));
    return mockDataPromise;
  }

  return null;
}

export function isDevMode(): boolean {
  return import.meta.env.DEV;
}

export function getDevMockDataSync() {
  if (import.meta.env.DEV) {
    try {
      const module = require('./mockMessengerData');
      return {
        CURRENT_USER: module.CURRENT_USER,
        MOCK_STORIES: module.MOCK_STORIES,
        MOCK_CHATS: module.MOCK_CHATS,
        CONTACT_PROFILES: module.CONTACT_PROFILES,
        CONVERSATION_HISTORIES: module.CONVERSATION_HISTORIES,
        KATIE_SHARED_MEDIA: module.KATIE_SHARED_MEDIA,
        STICKER_PACKS,
      };
    } catch {
      return null;
    }
  }
  return null;
}