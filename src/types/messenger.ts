export interface Story {
  id: string;
  name: string;
  avatar: string;
  coverImage: string;
  unreadCount: number;
  caption?: string;
  createdAt?: number;
  expiresAt?: number;
  scheduledFor?: number;
  viewed?: boolean;
  isMine?: boolean;
  reactions?: {
    emoji: string;
    count: number;
    userReacted?: boolean;
  }[];
}

export interface StoryDraft {
  coverImage: string;
  caption?: string;
  scheduledFor?: number;
}

export type ChannelVisibility = 'public' | 'private';

export interface ChannelInfo {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  coverImage?: string;
  subscribers: number;
  createdAt: number;
  isOwned?: boolean;
  isPopular?: boolean;
  /** Whether the signed-in user follows this channel. */
  isFollowing?: boolean;
  /** Unread post count for the list badge (0 hides it). */
  unreadCount?: number;
  /** Mutes the unread badge (gray instead of accent). */
  muted?: boolean;
  /** One-line preview of the latest post. */
  lastPostPreview?: string;
  /** Timestamp of the latest post, used for the preview time. */
  lastPostAt?: number;
  soundEnabled?: boolean;
  hideSubscriberCount?: boolean;
  visibility?: ChannelVisibility;
  inviteCode?: string;
}

export interface ChannelDraft {
  name: string;
  description?: string;
  avatar?: string;
  coverImage?: string;
  isPopular?: boolean;
  visibility?: ChannelVisibility;
}

export interface ChannelPostDraft {
  title: string;
  text: string;
  image?: string;
  scheduledFor?: number;
  poll?: PollData;
  sticker?: StickerData;
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
  members?: string[];
}

export interface VoiceNoteData {
  duration: string;
  durationSeconds: number;
  waveform: number[];
  audioUrl?: string;
}

export interface DocumentAttachment {
  name: string;
  size: string;
  type: 'pdf' | 'doc' | 'sheet' | 'zip' | 'other';
  url?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  votedByMe?: boolean;
}

export interface PollData {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  isAnonymous?: boolean;
  allowsMultiple?: boolean;
  isQuiz?: boolean;
  correctOptionId?: string;
  explanation?: string;
  closed?: boolean;
}

export type StickerAccess = 'free' | 'premium';

export interface StickerData {
  id: string;
  packId: string;
  packName: string;
  name: string;
  emoji: string;
  imageUrl?: string;
  thumbUrl?: string;
  svgBadge?: string;
  category?: string;
  access?: StickerAccess;
  tags?: string[];
  sortOrder?: number;
  animated?: boolean;
  /** Animated/video source (GIF, WebP, MP4 or WebM). original imageUrl stays the static fallback. */
  animationUrl?: string;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  title: string;
  address?: string;
  isLive?: boolean;
  liveUntil?: number;
  duration?: string;
}

export interface ChatMessage {
  id: string;
  senderId: 'me' | 'other';
  text?: string;
  images?: string[];
  document?: DocumentAttachment;
  voiceNote?: VoiceNoteData;
  poll?: PollData;
  sticker?: StickerData;
  location?: LocationData;
  time: string;
  /** Optional ISO/epoch timestamp used for smart-reply recency and date grouping. */
  createdAt?: number;
  /** Delivery lifecycle: queued → sent → delivered → read, or error with retry. */
  deliveryStatus?: 'queued' | 'sent' | 'delivered' | 'read' | 'error';
  isRead?: boolean;
  isPinned?: boolean;
  pinnedNote?: string;
  editedAt?: number;
  expiresAt?: number;
  deleted?: boolean;
  deletedForEveryone?: boolean;
  /** System event row (member added/removed, role change). */
  system?: boolean;
  viewOnce?: boolean;
  viewed?: boolean;
  wiped?: boolean;
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
  forwardedFrom?: string;
}

export interface ChannelComment {
  id: string;
  postId: string;
  text: string;
  authorName: string;
  createdAt: number;
}

export interface ChannelPost {
  id: string;
  time: string;
  dateKey: number;
  title: string;
  text: string;
  image?: string;
  imageBadge?: string;
  commentsCount: number;
  /** View counter; absent until the post has been measured. */
  views?: number;
  reactions: {
    emoji: string;
    count: number;
    userReacted?: boolean;
  }[];
  channelId?: string;
  createdAt?: number;
  scheduledFor?: number;
  authorName?: string;
  poll?: PollData;
  sticker?: StickerData;
  comments?: ChannelComment[];
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

