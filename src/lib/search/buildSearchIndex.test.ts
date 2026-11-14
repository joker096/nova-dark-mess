import { describe, it, expect } from 'vitest';
import { buildGlobalSearchIndex } from './buildSearchIndex';

describe('buildGlobalSearchIndex', () => {
  it('indexes chat text, media and files', () => {
    const items = buildGlobalSearchIndex({
      chats: [{ id: 'c1', name: 'Alice', avatar: 'a.png', snippet: '', time: '', type: 'direct' }],
      histories: {
        c1: [
          { id: 'm1', senderId: 'me', text: 'meet at Harrys', time: '10:00' },
          { id: 'm2', senderId: 'other', images: ['x.png'], time: '10:01' },
          {
            id: 'm3',
            senderId: 'me',
            document: { name: 'plan.pdf', size: '1 MB', type: 'pdf' },
            time: '10:02',
          },
          { id: 'm4', senderId: 'me', text: 'deleted', deleted: true, time: '10:03' },
        ],
      },
    });

    expect(items.find((i) => i.id === 'chat:c1:m1')?.chatName).toBe('Alice');
    expect(items.filter((i) => i.kind === 'media')).toHaveLength(1);
    expect(items.find((i) => i.kind === 'file')?.text).toContain('plan.pdf');
    expect(items.some((i) => i.id === 'chat:c1:m4')).toBe(false);
  });

  it('indexes channel posts with comments and polls', () => {
    const items = buildGlobalSearchIndex({
      channels: [{ id: 'ch1', name: 'Nova', subscribers: 1, createdAt: 1 }],
      posts: [
        {
          id: 'p1',
          time: '11:00',
          dateKey: 1,
          title: 'Roadmap',
          text: 'Phase 1',
          commentsCount: 1,
          reactions: [],
          channelId: 'ch1',
          comments: [
            { id: 'cm1', postId: 'p1', text: 'great news', authorName: 'Bob', createdAt: 1 },
          ],
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'channel-post', chatName: 'Nova' });
    expect(items[0].text).toContain('great news');
  });
});
