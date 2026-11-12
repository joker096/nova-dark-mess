import {
  MessageEnvelope,
  createMessageEnvelope,
  deserializeMessageEnvelope,
  isMessageExpired,
} from './MessageEnvelope';

export type MessageAckStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface QueuedMessage {
  id: string;
  envelope: MessageEnvelope;
  status: MessageAckStatus;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

interface DbRecord {
  id: string;
  envelope: string; // JSON serialized MessageEnvelope
  status: MessageAckStatus;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

// In-memory store (replaces IndexedDB for simplicity)
const store = new Map<string, DbRecord>();

export async function initMessageQueue(): Promise<void> {
  store.clear();
}

export async function enqueueMessage(
  input: Parameters<typeof createMessageEnvelope>[0],
): Promise<QueuedMessage> {
  const envelope = createMessageEnvelope(input);
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const record: DbRecord = {
    id,
    envelope: JSON.stringify(envelope),
    status: 'pending',
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };

  store.set(id, record);

  return {
    id,
    envelope,
    status: 'pending',
    createdAt: record.createdAt,
    attempts: 0,
    lastError: null,
  };
}

export async function getPendingMessages(): Promise<QueuedMessage[]> {
  const all = await getAllMessages();
  return all.filter((m) => m.status === 'pending' && !isMessageExpired(m.envelope));
}

export async function getMessageById(id: string): Promise<QueuedMessage | null> {
  const record = store.get(id);
  if (!record) return null;

  return {
    id: record.id,
    envelope: deserializeMessageEnvelope(record.envelope),
    status: record.status,
    createdAt: record.createdAt,
    attempts: record.attempts,
    lastError: record.lastError,
  };
}

export async function updateMessageStatus(
  id: string,
  status: MessageAckStatus,
  error: string | null = null,
): Promise<void> {
  const record = store.get(id);
  if (!record) return;

  record.status = status;
  if (error !== null) record.lastError = error;
  if (status === 'sent' || status === 'failed') record.attempts += 1;

  store.set(id, record);
}

export async function incrementAttempts(id: string): Promise<void> {
  const record = store.get(id);
  if (!record) return;

  record.attempts += 1;
  store.set(id, record);
}

export async function removeMessage(id: string): Promise<void> {
  store.delete(id);
}

export async function getAllMessages(): Promise<QueuedMessage[]> {
  const messages: QueuedMessage[] = [];
  for (const record of store.values()) {
    messages.push({
      id: record.id,
      envelope: deserializeMessageEnvelope(record.envelope),
      status: record.status,
      createdAt: record.createdAt,
      attempts: record.attempts,
      lastError: record.lastError,
    });
  }
  return messages;
}

export async function expireOldMessages(): Promise<string[]> {
  const all = await getAllMessages();
  const expired = all.filter((m) => isMessageExpired(m.envelope));

  for (const msg of expired) {
    store.delete(msg.id);
  }

  return expired.map((m) => m.id);
}

export async function getQueueStats(): Promise<{
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}> {
  const all = await getAllMessages();
  return {
    total: all.length,
    pending: all.filter((m) => m.status === 'pending').length,
    sent: all.filter((m) => m.status === 'sent').length,
    delivered: all.filter((m) => m.status === 'delivered').length,
    read: all.filter((m) => m.status === 'read').length,
    failed: all.filter((m) => m.status === 'failed').length,
  };
}
