/**
 * Store-and-forward integration: drains the offline message queue through a
 * MeshRelay (or any sender) when connectivity is available.
 */

import { MeshRelay } from '../p2p/relay';
import { QueuedMessage, flushQueue, getQueuedMessages } from './offlineQueue';

export async function flushOfflineQueueViaRelay(
  relay: MeshRelay,
): Promise<{ sent: number; failed: number }> {
  return flushQueue(async (message: QueuedMessage) => {
    const ok = relay.send(message.chatId, message.payload);
    if (!ok) throw new Error('Relay send failed');
  });
}

export function queuedCount(): number {
  return getQueuedMessages().length;
}
