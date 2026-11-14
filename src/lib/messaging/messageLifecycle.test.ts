import { describe, it, expect } from 'vitest';
import { editMessage, deleteMessage, purgeExpiredMessages, markMessageViewed } from './messageLifecycle';

describe('messageLifecycle', () => {
  it('edits a message', () => {
    const msgs = [{ id: '1', senderId: 'me' as const, text: 'old', time: '1' }];
    const next = editMessage(msgs, '1', 'new', 123);
    expect(next[0].text).toBe('new');
    expect(next[0].editedAt).toBe(123);
  });

  it('deletes for everyone and wipes content', () => {
    const msgs = [{ id: '1', senderId: 'me' as const, text: 'secret', time: '1' }];
    const next = deleteMessage(msgs, '1', true);
    expect(next[0].deleted).toBe(true);
    expect(next[0].deletedForEveryone).toBe(true);
    expect(next[0].text).toBeUndefined();
    expect(next[0].wiped).toBe(true);
  });

  it('purges expired messages', () => {
    const msgs = [
      { id: '1', senderId: 'me' as const, text: 'old', time: '1', expiresAt: 5 },
      { id: '2', senderId: 'me' as const, text: 'keep', time: '2', expiresAt: 10 },
    ];
    const next = purgeExpiredMessages(msgs, 7);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('2');
  });

  it('marks view-once messages as viewed and wipes them', () => {
    const msgs = [{ id: '1', senderId: 'me' as const, text: 'secret', time: '1', viewOnce: true }];
    const next = markMessageViewed(msgs, '1');
    expect(next[0].viewed).toBe(true);
    expect(next[0].wiped).toBe(true);
    expect(next[0].text).toBeUndefined();
  });
});
