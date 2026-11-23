/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StickerPickerDrawer } from './StickerPickerDrawer';
import { STICKER_PACKS, MOCK_GIFS } from '../../data/stickers';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const checkout = vi.fn();

vi.mock('../../hooks/usePremium', () => ({
  usePremium: () => ({ premium: false, checkout }),
}));

vi.mock('../LazyMedia', () => ({
  LazyMedia: ({ className }: { className?: string }) => <div className={className} data-testid="lazy-media" />,
}));

// Mock GIF search to return local mock data instead of making real API calls
vi.mock('../../lib/gif/gifSearch', () => ({
  searchGifs: vi.fn(async (query: string) => ({
    gifs: MOCK_GIFS.filter((gif) => gif.title.toLowerCase().includes(query.toLowerCase())),
    pagination: { totalCount: MOCK_GIFS.length, count: MOCK_GIFS.length, offset: 0 },
  })),
  getTrendingGifs: vi.fn(async () => ({
    gifs: MOCK_GIFS,
    pagination: { totalCount: MOCK_GIFS.length, count: MOCK_GIFS.length, offset: 0 },
  })),
  GIF_CATEGORIES: [
    { id: 'trending', name: 'Trending', query: '' },
    { id: 'funny', name: 'Funny', query: 'funny' },
    { id: 'reactions', name: 'Reactions', query: 'reaction' },
  ],
  configureGifApiKeys: vi.fn(),
  getConfiguredGifApis: vi.fn(() => []),
}));

const firstSticker = STICKER_PACKS[0].stickers[0];
const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSelectEmoji: vi.fn(),
  onSendSticker: vi.fn(),
  onSendGif: vi.fn(),
};

function stickerButton(name: string): HTMLButtonElement {
  const button = document.querySelector(`button[title^="${name}"]`);
  if (!button) throw new Error(`Sticker button "${name}" not found`);
  return button as HTMLButtonElement;
}

describe('StickerPickerDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<StickerPickerDrawer {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('sticker-drawer')).toBeNull();
  });

  it('sends a sticker on tap by default', () => {
    const onSendSticker = vi.fn();
    const onSelectStickerText = vi.fn();
    render(
      <StickerPickerDrawer {...defaultProps} onSendSticker={onSendSticker} onSelectStickerText={onSelectStickerText} />,
    );

    fireEvent.click(stickerButton(firstSticker.name));

    expect(onSendSticker).toHaveBeenCalledWith(expect.objectContaining({ id: firstSticker.id }));
    expect(onSelectStickerText).not.toHaveBeenCalled();
  });

  it('inserts the sticker into the composer when insert mode is enabled', () => {
    const onSendSticker = vi.fn();
    const onSelectStickerText = vi.fn();
    render(
      <StickerPickerDrawer
        {...defaultProps}
        insertInsteadOfSend
        onSendSticker={onSendSticker}
        onSelectStickerText={onSelectStickerText}
      />,
    );

    fireEvent.click(stickerButton(firstSticker.name));

    expect(onSelectStickerText).toHaveBeenCalledWith(expect.objectContaining({ id: firstSticker.id }));
    expect(onSendSticker).not.toHaveBeenCalled();
  });

  it('shows the view settings and notifies the parent about size changes', () => {
    const onPreferencesChange = vi.fn();
    render(<StickerPickerDrawer {...defaultProps} onPreferencesChange={onPreferencesChange} />);

    const settings = screen.getByTestId('sticker-view-settings');
    expect(settings).toBeTruthy();

    fireEvent.click(screen.getByTitle('Sticker size L'));

    expect(onPreferencesChange).toHaveBeenCalledWith({ stickerSize: 'lg', insertInsteadOfSend: false });
    const stored = JSON.parse(localStorage.getItem('nova_media_preferences') ?? '{}');
    expect(stored.stickerSize).toBe('lg');
  });

  it('toggles insert mode from the settings row', () => {
    const onPreferencesChange = vi.fn();
    render(<StickerPickerDrawer {...defaultProps} onPreferencesChange={onPreferencesChange} />);

    fireEvent.click(screen.getByTitle('Tap a sticker to put it in the text field instead of sending it'));

    expect(onPreferencesChange).toHaveBeenCalledWith({ stickerSize: 'md', insertInsteadOfSend: true });
  });

  it('opens the premium sheet from the premium filter', () => {
    render(<StickerPickerDrawer {...defaultProps} />);

    fireEvent.click(screen.getByText('Premium'));

    // Free user: the unlock CTA is shown instead of premium-only packs.
    expect(screen.getByText('Unlock all premium stickers')).toBeTruthy();
    expect(checkout).not.toHaveBeenCalled();
  });

  it('filters GIFs by search query', async () => {
    render(<StickerPickerDrawer {...defaultProps} />);

    fireEvent.click(screen.getAllByText('GIFs')[0]);
    fireEvent.change(screen.getByPlaceholderText('Search GIFs...'), { target: { value: MOCK_GIFS[0].title } });

    await waitFor(() => {
      expect(screen.getAllByText(MOCK_GIFS[0].title).length).toBeGreaterThan(0);
    });
    const otherGif = MOCK_GIFS.find((gif) => gif.title !== MOCK_GIFS[0].title)!;
    expect(screen.queryAllByText(otherGif.title)).toHaveLength(0);
  });
});
