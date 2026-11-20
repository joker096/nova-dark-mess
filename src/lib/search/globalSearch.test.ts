import { describe, it, expect } from 'vitest';
import { searchGlobal, buildSearchSnippet, tokenizeQuery } from './globalSearch';

describe('globalSearch', () => {
  const items = [
    { id: '1', chatId: 'c1', chatName: 'Alice', kind: 'message' as const, text: 'Let us meet at Harrys bar', timestamp: 10 },
    { id: '2', chatId: 'c2', chatName: 'Bob', kind: 'channel-post' as const, text: 'New channel update', timestamp: 20 },
    { id: '3', chatId: 'c1', chatName: 'Alice', kind: 'media' as const, text: 'photo from trip', timestamp: 30 },
  ];

  it('tokenizes queries', () => {
    expect(tokenizeQuery('  meet   Harrys  ')).toEqual(['meet', 'harrys']);
  });

  it('returns matching items and filters by kind', () => {
    const all = searchGlobal(items, 'harrys');
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('1');

    const none = searchGlobal(items, 'harrys', { kinds: ['media'] });
    expect(none).toHaveLength(0);
  });

  it('requires all terms for multi-word queries', () => {
    expect(searchGlobal(items, 'meet harrx')).toHaveLength(0);
    expect(searchGlobal(items, 'meet harrys')).toHaveLength(1);
  });

  it('respects limit', () => {
    expect(searchGlobal(items, 'a', { limit: 1 })).toHaveLength(1);
  });

  it('builds snippets', () => {
    const snippet = buildSearchSnippet('prefix '.repeat(10) + 'needle' + ' suffix'.repeat(10), 'needle');
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
  });

  it('caches results for repeated same-query searches', () => {
    const items = [
      { id: '1', chatId: 'c1', chatName: 'Alice', kind: 'message' as const, text: 'Hello world', timestamp: 10 },
    ];

    const first = searchGlobal(items, 'hello');
    const second = searchGlobal(items, 'hello');

    expect(second).toBe(first); // same cached array reference

    // A different query is not served from cache
    const other = searchGlobal(items, 'world');
    expect(other).toHaveLength(1);
    expect(other).not.toBe(first);
  });

  it('does not cache results for a different items array (WeakMap isolation)', () => {
    const itemsA = [
      { id: '1', chatId: 'c1', chatName: 'Alice', kind: 'message' as const, text: 'Hello world', timestamp: 10 },
    ];
    const itemsB = [
      { id: '1', chatId: 'c1', chatName: 'Alice', kind: 'message' as const, text: 'Goodbye world', timestamp: 10 },
    ];

    expect(searchGlobal(itemsA, 'hello')).toHaveLength(1);
    expect(searchGlobal(itemsB, 'hello')).toHaveLength(0);
  });
});
