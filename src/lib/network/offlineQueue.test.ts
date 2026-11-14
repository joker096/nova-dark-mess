import { describe, it, expect, beforeEach } from 'vitest';
import { enqueueMessage, getQueuedMessages, dequeueMessage, clearQueue, flushQueue } from './offlineQueue';

describe('offlineQueue', () => {
  beforeEach(() => clearQueue());

  it('enqueues and reads messages', () => {
    const msg = enqueueMessage({ id: '1', chatId: 'c1', payload: 'hi' });
    expect(msg.attempts).toBe(0);
    expect(getQueuedMessages()).toHaveLength(1);
  });

  it('dequeues messages', () => {
    enqueueMessage({ id: '1', chatId: 'c1', payload: 'hi' });
    dequeueMessage('1');
    expect(getQueuedMessages()).toHaveLength(0);
  });

  it('flushes successful messages and keeps failed ones', async () => {
    enqueueMessage({ id: '1', chatId: 'c1', payload: 'ok' });
    enqueueMessage({ id: '2', chatId: 'c1', payload: 'bad' });

    const result = await flushQueue(async (message) => {
      if (message.id === '2') throw new Error('fail');
    });

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(getQueuedMessages()).toHaveLength(1);
    expect(getQueuedMessages()[0].id).toBe('2');
  });
});
