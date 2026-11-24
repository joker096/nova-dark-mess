import { describe, it, expect, beforeEach } from 'vitest';
import { localAnalytics } from './localAnalytics';

describe('localAnalytics', () => {
  beforeEach(() => {
    localAnalytics.clear();
    // Events are deliberately dropped until the user opts in.
    localAnalytics.setAnalyticsConsent(true);
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

  it('stores crash reports only with consent and clears them separately', () => {
    localAnalytics.setCrashReportsConsent(false);
    window.onerror?.('before consent', 'app.ts', 1, 1, new Error('before consent'));
    expect(localAnalytics.getCrashes()).toHaveLength(0);

    localAnalytics.setCrashReportsConsent(true);
    window.onerror?.('after consent', 'app.ts', 2, 2, new Error('after consent'));
    expect(localAnalytics.getCrashes()).toHaveLength(1);
    expect(localAnalytics.getCrashes()[0].message).toBe('after consent');

    localAnalytics.track({ type: 'message_send', chatId: 'katie', timestamp: 1000 });
    localAnalytics.clearCrashes();
    expect(localAnalytics.getCrashes()).toHaveLength(0);
    expect(localAnalytics.getEvents().length).toBeGreaterThan(0);
  });
});
