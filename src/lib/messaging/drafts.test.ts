import { describe, it, expect, beforeEach } from 'vitest';
import { getDraft, setDraft, clearDraft, getAllDrafts } from './drafts';

describe('Drafts manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves, retrieves and clears a draft', () => {
    expect(getDraft('katie')).toBe('');
    setDraft('katie', 'Hello Katie, how are you?');
    expect(getDraft('katie')).toBe('Hello Katie, how are you?');

    clearDraft('katie');
    expect(getDraft('katie')).toBe('');
  });

  it('removes draft when set to empty or whitespace string', () => {
    setDraft('chat-1', 'Some note');
    expect(getDraft('chat-1')).toBe('Some note');

    setDraft('chat-1', '   ');
    expect(getDraft('chat-1')).toBe('');
  });

  it('gets all drafts across chats', () => {
    setDraft('chat-1', 'Draft 1');
    setDraft('chat-2', 'Draft 2');

    const all = getAllDrafts();
    expect(all['chat-1']).toBe('Draft 1');
    expect(all['chat-2']).toBe('Draft 2');
  });
});
