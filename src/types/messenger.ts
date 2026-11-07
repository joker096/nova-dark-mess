export interface Story {
  id: string;
  name: string;
  avatar: string;
  coverImage: string;
  unreadCount: number;
}

export interface ChatFolder {
  id: string;
  name: string;
  icon?: string;
  chatIds: string[];
  filterType?: 'all' | 'custom' | 'direct' | 'groups' | 'channels';
  isDefault?: boolean;
}

export interface ChatItem {
  id: string;
  name: string;
  avatar: string;
  groupAvatars?: string[];
  snippet: string;
  time: string;
  unreadCount?: number;
  isPinned?: boolean;
  isChannel?: boolean;
  type: 'direct' | 'group' | 'channel';
  category?: string;
}

export interface VoiceNoteData {
  duration: string;
  durationSeconds: number;
  waveform: number[];
  audioUrl?: string;
}

export interface ChatMessage {
  id: string;
  senderId: 'me' | 'other';
  text?: string;
  images?: string[];
  voiceNote?: VoiceNoteData;
  time: string;
  isRead?: boolean;
  isPinned?: boolean;
  pinnedNote?: string;
  reactions?: {
    emoji: string;
    count: number;
    fromMe?: boolean;
  }[];
  replyTo?: {
    id: string;
    text?: string;
    senderName: string;
  };
}

export interface ChannelPost {
  id: string;
  time: string;
  dateKey: number; // e.g. 24
  title: string;
  text: string;
  image?: string;
  imageBadge?: string;
  commentsCount: number;
  reactions: {
    emoji: string;
    count: number;
    userReacted?: boolean;
  }[];
}

export interface SharedMediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
  duration?: string;
  date: string;
  monthGroup: string;
  caption?: string;
  chatMessageSnippet?: string;
  messageId?: string;
  senderId?: 'me' | 'other';
}

export interface ContactProfile {
  name: string;
  avatar: string;
  status: string;
  phone: string;
  nickname: string;
  mediaCount: number;
  filesCount: number;
  linksCount: number;
  voiceCount: number;
  mediaItems: string[];
  sharedMedia?: SharedMediaItem[];
}

export interface MessageSearchResult {
  chatId: string;
  chatName: string;
  chatAvatar: string;
  isChannel?: boolean;
  messageId: string;
  text: string;
  time: string;
  senderName: string;
}

