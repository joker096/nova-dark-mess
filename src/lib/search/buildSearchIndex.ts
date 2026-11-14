/**
 * Builds the local global-search index from already-loaded chats, channels and
 * their message/post history. Nothing leaves the device.
 */

import { ChannelInfo, ChannelPost, ChatItem, ChatMessage } from '../../types/messenger';
import { GlobalSearchItem } from './globalSearch';

export interface SearchIndexInput {
  chats?: ChatItem[];
  histories?: Record<string, ChatMessage[]>;
  channels?: ChannelInfo[];
  posts?: ChannelPost[];
}

function messageSearchText(message: ChatMessage): string {
  const parts: string[] = [];
  if (message.text) parts.push(message.text);
  if (message.pinnedNote) parts.push(message.pinnedNote);
  if (message.document) parts.push(message.document.name);
  if (message.poll) {
    parts.push(message.poll.question);
    for (const option of message.poll.options) parts.push(option.text);
  }
  if (message.location) {
    parts.push(message.location.title);
    if (message.location.address) parts.push(message.location.address);
  }
  if (message.sticker) parts.push(message.sticker.name, message.sticker.packName);
  if (message.voiceNote) parts.push('voice message audio');
  if (message.images?.length) parts.push('photo image picture');
  if (message.replyTo?.text) parts.push(message.replyTo.text);
  return parts.join(' ');
}

function postSearchText(post: ChannelPost): string {
  const parts = [post.title, post.text];
  if (post.poll) {
    parts.push(post.poll.question);
    for (const option of post.poll.options) parts.push(option.text);
  }
  if (post.sticker) parts.push(post.sticker.name, post.sticker.packName);
  for (const comment of post.comments ?? []) parts.push(comment.text);
  if (post.image) parts.push('photo image picture');
  return parts.filter(Boolean).join(' ');
}

export function buildGlobalSearchIndex(input: SearchIndexInput): GlobalSearchItem[] {
  const items: GlobalSearchItem[] = [];
  const chatById = new Map((input.chats ?? []).map((chat) => [chat.id, chat]));
  const channelById = new Map((input.channels ?? []).map((channel) => [channel.id, channel]));

  for (const [chatId, messages] of Object.entries(input.histories ?? {})) {
    const chat = chatById.get(chatId);
    const chatName = chat?.name ?? chatId;

    for (const message of messages) {
      if (message.deleted || message.wiped) continue;
      const text = messageSearchText(message).trim();
      if (!text) continue;

      items.push({
        id: `chat:${chatId}:${message.id}`,
        chatId,
        chatName,
        chatAvatar: chat?.avatar,
        kind: 'message',
        text,
        senderName: message.senderId === 'me' ? 'You' : undefined,
        time: message.time,
      });

      if (message.images?.length) {
        items.push({
          id: `media:${chatId}:${message.id}`,
          chatId,
          chatName,
          chatAvatar: chat?.avatar,
          kind: 'media',
          text: text,
          time: message.time,
        });
      }
      if (message.document) {
        items.push({
          id: `file:${chatId}:${message.id}`,
          chatId,
          chatName,
          chatAvatar: chat?.avatar,
          kind: 'file',
          text: text,
          time: message.time,
        });
      }
    }
  }

  for (const post of input.posts ?? []) {
    const channelId = post.channelId ?? 'channels';
    const channel = channelById.get(channelId);
    const text = postSearchText(post).trim();
    if (!text) continue;

    items.push({
      id: `post:${post.id}`,
      chatId: channelId,
      chatName: channel?.name ?? 'Channel',
      chatAvatar: channel?.avatar,
      kind: 'channel-post',
      text,
      senderName: post.authorName,
      time: post.time,
      timestamp: post.createdAt,
    });
  }

  return items;
}
