import { useEffect, useState } from 'react';
import type { ChatFolder } from '../../types/messenger';

export const FOLDERS_STORAGE_KEY = 'nova_messenger_chat_folders';
export const ACTIVE_FOLDER_KEY = 'nova_active_folder_v1';

/** A folder selection made in the bottom navigation. */
export const FOLDER_SELECTED_EVENT = 'nova:folder-selected';
/** The folder list itself was created/renamed/deleted. */
export const FOLDERS_CHANGED_EVENT = 'nova:folders-changed';
/** Ask the chat list to open the folder manager modal. */
export const OPEN_FOLDER_MANAGER_EVENT = 'nova:open-folder-manager';
/** Per-folder unread totals published by the chat list. */
export const FOLDER_UNREAD_EVENT = 'nova:folder-unread';

export type FolderUnreadCounts = Record<string, number>;

export function publishFolderUnreadCounts(counts: FolderUnreadCounts) {
  window.dispatchEvent(new CustomEvent<FolderUnreadCounts>(FOLDER_UNREAD_EVENT, { detail: counts }));
}

export const DEFAULT_FOLDERS: ChatFolder[] = [
  {
    id: 'all',
    name: 'All',
    filterType: 'all',
    chatIds: [],
    isDefault: true,
  },
  {
    id: 'personal',
    name: 'Personal',
    filterType: 'direct',
    chatIds: ['katie', 'kurt', 'stacy', 'daniel'],
    icon: 'user',
    isDefault: true,
  },
  {
    id: 'work',
    name: 'Work',
    filterType: 'custom',
    chatIds: ['kurt', 'daniel'],
    icon: 'briefcase',
    isDefault: true,
  },
  // Channels are their own section with their own layout, so the chat list
  // keeps them under "All" instead of offering a redundant tab.
  {
    id: 'favorites',
    name: 'Favorites',
    filterType: 'custom',
    chatIds: ['katie', 'thailand'],
    icon: 'star',
    isDefault: true,
  },
  {
    id: 'archive',
    name: 'Archive',
    filterType: 'custom',
    chatIds: [],
    icon: 'archive',
    isDefault: true,
  },
];

export function loadFolders(): ChatFolder[] {
  try {
    const saved = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as ChatFolder[];
    }
  } catch {
    /* corrupt storage falls back to defaults */
  }
  return DEFAULT_FOLDERS;
}

export function loadActiveFolderId(): string {
  try {
    return localStorage.getItem(ACTIVE_FOLDER_KEY) || 'all';
  } catch {
    return 'all';
  }
}

export function selectFolder(id: string) {
  try {
    localStorage.setItem(ACTIVE_FOLDER_KEY, id);
  } catch {
    /* the in-memory event still switches the list */
  }
  window.dispatchEvent(new CustomEvent<string>(FOLDER_SELECTED_EVENT, { detail: id }));
}

export function notifyFoldersChanged() {
  window.dispatchEvent(new Event(FOLDERS_CHANGED_EVENT));
}

export function requestFolderManager() {
  window.dispatchEvent(new Event(OPEN_FOLDER_MANAGER_EVENT));
}

/**
 * Folder list + active folder, kept in sync across the chat list and the
 * bottom navigation (they are separate mounted trees).
 */
export function useChatFolders() {
  const [folders, setFolders] = useState<ChatFolder[]>(loadFolders);
  const [activeFolderId, setActiveFolderId] = useState<string>(loadActiveFolderId);
  const [unreadByFolder, setUnreadByFolder] = useState<FolderUnreadCounts>({});

  useEffect(() => {
    const syncFolders = () => setFolders(loadFolders());
    const syncSelection = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      setActiveFolderId(typeof id === 'string' ? id : loadActiveFolderId());
    };
    const syncStorage = () => {
      syncFolders();
      setActiveFolderId(loadActiveFolderId());
    };
    const syncUnread = (event: Event) => {
      const detail = (event as CustomEvent<FolderUnreadCounts>).detail;
      if (detail && typeof detail === 'object') setUnreadByFolder(detail);
    };

    window.addEventListener(FOLDERS_CHANGED_EVENT, syncFolders);
    window.addEventListener(FOLDER_SELECTED_EVENT, syncSelection);
    window.addEventListener(FOLDER_UNREAD_EVENT, syncUnread);
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener(FOLDERS_CHANGED_EVENT, syncFolders);
      window.removeEventListener(FOLDER_SELECTED_EVENT, syncSelection);
      window.removeEventListener(FOLDER_UNREAD_EVENT, syncUnread);
      window.removeEventListener('storage', syncStorage);
    };
  }, []);

  return { folders, activeFolderId, unreadByFolder, selectFolder };
}
