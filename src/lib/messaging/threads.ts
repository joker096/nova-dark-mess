/**
 * Thread helpers: group messages into reply threads.
 */

import { ChatMessage } from '../../types/messenger';

export interface ThreadNode {
  message: ChatMessage;
  replies: ThreadNode[];
}

export function buildThreads(messages: ChatMessage[]): ThreadNode[] {
  const byId = new Map<string, ThreadNode>();
  const roots: ThreadNode[] = [];

  for (const message of messages) {
    byId.set(message.id, { message, replies: [] });
  }

  for (const message of messages) {
    const node = byId.get(message.id)!;
    const parentId = message.replyTo?.id;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function getThreadMessages(messages: ChatMessage[], rootId: string): ChatMessage[] {
  const result: ChatMessage[] = [];
  const visited = new Set<string>();

  function collect(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const msg = messages.find((m) => m.id === id);
    if (msg) result.push(msg);
    for (const m of messages) {
      if (m.replyTo?.id === id) collect(m.id);
    }
  }

  collect(rootId);
  return result;
}
