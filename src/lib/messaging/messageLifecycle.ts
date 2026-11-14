/**
 * Pure helpers for message edit/delete/view-once lifecycle operations.
 */

import { ChatMessage } from '../../types/messenger';
import { secureWipeMessage } from '../security/secureWipe';

export function editMessage(
  messages: ChatMessage[],
  messageId: string,
  newText: string,
  editedAt: number = Date.now(),
): ChatMessage[] {
  return messages.map((message) =>
    message.id === messageId ? { ...message, text: newText, editedAt } : message,
  );
}

export function deleteMessage(
  messages: ChatMessage[],
  messageId: string,
  forEveryone: boolean = true,
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const wiped = { ...message };
    if (forEveryone) {
      secureWipeMessage(wiped);
      wiped.text = undefined;
    }
    wiped.deleted = true;
    wiped.deletedForEveryone = forEveryone;
    return wiped;
  });
}

export function purgeExpiredMessages(messages: ChatMessage[], now: number = Date.now()): ChatMessage[] {
  const kept: ChatMessage[] = [];
  for (const message of messages) {
    if (message.expiresAt && message.expiresAt <= now) {
      secureWipeMessage(message);
    } else {
      kept.push(message);
    }
  }
  return kept;
}

export function markMessageViewed(messages: ChatMessage[], messageId: string): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId || !message.viewOnce) return message;
    secureWipeMessage(message);
    return { ...message, viewed: true, wiped: true, text: undefined, images: undefined };
  });
}
