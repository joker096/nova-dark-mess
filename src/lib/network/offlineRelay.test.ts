import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushOfflineQueueViaRelay, queuedCount } from './offlineRelay';
import { enqueueMessage, clearQueue, getQueuedMessages } from './offlineQueue';
import { MeshRelay } from '../p2p/relay';

describe('offlineRelay', () => {
  beforeEach(() => clearQueue());

  it('drains the queue through the mesh relay', async () => {
    enqueueMessage({ id: '1', chatId: 'peer-a', payload: 'one' });
    enqueueMessage({ id: '2', chatId: 'peer-b', payload: 'two' });

    const relay = { send: vi.fn().mockReturnValue(true) } as unknown as MeshRelay;
    const result = await flushOfflineQueueViaRelay(relay);

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(relay.send).toHaveBeenCalledTimes(2);
    expect(queuedCount()).toBe(0);
  });

  it('keeps messages that the relay rejects', async () => {
    enqueueMessage({ id: '1', chatId: 'peer-a', payload: 'one' });
    const relay = { send: vi.fn().mockReturnValue(false) } as unknown as MeshRelay;

    const result = await flushOfflineQueueViaRelay(relay);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(getQueuedMessages()).toHaveLength(1);
    expect(getQueuedMessages()[0].attempts).toBe(1);
  });
});
