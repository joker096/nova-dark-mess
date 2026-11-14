export interface QueuedMessage {
  id: string;
  chatId: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
}

const STORAGE_KEY = 'nova_offline_message_queue';

function readQueue(): QueuedMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedMessage[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    void 0;
  }
}

export function enqueueMessage(message: Omit<QueuedMessage, 'createdAt' | 'attempts'>): QueuedMessage {
  const queue = readQueue();
  const entry: QueuedMessage = {
    ...message,
    createdAt: Date.now(),
    attempts: 0,
  };
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

export function dequeueMessage(id: string): void {
  const queue = readQueue().filter((m) => m.id !== id);
  writeQueue(queue);
}

export function getQueuedMessages(): QueuedMessage[] {
  return readQueue();
}

export function clearQueue(): void {
  writeQueue([]);
}

export async function flushQueue(
  sender: (message: QueuedMessage) => Promise<void>,
): Promise<{ sent: number; failed: number }> {
  const queue = readQueue();
  let sent = 0;
  let failed = 0;
  const remaining: QueuedMessage[] = [];

  for (const message of queue) {
    try {
      await sender(message);
      sent++;
    } catch {
      failed++;
      remaining.push({ ...message, attempts: message.attempts + 1 });
    }
  }

  writeQueue(remaining);
  return { sent, failed };
}
