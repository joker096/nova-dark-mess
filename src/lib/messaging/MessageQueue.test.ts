/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initMessageQueue,
  enqueueMessage,
  getPendingMessages,
  getMessageById,
  updateMessageStatus,
  incrementAttempts,
  removeMessage,
  getAllMessages,
  expireOldMessages,
  getQueueStats,
  type MessageAckStatus,
} from './MessageQueue';
import { createMessageEnvelope } from './MessageEnvelope';

vi.useFakeTimers({ toFake: ['Date'] });

describe('MessageQueue', () => {
  beforeEach(async () => {
    await initMessageQueue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueues and retrieves a pending message', async () => {
    const input = {
      type: 'message' as const,
      sender: 'alice',
      recipient: 'bob',
      encryptedPayload: 'test-payload',
      iv: 'test-iv',
      mac: 'test-mac',
    };

    const queued = await enqueueMessage(input);
    expect(queued.id).toBeDefined();
    expect(queued.status).toBe('pending');
    expect(queued.attempts).toBe(0);
    expect(queued.envelope.sender).toBe('alice');
    expect(queued.envelope.recipient).toBe('bob');

    const pending = await getPendingMessages();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(queued.id);
  });

  it('retrieves a message by ID', async () => {
    const queued = await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      encryptedPayload: 'payload',
      iv: 'iv',
      mac: 'mac',
    });

    const found = await getMessageById(queued.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(queued.id);
    expect(found!.envelope.sender).toBe('alice');

    const notFound = await getMessageById('nonexistent');
    expect(notFound).toBeNull();
  });

  it('updates message status', async () => {
    const queued = await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      encryptedPayload: 'payload',
      iv: 'iv',
      mac: 'mac',
    });

    await updateMessageStatus(queued.id, 'sent');
    const msg = await getMessageById(queued.id);
    expect(msg!.status).toBe('sent');

    await updateMessageStatus(queued.id, 'delivered');
    const msg2 = await getMessageById(queued.id);
    expect(msg2!.status).toBe('delivered');
  });

  it('increments attempts', async () => {
    const queued = await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      encryptedPayload: 'payload',
      iv: 'iv',
      mac: 'mac',
    });

    await incrementAttempts(queued.id);
    await incrementAttempts(queued.id);
    const msg = await getMessageById(queued.id);
    expect(msg!.attempts).toBe(2);
  });

  it('removes a message', async () => {
    const queued = await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      encryptedPayload: 'payload',
      iv: 'iv',
      mac: 'mac',
    });

    await removeMessage(queued.id);
    const msg = await getMessageById(queued.id);
    expect(msg).toBeNull();

    const all = await getAllMessages();
    expect(all.length).toBe(0);
  });

  it('gets queue stats', async () => {
    await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      encryptedPayload: 'p1',
      iv: 'i1',
      mac: 'm1',
    });
    await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      encryptedPayload: 'p2',
      iv: 'i2',
      mac: 'm2',
    });

    const stats = await getQueueStats();
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(2);
    expect(stats.sent).toBe(0);
  });

  it('expires old messages based on TTL', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      ttl: 1,
      encryptedPayload: 'expired-soon',
      iv: 'iv',
      mac: 'mac',
    });

    await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      ttl: 0,
      encryptedPayload: 'never-expires',
      iv: 'iv',
      mac: 'mac',
    });

    const allBefore = await getAllMessages();
    expect(allBefore.length).toBe(2);

    vi.setSystemTime(now + 2000);

    const expiredIds = await expireOldMessages();
    expect(expiredIds.length).toBe(1);

    const allAfter = await getAllMessages();
    expect(allAfter.length).toBe(1);
    expect(allAfter[0].envelope.encryptedPayload).toBe('never-expires');
  });

  it('filters out expired messages from pending', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      ttl: 1,
      encryptedPayload: 'expired',
      iv: 'iv',
      mac: 'mac',
    });

    vi.setSystemTime(now + 2000);

    const pending = await getPendingMessages();
    expect(pending.length).toBe(0);
  });

  it('tracks lastError on failed status', async () => {
    const queued = await enqueueMessage({
      type: 'message',
      sender: 'alice',
      recipient: 'bob',
      encryptedPayload: 'payload',
      iv: 'iv',
      mac: 'mac',
    });

    await updateMessageStatus(queued.id, 'failed', 'Network timeout');
    const msg = await getMessageById(queued.id);
    expect(msg!.status).toBe('failed');
    expect(msg!.lastError).toBe('Network timeout');
    expect(msg!.attempts).toBe(1);
  });
});
