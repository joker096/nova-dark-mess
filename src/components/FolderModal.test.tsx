import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderModal } from './FolderModal';
import { ChatFolder, ChatItem } from '../types/messenger';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const CHATS: ChatItem[] = [
  { id: 'katie', type: 'direct', name: 'Katie', avatar: '', snippet: '', time: '', isChannel: false },
  { id: 'kyiv-channel', type: 'channel', name: 'Kyiv', avatar: '', snippet: '', time: '', isChannel: true },
];

const FOLDERS: ChatFolder[] = [
  { id: 'all', name: 'All', icon: 'folder', chatIds: [], filterType: 'all', isDefault: true },
  { id: 'work', name: 'Work', icon: 'briefcase', chatIds: ['katie'], filterType: 'custom', isDefault: true },
  { id: 'custom', name: 'Crypto', icon: 'star', chatIds: [], filterType: 'custom', isDefault: false },
];

const renderModal = (props: Partial<Parameters<typeof FolderModal>[0]> = {}) =>
  render(
    <FolderModal
      isOpen
      folders={FOLDERS}
      chats={CHATS}
      editingFolder={null}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );

describe('FolderModal - open/close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <FolderModal isOpen={false} folders={[]} chats={[]} editingFolder={null} onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title and subtitle when open', () => {
    renderModal();
    expect(screen.getByText('folders.title')).toBeTruthy();
    expect(screen.getByText('folders.subtitle')).toBeTruthy();
  });

  it('calls onClose when X close button clicked', () => {
    const onClose = vi.fn();
    render(<FolderModal isOpen folders={[]} chats={[]} editingFolder={null} onSave={vi.fn()} onDelete={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('FolderModal - create folder save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error and does not call onSave when name is empty', () => {
    const onSave = vi.fn();
    render(<FolderModal isOpen folders={[]} chats={[]} editingFolder={null} onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'folders.createButton' }));
    expect(screen.getByText('folders.nameError')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with folder object when name provided', () => {
    const onSave = vi.fn();
    render(<FolderModal isOpen folders={[]} chats={CHATS} editingFolder={null} onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText('folders.namePlaceholder');
    fireEvent.change(nameInput, { target: { value: 'Crypto' } });
    fireEvent.click(screen.getByRole('button', { name: 'folders.createButton' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.name).toBe('Crypto');
    expect(saved.filterType).toBe('custom');
    expect(saved.isDefault).toBe(false);
    expect(saved.icon).toBe('folder');
  });
});

describe('FolderModal - manage tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists folders and shows default badge', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'folders.manageTab' }));
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('Crypto')).toBeTruthy();
    expect(screen.getAllByText('folders.defaultBadge').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onDelete for non-default folder', () => {
    const onDelete = vi.fn();
    render(<FolderModal isOpen folders={FOLDERS} chats={[]} editingFolder={null} onSave={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'folders.manageTab' }));
    fireEvent.click(screen.getByTitle('folders.deleteFolder'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('custom');
  });
});
