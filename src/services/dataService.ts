import type { ChatItem, ContactProfile, Story, ChatMessage, ChannelPost } from '../types/messenger';

export interface DataService {
  getCurrentUser(): Promise<{ id: string; name: string; avatar: string; unreadTotal: number }>;
  getStories(): Promise<Story[]>;
  getChats(): Promise<ChatItem[]>;
  getContactProfile(contactId: string): Promise<ContactProfile | null>;
  getConversationHistory(chatId: string): Promise<ChatMessage[]>;
  getSharedMedia(chatId: string): Promise<{ id: string; type: 'photo' | 'video'; url: string; thumbnail: string; timestamp: number }[]>;
  getStickerPacks(): Promise<any[]>;
  getChannelPosts(channelId: string): Promise<ChannelPost[]>;
}

class ProductionDataService implements DataService {
  async getCurrentUser(): Promise<{ id: string; name: string; avatar: string; unreadTotal: number }> {
    throw new Error('Production data service not implemented');
  }

  async getStories(): Promise<Story[]> {
    throw new Error('Production data service not implemented');
  }

  async getChats(): Promise<ChatItem[]> {
    throw new Error('Production data service not implemented');
  }

  async getContactProfile(contactId: string): Promise<ContactProfile | null> {
    throw new Error('Production data service not implemented');
  }

  async getConversationHistory(chatId: string): Promise<ChatMessage[]> {
    throw new Error('Production data service not implemented');
  }

  async getSharedMedia(chatId: string): Promise<{ id: string; type: 'photo' | 'video'; url: string; thumbnail: string; timestamp: number }[]> {
    throw new Error('Production data service not implemented');
  }

  async getStickerPacks(): Promise<any[]> {
    throw new Error('Production data service not implemented');
  }

  async getChannelPosts(channelId: string): Promise<ChannelPost[]> {
    throw new Error('Production data service not implemented');
  }
}

class DevDataService implements DataService {
  private mockData: any = null;

  async init() {
    if (this.mockData) return;
    const { loadDevMockData } = await import('../data/devMockData');
    this.mockData = await loadDevMockData();
  }

  async getCurrentUser() {
    await this.init();
    return this.mockData?.CURRENT_USER ?? { id: '', name: '', avatar: '', unreadTotal: 0 };
  }

  async getStories() {
    await this.init();
    return this.mockData?.MOCK_STORIES ?? [];
  }

  async getChats() {
    await this.init();
    return this.mockData?.MOCK_CHATS ?? [];
  }

  async getContactProfile(contactId: string) {
    await this.init();
    return this.mockData?.CONTACT_PROFILES?.[contactId] ?? null;
  }

  async getConversationHistory(chatId: string) {
    await this.init();
    return this.mockData?.CONVERSATION_HISTORIES?.[chatId] ?? [];
  }

  async getSharedMedia(chatId: string) {
    await this.init();
    if (chatId === 'katie' && this.mockData?.KATIE_SHARED_MEDIA) {
      return this.mockData.KATIE_SHARED_MEDIA;
    }
    return [];
  }

  async getStickerPacks() {
    await this.init();
    return this.mockData?.STICKER_PACKS ?? [];
  }

  async getChannelPosts(channelId: string) {
    await this.init();
    return [];
  }
}

let dataServiceInstance: DataService | null = null;

export function getDataService(): DataService {
  if (dataServiceInstance) return dataServiceInstance;

  if (import.meta.env.DEV) {
    dataServiceInstance = new DevDataService();
  } else {
    dataServiceInstance = new ProductionDataService();
  }

  return dataServiceInstance;
}

export function resetDataService() {
  dataServiceInstance = null;
}