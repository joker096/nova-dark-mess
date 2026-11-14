/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChannelComment, ChannelPost } from '../types/messenger';
import { PostCommentsSheet } from './PostCommentsSheet';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === 'channel.commentsCount') return `${options?.count ?? 0} comments`;
      if (key === 'channel.noComments') return 'No comments yet';
      if (key === 'channel.commentPlaceholder') return 'Write a comment...';
      if (key === 'channel.sendComment') return 'Send comment';
      if (key === 'common.close') return 'Close';
      return key;
    },
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const POST: ChannelPost = {
  id: 'post-1',
  time: '10:30',
  dateKey: 10,
  title: 'Morning digest',
  text: 'Three things happened in the city today.',
  commentsCount: 1,
  reactions: [],
};

const COMMENTS: ChannelComment[] = [
  {
    id: 'c1',
    postId: 'post-1',
    authorName: 'Katie',
    text: 'Thanks for the recap!',
    createdAt: Date.UTC(2026, 10, 10, 8, 0),
  },
];

describe('PostCommentsSheet', () => {
  it('lists the comments and counts them in the title', () => {
    render(
      <PostCommentsSheet
        post={POST}
        comments={COMMENTS}
        draft=""
        onDraftChange={vi.fn()}
        onAddComment={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('1 comments')).toBeInTheDocument();
    expect(screen.getByText('Thanks for the recap!')).toBeInTheDocument();
    expect(screen.getByText('Katie')).toBeInTheDocument();
    // The quoted post keeps context visible next to the thread.
    expect(screen.getByText('Morning digest')).toBeInTheDocument();
  });

  it('shows the empty state for a post without comments', () => {
    render(
      <PostCommentsSheet
        post={POST}
        comments={[]}
        draft=""
        onDraftChange={vi.fn()}
        onAddComment={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('No comments yet')).toBeInTheDocument();
  });

  it('sends the draft on Enter and clears it', () => {
    const onAddComment = vi.fn();
    const onDraftChange = vi.fn();
    render(
      <PostCommentsSheet
        post={POST}
        comments={COMMENTS}
        draft="Nice one"
        onDraftChange={onDraftChange}
        onAddComment={onAddComment}
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Write a comment...'), { key: 'Enter' });

    expect(onAddComment).toHaveBeenCalledWith('Nice one');
    expect(onDraftChange).toHaveBeenCalledWith('');
  });

  it('keeps an empty draft from being sent', () => {
    const onAddComment = vi.fn();
    render(
      <PostCommentsSheet
        post={POST}
        comments={[]}
        draft="   "
        onDraftChange={vi.fn()}
        onAddComment={onAddComment}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send comment' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Send comment' }));
    expect(onAddComment).not.toHaveBeenCalled();
  });

  it('closes on Escape, on the close button and on the backdrop', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <PostCommentsSheet
        post={POST}
        comments={COMMENTS}
        draft=""
        onDraftChange={vi.fn()}
        onAddComment={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <PostCommentsSheet
        post={POST}
        comments={COMMENTS}
        draft=""
        onDraftChange={vi.fn()}
        onAddComment={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('moves focus into the sheet and back to the trigger on unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <PostCommentsSheet
        post={POST}
        comments={COMMENTS}
        draft=""
        onDraftChange={vi.fn()}
        onAddComment={vi.fn()}
        onClose={vi.fn()}
        returnFocusTo={trigger}
      />,
    );

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
