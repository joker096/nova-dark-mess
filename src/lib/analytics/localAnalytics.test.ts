import { describe, it, expect, beforeEach } from 'vitest';
import { localAnalytics, type AnalyticsEvent } from './localAnalytics';

describe('localAnalytics', () => {
  beforeEach(() => {
    localAnalytics.clear();
  });

  it('tracks events and returns them', () => {
    localAnalytics.track({ type: 'message_send', chatId: 'katie', timestamp: 1000 });
    localAnalytics.track({ type: 'message_receive', chatId: 'katie', timestamp: 2000 });
    const events = localAnalytics.getEvents();
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('message_send');
    expect(events[1].type).toBe('message_receive');
  });

  it('counts events by type', () => {
    localAnalytics.track({ type: 'message_send', chatId: 'a', timestamp: 1000 });
    localAnalytics.track({ type: 'message_send', chatId: 'a', timestamp: 1001 });
    localAnalytics.track({ type: 'chat_open', chatId: 'b', timestamp: 1002 });
    const counts = localAnalytics.getEventCountsByType();
    expect(counts['message_send']).toBe(2);
    expect(counts['chat_open']).toBe(1);
  });

  it('tracks messages by chat', () => {
    localAnalytics.track({ type: 'message_send', chatId: 'katie', timestamp: 1000 });
    localAnalytics.track({ type: 'message_receive', chatId: 'katie', timestamp: 1001 });
    localAnalytics.track({ type: 'message_send', chatId: 'other', timestamp: 1002 });
    const stats = localAnalytics.getMessagesByChat();
    expect(stats['katie'].send).toBe(1);
    expect(stats['katie'].receive).toBe(1);
    expect(stats['other'].send).toBe(1);
    expect(stats['other'].receive).toBe(0);
  });

  it('clears all events', () => {
    localAnalytics.track({ type: 'message_send', chatId: 'katie', timestamp: 1000 });
    localAnalytics.clear();
    expect(localAnalytics.getEvents().length).toBe(0);
  });
});
