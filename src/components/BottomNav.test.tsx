/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BottomNav } from './BottomNav';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const renderNav = (activeTab: 'chats' | 'contacts' = 'chats') =>
  render(<BottomNav activeTab={activeTab} onTabChange={vi.fn()} onNewChat={vi.fn()} />);

// The FAB button's container carries the anchoring classes and the side marker.
const fabContainer = () =>
  screen.getByRole('button', { name: 'chats.fabLabel' }).parentElement as HTMLElement;

describe('BottomNav - folder switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows the folder chips above the tabs instead of the chat list', () => {
    renderNav();
    const strip = screen.getByTestId('nav-folders');
    expect(strip.className).toContain('no-scrollbar');
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Work' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeTruthy();
    // Channels have their own section; the chat folders do not duplicate it.
    expect(screen.queryByRole('button', { name: 'Channels' })).toBeNull();
  });

  it('hides the folder strip outside the chats tab and drops the FAB back down', () => {
    const { unmount } = renderNav();
    expect(fabContainer().style.bottom).toBe('calc(7.75rem + var(--nova-safe-bottom, 0px))');
    unmount();

    renderNav('contacts');
    expect(screen.queryByTestId('nav-folders')).toBeNull();
    expect(fabContainer().style.bottom).toBe('');
  });

  it('selects and persists a folder, notifying the chat list', () => {
    const onSelect = vi.fn();
    window.addEventListener('nova:folder-selected', onSelect);
    renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'Work' }));

    expect(localStorage.getItem('nova_active_folder_v1')).toBe('work');
    expect(screen.getByRole('button', { name: 'Work' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0][0] as CustomEvent).detail).toBe('work');
    window.removeEventListener('nova:folder-selected', onSelect);
  });

  it('shows unread badges on the folder chips', () => {
    renderNav();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('nova:folder-unread', {
          detail: { all: 16, personal: 4, work: 3, favorites: 1, archive: 0 },
        }),
      );
    });

    expect(screen.getByTestId('folder-unread-all').textContent).toBe('16');
    expect(screen.getByTestId('folder-unread-work').textContent).toBe('3');
    expect(screen.queryByTestId('folder-unread-archive')).toBeNull();
    expect(screen.getByRole('button', { name: 'Work: 3 chats.unreadCount' })).toBeTruthy();
  });

  it('caps very large unread totals', () => {
    renderNav();
    act(() => {
      window.dispatchEvent(
        new CustomEvent('nova:folder-unread', { detail: { all: 250 } }),
      );
    });
    expect(screen.getByTestId('folder-unread-all').textContent).toBe('99+');
  });

  it('shows edge indicators only while the folder strip can scroll', () => {
    renderNav();
    const strip = screen.getByTestId('nav-folders');
    expect(screen.queryByTestId('nav-folders-edge-start')).toBeNull();
    expect(screen.queryByTestId('nav-folders-edge-end')).toBeNull();

    Object.defineProperty(strip, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(strip, 'clientWidth', { value: 320, configurable: true });
    Object.defineProperty(strip, 'scrollLeft', { value: 0, configurable: true, writable: true });
    act(() => window.dispatchEvent(new Event('resize')));

    expect(screen.queryByTestId('nav-folders-edge-start')).toBeNull();
    expect(screen.getByTestId('nav-folders-edge-end')).toBeTruthy();

    strip.scrollLeft = 200;
    act(() => strip.dispatchEvent(new Event('scroll')));
    expect(screen.getByTestId('nav-folders-edge-start')).toBeTruthy();
    expect(screen.getByTestId('nav-folders-edge-end')).toBeTruthy();

    strip.scrollLeft = 280;
    act(() => strip.dispatchEvent(new Event('scroll')));
    expect(screen.getByTestId('nav-folders-edge-start')).toBeTruthy();
    expect(screen.queryByTestId('nav-folders-edge-end')).toBeNull();
  });

  it('asks the chat list to open the folder manager', () => {
    const onOpenManager = vi.fn();
    window.addEventListener('nova:open-folder-manager', onOpenManager);
    renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'foldersObj.addAnother' }));

    expect(onOpenManager).toHaveBeenCalledTimes(1);
    window.removeEventListener('nova:open-folder-manager', onOpenManager);
  });
});

describe('BottomNav - one-handed FAB side', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('anchors the FAB to the right thumb zone by default', () => {
    renderNav();
    const container = fabContainer();
    expect(container.getAttribute('data-fab-side')).toBe('right');
    expect(container.className).toContain('right-4');
    expect(container.className).toContain('safe-bottom-fab');
  });

  it('honours a stored left-handed preference', () => {
    localStorage.setItem('nova_fab_side', 'left');
    renderNav();
    const container = fabContainer();
    expect(container.getAttribute('data-fab-side')).toBe('left');
    expect(container.className).toContain('left-4');
    expect(container.className).not.toContain('right-4');
  });

  it('moves the FAB and persists the choice from the quick-actions menu', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'chats.fabLabel' }));
    fireEvent.click(screen.getByRole('button', { name: 'chats.fabOtherSide' }));

    expect(localStorage.getItem('nova_fab_side')).toBe('left');
    expect(fabContainer().className).toContain('left-4');
  });

  it('follows a change made elsewhere in the same tab', () => {
    renderNav();
    act(() => {
      window.dispatchEvent(new CustomEvent('nova:fab-side', { detail: 'left' }));
    });
    expect(fabContainer().getAttribute('data-fab-side')).toBe('left');
  });
});
