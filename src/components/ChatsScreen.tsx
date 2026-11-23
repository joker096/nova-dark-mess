import React, { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { LazyMedia } from './LazyMedia';
import { useWheelScroll } from '../lib/ui/useWheelScroll';
import { NovaContextMenu } from '../lib/ui/NovaContextMenu';
import { useAccount } from '../hooks/useAccount';
import {
  Search,
  Plus,
  Users,
  MessageSquare,
  Settings,
  Pin,
  X,
  FolderPlus,
  Folder,
  Clock,
  MapPin,
  Megaphone,
  UserRound,
  Sparkles,
  Archive,
  Cloud,
  UserPlus,
  Upload,
  Hand,
  Trash2,
  VolumeX,
  Check,
  BellOff,
} from 'lucide-react';
import { getAllDrafts, subscribeDraftChanges } from '../lib/messaging/drafts';
import { readFabSide, saveFabSide, FAB_SIDE_EVENT, isFabSide, type FabSide } from '../lib/ui/appearance';
import {
  MOCK_STORIES,
  MOCK_CHATS,
  CONVERSATION_HISTORIES,
  registerCreatedGroups,
  loadCreatedGroups,
  saveCreatedGroups,
  loadCreatedGroupHistories,
  saveCreatedGroupHistories,
} from '../data/mockMessengerData';
import { ChatItem, Story, MessageSearchResult, ChatFolder, ChannelInfo, StoryDraft } from '../types/messenger';
import { parseVCF, ParsedContact } from '../lib/contacts/vcfParser';
import { FolderModal } from './FolderModal';
import { CommunitiesPanel } from './CommunitiesPanel';
import { StoryComposerModal } from './StoryComposerModal';
import { StoryViewer } from './StoryViewer';
import { getStoryFeed, isStoryScheduled } from '../lib/social/store';
import {
  getGroupMembership,
  getPendingJoinRequests,
  type GroupJoinRequest,
  type GroupMembership,
} from '../lib/social/groupJoinRequests';
import { isGroupAdmin, loadGroupRoles } from '../lib/social/groupRoles';
import { decideJoinRequest } from '../lib/social/joinDecisions';
import { JOIN_REQUESTS_CHANGED_EVENT } from '../lib/social/joinRequestRelay';
import { buildGlobalSearchIndex } from '../lib/search/buildSearchIndex';
import { searchGlobal } from '../lib/search/globalSearch';
import { useLanguage } from '../context/LanguageContext';
import { muteContact, getNotificationPrefs } from '../lib/notifications/notificationPrefs';
import { CHAT_READ_EVENT, loadReadChats, markChatRead } from '../lib/messaging/unread';

interface ChatsScreenProps {
  onSelectChat: (chatId: string) => void;
  onOpenChannel: (channelId?: string) => void;

  onOpenContacts?: () => void;
  onOpenCalls?: () => void;
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
  onOpenPremium?: () => void;
  onOpenAnonymous?: () => void;
  onOpenFolders?: () => void;
  activeChatId?: string;
  activeNavTab?: 'chats' | 'channel' | 'folders' | 'settings';
  stories?: Story[];
  channels?: ChannelInfo[];
  localFingerprint?: string;
  now?: number;
  onCreateStory?: (draft: StoryDraft) => void;
  onDeleteStory?: (storyId: string) => void;
  onViewStory?: (storyId: string) => void;
  onToggleStoryReaction?: (storyId: string, emoji: string) => void;
  getBotSession?: () => { isBot: (id: string) => boolean };
}

const FOLDERS_STORAGE_KEY = 'nova_messenger_chat_folders';
const CHAT_SEARCH_CHIPS = ['Katie', "Harry's", 'Sunday', 'Thailand', 'dinner', 'photos', 'flight'];

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

registerCreatedGroups();

export const ChatsScreen = forwardRef<{ openFolderModal: () => void }, ChatsScreenProps>((props, ref) => {
  const {
    onSelectChat,
    onOpenChannel,

    onOpenProfile,
    onOpenSettings,
    onOpenPremium,
    onOpenAnonymous,
    onOpenFolders,
    activeChatId,
    activeNavTab,
    stories = MOCK_STORIES,
    channels = [],
    localFingerprint,
    now = Date.now(),
    onCreateStory,
    onDeleteStory,
    onViewStory,
    onToggleStoryReaction,
    getBotSession,
  } = props;
  const { t } = useLanguage();
  const { account } = useAccount();
  const isBotChat = (id: string) => getBotSession?.().isBot(id);
  const [readChats, setReadChats] = useState(loadReadChats);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupVersion, setGroupVersion] = useState(0);

  // Message drafts auto-synced across views for one-handed convenience
  const [drafts, setDrafts] = useState<Record<string, string>>(() => getAllDrafts());
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  // One-handed use: left-handed users reach the thumb zone on the left edge.
  const [fabSide, setFabSide] = useState<FabSide>(() => readFabSide());
  const toggleFabSide = () => {
    const next: FabSide = fabSide === 'right' ? 'left' : 'right';
    setFabSide(next);
    saveFabSide(next);
  };
  // Settings → Appearance can change the side too; mirror it live.
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setFabSide(isFabSide(detail) ? detail : readFabSide());
    };
    const syncStorage = () => setFabSide(readFabSide());
    window.addEventListener(FAB_SIDE_EVENT, sync);
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener(FAB_SIDE_EVENT, sync);
      window.removeEventListener('storage', syncStorage);
    };
  }, []);

  useEffect(() => {
    return subscribeDraftChanges(() => {
      setDrafts(getAllDrafts());
    });
  }, []);


  // Folders State with localStorage persistence
  const [folders, setFolders] = useState<ChatFolder[]>(() => {
    try {
      const saved = localStorage.getItem(FOLDERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      void 0;
    }
    return DEFAULT_FOLDERS;
  });

  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [archivedChatIds, setArchivedChatIds] = useState<Set<string>>(new Set());
  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(() => {
    return new Set(MOCK_CHATS.filter((c) => c.isPinned).map((c) => c.id));
  });

  // User-imported contacts (VCF import)
  const [userContacts, setUserContacts] = useState<ParsedContact[]>([]);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ChatFolder | null>(null);

  useImperativeHandle(ref, () => ({
    openFolderModal: () => {
      setEditingFolder(null);
      setIsFolderModalOpen(true);
    },
  }));
  const [folderToast, setFolderToast] = useState<string | null>(null);

  // Swipe actions on chat rows (archive, pin, mute, delete)
  const [swipingChatId, setSwipingChatId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeStartXRef = useRef(0);
  const isSwipingRef = useRef(false);
  const swipeThreshold = 80;

  const resetSwipe = useCallback(() => {
    setSwipingChatId(null);
    setSwipeOffset(0);
    isSwipingRef.current = false;
  }, []);

  const handleTouchStart = (e: React.TouchEvent, chatId: string) => {
    if (e.touches.length !== 1) return;
    swipeStartXRef.current = e.touches[0].clientX;
    setSwipingChatId(chatId);
    isSwipingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwipingRef.current || e.touches.length !== 1) return;
    const dx = swipeStartXRef.current - e.touches[0].clientX;
    if (dx > 0) {
      setSwipeOffset(Math.min(dx, 320));
    }
  };

  const handleTouchEnd = (chatId: string, isChannel?: boolean) => {
    if (!isSwipingRef.current) return;
    if (swipeOffset > swipeThreshold) {
      handleArchiveToggle(chatId);
    }
    resetSwipe();
  };

  // Long-press context menu
  const [contextMenuChatId, setContextMenuChatId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (e: React.TouchEvent, chatId: string) => {
    const touch = e.touches[0];
    longPressTimerRef.current = setTimeout(() => {
      setContextMenuChatId(chatId);
      setContextMenuPosition({ x: touch.clientX, y: touch.clientY });
      // Haptic feedback
      if ('vibrate' in navigator) navigator.vibrate(10);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const closeContextMenu = () => {
    setContextMenuChatId(null);
    setContextMenuPosition(null);
    cancelLongPress();
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'chats' | 'messages'>('all');
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  const [isStoryComposerOpen, setIsStoryComposerOpen] = useState(false);
  const storyFeed = useMemo(() => getStoryFeed(stories, now), [stories, now]);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const folderTabsRef = useWheelScroll();
  const quickSearchChipsRef = useWheelScroll();
  const storiesRef = useWheelScroll();

  // Global shortcut: Cmd+K / Ctrl+K jumps to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const triggerFolderToast = (msg: string) => {
    setFolderToast(msg);
    setTimeout(() => setFolderToast(null), 2000);
  };

  const handleSaveFolder = (folderToSave: ChatFolder) => {
    setFolders((prev) => {
      const exists = prev.some((f) => f.id === folderToSave.id);
      const updated = exists
        ? prev.map((f) => (f.id === folderToSave.id ? folderToSave : f))
        : [...prev, folderToSave];
      try {
        localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
      void 0;
    }
      return updated;
    });
    setActiveFolderId(folderToSave.id);
    triggerFolderToast(`Folder "${folderToSave.name}" saved`);
  };

  const handleDeleteFolder = (folderId: string) => {
    setFolders((prev) => {
      const updated = prev.filter((f) => f.id !== folderId);
      try {
        localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
      void 0;
    }
      return updated;
    });
    if (activeFolderId === folderId) {
      setActiveFolderId('all');
    }
    triggerFolderToast('Folder deleted');
  };

  // Join requests show up in the list, so an admin sees a pending request
  // without opening every group. Relayed requests arrive while no chat is open.
  const [joinVersion, setJoinVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setJoinVersion((version) => version + 1);
    window.addEventListener(JOIN_REQUESTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(JOIN_REQUESTS_CHANGED_EVENT, onChange);
  }, []);

  const joinIndicators = useMemo(() => {
    const map: Record<
      string,
      { pending: number; requests: GroupJoinRequest[]; membership: GroupMembership | null }
    > = {};
    for (const chat of MOCK_CHATS) {
      if (chat.type !== 'group') continue;
      const membership = getGroupMembership(chat.id);
      const isAdmin =
        !!localFingerprint && isGroupAdmin(loadGroupRoles(chat.id), localFingerprint);
      const requests = isAdmin
        ? getPendingJoinRequests(chat.id).filter(
            (request) => request.fingerprint !== localFingerprint,
          )
        : [];
      map[chat.id] = { pending: requests.length, requests, membership };
    }
    return map;
    // joinVersion refreshes the badges when the relay delivers a request.
  }, [joinVersion, groupVersion, activeChatId, localFingerprint]);

  useEffect(() => {
    const onReadChange = () => setReadChats(loadReadChats());
    window.addEventListener(CHAT_READ_EVENT, onReadChange);
    return () => window.removeEventListener(CHAT_READ_EVENT, onReadChange);
  }, []);

  const handleJoinDecision = (chatId: string, fingerprint: string, approved: boolean) => {
    const roles = decideJoinRequest({
      groupId: chatId,
      fingerprint,
      localFingerprint: localFingerprint ?? '',
      approved,
    });
    if (!roles) return;
    setGroupVersion((version) => version + 1);
    triggerFolderToast(
      approved ? t('chat.joinRequestApproved') : t('chat.joinRequestDeclined'),
    );
  };

  // Active folder object
  const currentFolder = useMemo(() => {
    return folders.find((f) => f.id === activeFolderId) || folders[0];
  }, [folders, activeFolderId]);

  // Filter chats by active folder when not searching
  const categoryChats = useMemo(() => {
    if (!currentFolder) return MOCK_CHATS;
    let result: ChatItem[];
    if (currentFolder.id === 'all' || currentFolder.filterType === 'all') {
      result = MOCK_CHATS.filter((c) => !archivedChatIds.has(c.id));
    } else if (currentFolder.id === 'archive') {
      result = MOCK_CHATS.filter((c) => archivedChatIds.has(c.id));
    } else if (currentFolder.filterType === 'direct') {
      result = MOCK_CHATS.filter((c) => c.type === 'direct');
    } else if (currentFolder.filterType === 'channels') {
      result = MOCK_CHATS.filter((c) => c.isChannel || c.type === 'channel');
    } else if (currentFolder.filterType === 'groups') {
      result = MOCK_CHATS.filter((c) => c.type === 'group');
    } else {
      result = MOCK_CHATS.filter((c) => currentFolder.chatIds.includes(c.id));
    }

    // Append user-imported contacts as direct chats (only in 'all' folder)
    if (currentFolder.id === 'all' || currentFolder.filterType === 'all') {
      const contactChats: ChatItem[] = userContacts.map((c) => ({
        id: `contact-${c.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: c.name,
        avatar: c.avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=random`,
        snippet: c.phone ?? c.email ?? 'Imported contact',
        time: '',
        unreadCount: 0,
        isPinned: false,
        type: 'direct',
        category: 'Imported',
      }));
      result = [...result, ...contactChats];
    }

    // Sort pinned chats to the top
    return result.sort((a, b) => {
      const aPinned = pinnedChatIds.has(a.id);
      const bPinned = pinnedChatIds.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [currentFolder, groupVersion, archivedChatIds, pinnedChatIds, userContacts]);

  // Calculate badge (unread or count) for each folder tab
  const getFolderBadge = (folder: ChatFolder) => {
    if (folder.id === 'all') return null;
    let matchedList: ChatItem[];
    if (folder.filterType === 'direct') {
      matchedList = MOCK_CHATS.filter((c) => c.type === 'direct');
    } else if (folder.filterType === 'channels') {
      matchedList = MOCK_CHATS.filter((c) => c.isChannel || c.type === 'channel');
    } else if (folder.filterType === 'groups') {
      matchedList = MOCK_CHATS.filter((c) => c.type === 'group');
    } else {
      matchedList = MOCK_CHATS.filter((c) => folder.chatIds.includes(c.id));
    }
    const totalUnread = matchedList.reduce(
      (acc, c) => acc + (readChats.has(c.id) ? 0 : c.unreadCount || 0),
      0,
    );
    if (totalUnread > 0) return `${totalUnread}`;
    if (matchedList.length > 0 && folder.filterType === 'custom') return `${matchedList.length}`;
    return null;
  };

  // Search through chats (by contact name OR message preview / conversation history)
  const matchedChats = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return MOCK_CHATS.filter((chat) => {
      // 1. Matches contact / channel / group name
      const nameMatch = chat.name.toLowerCase().includes(query);
      // 2. Matches message preview snippet
      const snippetMatch = chat.snippet.toLowerCase().includes(query);
      // 3. Matches any message in conversation history
      const historyMessages = CONVERSATION_HISTORIES[chat.id] || [];
      const historyMatch = historyMessages.some((m) =>
        m.text?.toLowerCase().includes(query)
      );
      return nameMatch || snippetMatch || historyMatch;
    });
  }, [searchQuery, groupVersion]);

  // Local search index across all conversation history (text, documents,
  // polls, locations, media captions). No server-side index is involved.
  const searchIndex = useMemo(
    () => buildGlobalSearchIndex({ chats: MOCK_CHATS, histories: CONVERSATION_HISTORIES }),
    [groupVersion],
  );

  // Search through deep conversation history across all chats
  const matchedMessages = useMemo<MessageSearchResult[]>(() => {
    if (!searchQuery.trim()) return [];

    return searchGlobal(searchIndex, searchQuery, { kinds: ['message'], limit: 150 }).map((result) => {
      const chat = MOCK_CHATS.find((c) => c.id === result.chatId);
      const messagePrefix = `chat:${result.chatId}:`;
      const messageId = result.id.startsWith(messagePrefix)
        ? result.id.slice(messagePrefix.length)
        : result.id;
      const msg = CONVERSATION_HISTORIES[result.chatId]?.find((m) => m.id === messageId);

      return {
        chatId: result.chatId,
        chatName: result.chatName,
        chatAvatar: result.chatAvatar ?? chat?.avatar ?? '',
        isChannel: chat?.isChannel,
        messageId,
        text: msg?.text ?? result.text,
        time: result.time ?? msg?.time ?? '',
        senderName: result.senderName ?? result.chatName,
      };
    });
  }, [searchQuery, searchIndex]);

  const totalResults = matchedChats.length + matchedMessages.length;
  const isSearching = searchQuery.trim().length > 0;

  const mobileNavItems = [
    {
      key: 'chats',
      label: t('chats.title'),
      icon: MessageSquare,
      active: activeNavTab === 'chats',
      onClick: () => setActiveFolderId('all'),
    },
    {
      key: 'channel',
      label: t('channels'),
      icon: Megaphone,
      active: activeNavTab === 'channel',
      onClick: () => onOpenChannel?.(),
    },
    {
      key: 'folders',
      label: t('folders'),
      icon: Folder,
      active: activeNavTab === 'folders',
      onClick: onOpenFolders
        ? onOpenFolders
        : () => {
            setEditingFolder(null);
            setIsFolderModalOpen(true);
          },
    },
    {
      key: 'settings',
      label: t('settings.title'),
      icon: Settings,
      active: activeNavTab === 'settings',
      onClick: onOpenSettings,
    },
  ];

  const handleChatClick = (chatId: string, isChannel?: boolean) => {
    markChatRead(chatId);
    if (isChannel || chatId === 'kyiv-channel') {
      onOpenChannel();
    } else {
      onSelectChat(chatId);
    }
  };

  const handleArchiveToggle = (chatId: string) => {
    setArchivedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
        // If viewing archive folder, switch back to 'all'
        if (activeFolderId === 'archive') setActiveFolderId('all');
      } else {
        next.add(chatId);
      }
      return next;
    });
  };

  const handlePinToggle = (chatId: string) => {
    setPinnedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  };

  const handleMuteToggle = (chatId: string) => {
    // Check if currently muted
    const prefs = getNotificationPrefs();
    const isMuted = prefs.muteUntil[chatId] && prefs.muteUntil[chatId] > Date.now();
    
    if (isMuted) {
      // Unmute
      muteContact(chatId, 0);
      triggerFolderToast('Chat unmuted');
    } else {
      // Mute for 1 hour (default), could show a modal for duration selection
      muteContact(chatId, 60 * 60 * 1000);
      triggerFolderToast('Chat muted for 1 hour');
    }
  };

  const handleDeleteChat = (chatId: string) => {
    // Remove from conversation history
    delete CONVERSATION_HISTORIES[chatId];
    // Also archive it
    setArchivedChatIds((prev) => {
      const next = new Set(prev);
      next.add(chatId);
      return next;
    });
    triggerFolderToast('Chat deleted and archived');
  };

  // Select Mode (Bulk Actions)
  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedChatIds(new Set());
      }
      return next;
    });
  };

  const toggleChatSelection = (chatId: string) => {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  };

  const selectAllChats = () => {
    const chatIds = categoryChats.map((chat) => chat.id);
    setSelectedChatIds(new Set(chatIds));
  };

  const clearSelection = () => {
    setSelectedChatIds(new Set());
  };

  const bulkArchive = () => {
    selectedChatIds.forEach((chatId) => {
      setArchivedChatIds((prev) => {
        const next = new Set(prev);
        next.add(chatId);
        return next;
      });
    });
    setSelectMode(false);
    setSelectedChatIds(new Set());
    triggerFolderToast(`${selectedChatIds.size} chats archived`);
  };

  const bulkDelete = () => {
    selectedChatIds.forEach((chatId) => {
      delete CONVERSATION_HISTORIES[chatId];
      setArchivedChatIds((prev) => {
        const next = new Set(prev);
        next.add(chatId);
        return next;
      });
    });
    setSelectMode(false);
    setSelectedChatIds(new Set());
    triggerFolderToast(`${selectedChatIds.size} chats deleted and archived`);
  };

  const bulkMute = () => {
    selectedChatIds.forEach((chatId) => {
      muteContact(chatId, 60 * 60 * 1000);
    });
    setSelectMode(false);
    setSelectedChatIds(new Set());
    triggerFolderToast(`${selectedChatIds.size} chats muted for 1 hour`);
  };

  const bulkPin = () => {
    selectedChatIds.forEach((chatId) => {
      setPinnedChatIds((prev) => {
        const next = new Set(prev);
        next.add(chatId);
        return next;
      });
    });
    setSelectMode(false);
    setSelectedChatIds(new Set());
    triggerFolderToast(`${selectedChatIds.size} chats pinned`);
  };

  const handleImportVCF = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { contacts, errors } = parseVCF(text);
      if (contacts.length > 0) {
        setUserContacts((prev) => {
          const existingNames = new Set(prev.map((c) => c.name));
          const newContacts = contacts.filter((c) => !existingNames.has(c.name));
          return [...prev, ...newContacts];
        });
      }
      if (errors.length > 0) {
        triggerFolderToast(`VCF: ${errors.length} error(s) skipped`);
      }
      if (contacts.length > 0) {
        triggerFolderToast(`Imported ${contacts.length} contact(s)`);
      }
    };
    reader.readAsText(file);
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span
              key={i}
              className="text-[var(--nova-accent-color)] font-semibold bg-[var(--nova-accent-color)]/20 px-1 py-0.2 rounded"
            >
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-primary)] relative select-none">
      {/* Toast Notification */}
      {folderToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-surface)]/[0.95] border border-[var(--nova-accent-color)]/50 text-[var(--text-primary)] text-xs px-3.5 py-1.5 rounded-full shadow-[var(--shadow-2)] backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <FolderPlus className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
          <span>{folderToast}</span>
        </div>
      )}

      {/* Top Header: Account nickname */}
      <div className="pt-3 px-4 sm:px-5 pb-2 flex items-center justify-between shrink-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenProfile}
            className="w-10 h-10 rounded-full overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-surface-2)] relative cursor-pointer active:scale-95 transition"
            aria-label={t('profile.title')}
            title={t('profile.title')}
          >
            {account.avatar ? (
              <LazyMedia
                src={account.avatar}
                alt={account.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[var(--nova-accent-color)] flex items-center justify-center text-xs font-bold text-[var(--text-on-accent)]">
                {account.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
              {account.nickname}
            </h1>
          </div>
        </div>

        {/* Action icons on right */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {onOpenAnonymous && (
            <button
              onClick={onOpenAnonymous}
              className="w-9 h-9 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] hover:text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] transition cursor-pointer active:scale-90 shadow-md"
              aria-label="Contacts"
              title="Contacts"
            >
              <UserRound className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setNewChatModalOpen(true)}
            className="w-9 h-9 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] hover:text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] transition cursor-pointer active:scale-90 shadow-md"
            aria-label={t('chats.newChat')}
            title={t('chats.newChat')}
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenPremium}
            className="h-9 px-3 rounded-full bg-[var(--nova-accent-color)]/15 hover:bg-[var(--nova-accent-color)] text-[var(--nova-accent-color)] hover:text-[var(--text-primary)] border border-[var(--nova-accent-color)]/40 flex items-center gap-1.5 text-[11px] font-semibold transition cursor-pointer active:scale-95 shadow-md"
            aria-label={t('premium.title')}
            title={t('premium.title')}
            data-testid="open-premium"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          {/* Select Mode Toggle */}
          {!selectMode ? (
            <button
              onClick={toggleSelectMode}
              className="w-9 h-9 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] hover:text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] transition cursor-pointer active:scale-90 shadow-md"
              aria-label="Select chats"
              title="Select chats"
            >
              <Check className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-[var(--text-secondary)] px-2">
                {selectedChatIds.size} {selectedChatIds.size === 1 ? 'selected' : 'selected'}
              </span>
              <button
                onClick={bulkPin}
                className="w-8 h-8 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] hover:text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] transition cursor-pointer active:scale-90 shadow-md"
                aria-label="Pin selected"
                title="Pin selected"
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={bulkMute}
                className="w-8 h-8 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] hover:text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] transition cursor-pointer active:scale-90 shadow-md"
                aria-label="Mute selected"
                title="Mute selected"
              >
                <BellOff className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={bulkArchive}
                className="w-8 h-8 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] hover:text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] transition cursor-pointer active:scale-90 shadow-md"
                aria-label="Archive selected"
                title="Archive selected"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={bulkDelete}
                className="w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 flex items-center justify-center text-red-400 transition cursor-pointer active:scale-90 shadow-md"
                aria-label="Delete selected"
                title="Delete selected"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={clearSelection}
                className="w-8 h-8 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] hover:text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] transition cursor-pointer active:scale-90 shadow-md"
                aria-label="Clear selection"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={toggleSelectMode}
                className="w-9 h-9 rounded-full bg-[var(--nova-accent-color)] hover:opacity-90 text-white flex items-center justify-center transition cursor-pointer active:scale-90 shadow-md"
                aria-label="Exit select mode"
                title="Exit select mode"
              >
                <Check className="w-4 h-4 fill-current" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PROMINENT TOP REAL-TIME CHAT SEARCH BAR */}
      <div className="px-5 pt-1 pb-2 shrink-0">
        <div className="relative flex items-center">
          <div className="absolute left-3.5 text-[var(--nova-accent-color)] pointer-events-none flex items-center justify-center">
            <Search className="w-4 h-4" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchQuery('');
            }}
            placeholder="Search conversations by contact name..."
            className="w-full bg-[var(--bg-surface-2)] border border-[var(--border)] focus:border-[var(--nova-accent-color)] focus:bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-xs rounded-full pl-10 pr-24 py-2.5 transition-all shadow-inner focus:outline-none"
          />

          <div className="absolute right-2.5 flex items-center gap-1">
            {searchQuery.trim() && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] font-semibold border border-[var(--nova-accent-color)]/30 shrink-0">
                {matchedChats.length} {matchedChats.length === 1 ? 'chat' : 'chats'}
              </span>
            )}
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 transition cursor-pointer"
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="hidden sm:inline-block text-[10px] text-[var(--text-tertiary)] font-mono pr-1 pointer-events-none">
                ⌘K
              </span>
            )}
          </div>
        </div>

        {/* Quick Search Keyword Chips */}
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar" ref={quickSearchChipsRef} data-testid="quick-search-chips">
          <span className="text-[10px] text-[var(--nova-text-muted)] shrink-0 font-medium pl-0.5">Quick search:</span>
          {CHAT_SEARCH_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setSearchQuery(chip)}
                className={`min-h-6 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium transition cursor-pointer shrink-0 ${
                  searchQuery.toLowerCase() === chip.toLowerCase()
                    ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-sm shadow-[var(--nova-accent-color)]/30 font-semibold'
                    : 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-strong)]'
                }`}
                aria-label={chip}
              >
              {chip}
            </button>
          ))}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="min-h-6 px-2 py-0.5 rounded-full text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface-2)]/30 transition cursor-pointer shrink-0"
              aria-label={t('common.reset') ?? 'Reset'}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* CONDITIONAL BODY: SEARCH RESULTS OR NORMAL FOLDER/STORIES VIEW */}
      {isSearching ? (
        /* SEARCH RESULTS VIEW */
        <div className="flex-1 overflow-y-auto px-5 pb-24 lg:pb-6 space-y-3">
          {/* Search Scope Filter Pills */}
          <div className="flex items-center justify-between pt-1 pb-0.5">
            <div className="flex items-center gap-1.5 bg-[var(--bg-surface-2)] p-1 rounded-xl border border-[var(--border-strong)]">
              <button
                onClick={() => setSearchFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === 'all'
                    ? 'bg-[var(--bg-surface-2)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                aria-label={`All filter, ${totalResults} results`}
              >
                All ({totalResults})
              </button>
              <button
                onClick={() => setSearchFilter('chats')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === 'chats'
                    ? 'bg-[var(--bg-surface-2)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                aria-label={`Chats filter, ${matchedChats.length} results`}
              >
                Chats ({matchedChats.length})
              </button>
              <button
                onClick={() => setSearchFilter('messages')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === 'messages'
                    ? 'bg-[var(--nova-surface-high)] text-[var(--nova-text-primary)] shadow-sm'
                    : 'text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)]'
                }`}
                aria-label={`Messages filter, ${matchedMessages.length} results`}
              >
                Messages ({matchedMessages.length})
              </button>
            </div>
            <span className="text-[10px] text-[#636875]">{totalResults} matches</span>
          </div>

          {/* Results Lists */}
          <div className="space-y-4">
            {totalResults === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-surface-2)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-tertiary)] mb-3">
                  <Search className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">No results found</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-[220px]">
                  No chats or messages match &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              <>
                {/* 1. Matching Chats filtered by contact name or message preview in real time */}
                {(searchFilter === 'all' || searchFilter === 'chats') && matchedChats.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                        Matching Chats ({matchedChats.length})
                      </span>
                      <span className="text-[10px] text-[var(--nova-accent-color)] font-medium">Real-time match</span>
                    </div>
                    {matchedChats.map((chat) => {
                      const isSelected = activeChatId === chat.id;
                      const unreadCount = readChats.has(chat.id) ? 0 : chat.unreadCount || 0;
                      const query = searchQuery.toLowerCase().trim();
                      const nameMatches = chat.name.toLowerCase().includes(query);
                      const snippetMatches = chat.snippet.toLowerCase().includes(query);
                      const historyMessages = CONVERSATION_HISTORIES[chat.id] || [];
                      const matchingHistMsg = historyMessages.find((m) =>
                        m.text?.toLowerCase().includes(query)
                      );
                      const isSwipingThis = swipingChatId === chat.id;

                      return (
                        <div
                          onTouchStart={(e) => { handleTouchStart(e, chat.id); startLongPress(e, chat.id); }}
                          onTouchMove={(e) => { handleTouchMove(e); cancelLongPress(); }}
                          onTouchEnd={() => { handleTouchEnd(chat.id, chat.isChannel); cancelLongPress(); }}
                          onTouchCancel={() => { resetSwipe(); cancelLongPress(); }}
                          className="relative overflow-hidden"
                          style={{ transform: isSwipingThis ? `translateX(-${swipeOffset}px)` : undefined }}
                        >
                          {/* Swipe Action Buttons */}
                          <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2" style={{ width: '320px' }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handlePinToggle(chat.id); resetSwipe(); }}
                              className="w-10 h-10 rounded-full bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center text-amber-400 transition cursor-pointer"
                              aria-label={pinnedChatIds.has(chat.id) ? t('common.unpin') : t('common.pin')}
                              title={pinnedChatIds.has(chat.id) ? 'Unpin' : 'Pin'}
                            >
                              <Pin className={`w-4 h-4 ${pinnedChatIds.has(chat.id) ? 'fill-current' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleArchiveToggle(chat.id); resetSwipe(); }}
                              className="w-10 h-10 rounded-full bg-blue-500/20 hover:bg-blue-500/30 flex items-center justify-center text-blue-400 transition cursor-pointer"
                              aria-label={archivedChatIds.has(chat.id) ? t('actions.unarchive') : t('actions.archive')}
                              title={archivedChatIds.has(chat.id) ? 'Unarchive' : 'Archive'}
                            >
                              <Archive className={`w-4 h-4 ${archivedChatIds.has(chat.id) ? 'rotate-180' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); resetSwipe(); }}
                              className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center text-red-400 transition cursor-pointer"
                              aria-label={t('common.delete', { defaultValue: 'Delete' })}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleMuteToggle(chat.id); resetSwipe(); }}
                              className="w-10 h-10 rounded-full bg-gray-500/20 hover:bg-gray-500/30 flex items-center justify-center text-gray-400 transition cursor-pointer"
                              aria-label={t('common.mute', { defaultValue: 'Mute' })}
                              title="Mute"
                            >
                              <VolumeX className="w-4 h-4" />
                            </button>
                          </div>

                          <div
                            key={chat.id}
                            onClick={() => handleChatClick(chat.id, chat.isChannel)}
                            role="button"
                            aria-label={`Chat with ${chat.name}`}
                            tabIndex={0}
                            className={`group relative border rounded-[22px] p-3.5 transition-all duration-150 cursor-pointer flex items-center gap-3.5 shadow-sm ${
                              isSelected
                                ? 'bg-[var(--bg-surface-2)] border-[var(--nova-accent-color)]/60 shadow-lg shadow-[var(--nova-accent-color)]/15 ring-1 ring-[var(--nova-accent-color)]/30'
                                : 'bg-[var(--bg-app)] hover:bg-[var(--bg-surface-2)] active:bg-[var(--bg-hover)] border border-[var(--border)]'
                            }`}
                          >
                          {/* Avatar Slot */}
                          <div className="relative shrink-0">
                            {chat.isChannel ? (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[var(--nova-danger-gradient-from)] to-[var(--nova-accent-color)] flex items-center justify-center text-[var(--text-on-accent)] shadow-inner font-bold">
                                <svg className="w-6 h-6 fill-[var(--text-on-accent)]" viewBox="0 0 24 24">
                                  <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
                                </svg>
                              </div>
                            ) : chat.groupAvatars ? (
<div className="w-12 h-12 rounded-full bg-[var(--bg-surface-2)] relative overflow-hidden border border-[var(--border-strong)] flex items-center justify-center">
                                <div className="absolute top-0.5 left-1 w-6 h-6 rounded-full overflow-hidden border border-[var(--border-strong)]">
                                  <LazyMedia src={chat.groupAvatars[0]} alt="" className="w-full h-full object-cover" />
                                </div>
<div className="absolute top-0.5 right-1 w-6 h-6 rounded-full overflow-hidden border border-[var(--border-strong)]">
                                  <LazyMedia src={chat.groupAvatars[1]} alt="" className="w-full h-full object-cover" />
                                </div>
<div className="absolute bottom-0.5 left-3 w-6 h-6 rounded-full overflow-hidden border border-[var(--border-strong)]">
                                  <LazyMedia src={chat.groupAvatars[2]} alt="" className="w-full h-full object-cover" />
                                </div>
                              </div>
                            ) : (
<div className="w-12 h-12 rounded-full overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-surface-2)] relative">
                                {chat.avatar ? (
                                  <LazyMedia src={chat.avatar} alt={chat.name} className="w-full h-full object-cover" />
                                ) : (
<div className="w-full h-full bg-[var(--bg-surface-2)] flex items-center justify-center text-xs font-bold text-[var(--text-tertiary)]">
                                    {chat.name.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Middle Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5 truncate">
<h2 className="font-semibold text-[var(--text-primary)] text-[15px] truncate tracking-tight group-hover:text-[var(--nova-accent-color)] transition-colors">
                                  {highlightMatch(chat.name, searchQuery)}
                                </h2>
                                {nameMatches && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] font-semibold border border-[var(--nova-accent-color)]/30 shrink-0">
                                    Contact
                                  </span>
                                )}
                                {isBotChat(chat.id) && (
                                  <span className="flex h-5 items-center rounded-full bg-[var(--color-info)]/10 px-1.5 text-[10px] text-[var(--color-info)] font-semibold border border-[var(--color-info)]/20 shrink-0 ml-1">
                                    BOT
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[var(--nova-text-muted)] font-normal shrink-0 ml-2">
                                {chat.time}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <p className="text-[13px] text-[var(--nova-text-muted)] truncate font-normal leading-snug pr-2">
                                {snippetMatches ? (
                                  highlightMatch(chat.snippet, searchQuery)
                                ) : matchingHistMsg ? (
                                  <span>
                                    <span className="text-[var(--nova-accent-color)] font-medium">Found in message: </span>
                                    {highlightMatch(matchingHistMsg.text || '', searchQuery)}
                                  </span>
                                ) : (
                                  highlightMatch(chat.snippet, searchQuery)
                                )}
                              </p>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {pinnedChatIds.has(chat.id) && (
                                  <div className="text-[var(--nova-text-muted)]">
                                    <Pin className="w-3.5 h-3.5 fill-current rotate-45" />
                                  </div>
                                )}
                                {unreadCount > 0 && (
                                  <div data-testid={`unread-${chat.id}`} className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[11px] font-bold flex items-center justify-center shadow-md shadow-[var(--nova-accent-color)]/30">
                                    {unreadCount}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. Matching Messages in Conversation History */}
                {(searchFilter === 'all' || searchFilter === 'messages') && matchedMessages.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] font-bold text-[var(--nova-text-muted)] uppercase tracking-wider px-1">
                      Found in Messages ({matchedMessages.length})
                    </div>
                    {matchedMessages.map((match) => (
                      <div
                        key={match.messageId}
                        onClick={() => handleChatClick(match.chatId, match.isChannel)}
                        role="button"
                        aria-label={`Message from ${match.chatName} by ${match.senderName}`}
                        tabIndex={0}
                        className="group bg-[var(--nova-surface-raised)]/90 hover:bg-[var(--nova-surface-raised)] active:bg-[var(--nova-surface-high)] border border-white/[0.04] rounded-2xl p-3 transition cursor-pointer flex items-start gap-3 shadow-sm"
                      >
                        <div className="w-9 h-9 rounded-full overflow-hidden border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)] shrink-0 mt-0.5">
                          {match.isChannel ? (
                            <div className="w-full h-full bg-[var(--nova-accent-color)] flex items-center justify-center text-[var(--nova-text-primary)] text-xs font-bold">
                              CH
                            </div>
                          ) : (
                            <LazyMedia
                              src={match.chatAvatar}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-[var(--nova-text-primary)] text-xs truncate">
                              {match.chatName}
                              <span className="text-[10px] text-[var(--nova-text-muted)] font-normal ml-2">
                                · {match.senderName}
                              </span>
                            </span>
                            <span className="text-[10px] text-[var(--nova-text-muted)] shrink-0">
                              {match.time}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--nova-text-secondary)] leading-snug line-clamp-2">
                            {highlightMatch(match.text, searchQuery)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        /* NORMAL VIEW: STORIES, CUSTOM FOLDER TABS, AND CHATS LIST */
        <>
          {/* Stories Row */}
          <div className="pt-1 pb-3 px-5 shrink-0">
            <div ref={storiesRef} className="flex gap-2.5 overflow-x-auto no-scrollbar scroll-smooth" data-testid="stories-row">
              <button
                onClick={() => setIsStoryComposerOpen(true)}
                className="w-[84px] h-[116px] rounded-[20px] shrink-0 border border-dashed border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] flex flex-col items-center justify-center gap-2 text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:border-[var(--nova-accent-color)] active:scale-95 transition cursor-pointer"
                aria-label={t('stories.addStory')}
              >
                <span className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/50 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </span>
                <span className="text-[11px] font-medium text-center leading-tight max-w-[72px]">
                  {t('stories.addStory')}
                </span>
              </button>
              {storyFeed.map((story, index) => (
                <button
                  key={story.id}
                  onClick={() => setStoryViewerIndex(index)}
                  className="w-[84px] h-[116px] rounded-[20px] relative overflow-hidden shrink-0 group focus:outline-none active:scale-95 transition cursor-pointer border border-[var(--nova-border-subtle)] shadow-md shadow-black/40"
                  aria-label={`Story from ${story.name}`}
                >
                  <LazyMedia
                    src={story.coverImage}
                    alt={story.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/35" />
                  {/* Extra band behind the avatar + name so labels stay legible on
                      bright covers, where the full-card scrim is not enough. */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

                  <div className="absolute top-2 left-2 h-5 min-w-5 px-1 rounded-full bg-black/50 backdrop-blur-md text-[10px] font-semibold text-[var(--nova-text-primary)] flex items-center justify-center border border-[var(--nova-border-color)]">
                    {isStoryScheduled(story, now) ? <Clock className="w-3 h-3" /> : story.unreadCount}
                  </div>

                  <div className="absolute bottom-2 inset-x-0 flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full overflow-hidden border-[1.5px] border-[var(--nova-accent-color)] shadow-sm mb-1 bg-black/40">
                      <LazyMedia
                        src={story.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[11px] font-medium text-[var(--nova-text-primary)] text-center truncate max-w-[76px] leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {story.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* DYNAMIC FOLDER TABS SYSTEM WITH CREATE/MANAGE MODAL BUTTON */}
          <div ref={folderTabsRef} className="px-5 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 max-w-full" data-testid="folder-tabs">
            {folders.map((folder) => {
              const isActive = activeFolderId === folder.id;
              const badge = getFolderBadge(folder);

              return (
                <div key={folder.id} className="relative group shrink-0">
                  <button
                    onClick={() => setActiveFolderId(folder.id)}
                    className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                      isActive
                        ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-md shadow-[var(--nova-accent-color)]/25'
                        : 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-strong)]'
                    }`}
                    aria-label={`Folder ${folder.name}${isActive ? ', active' : ''}`}
                  >
                    <span>{folder.name}</span>
                    {badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isActive ? 'bg-[var(--nova-accent-color)]/[0.15] text-[var(--text-on-accent)]' : 'text-[var(--text-tertiary)]'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>

                  {/* Edit icon for custom folders */}
                  {!folder.isDefault && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolder(folder);
                        setIsFolderModalOpen(true);
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] text-[var(--text-secondary)] hover:text-[var(--text-on-accent)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm border border-[var(--border)] cursor-pointer"
                      aria-label={t('common.editFolder') ?? `Edit folder ${folder.name}`}
                      title={t('common.edit')}
                    >
                      <Settings className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Plus button to create new folder */}
            <button
              onClick={() => {
                setEditingFolder(null);
                setIsFolderModalOpen(true);
              }}
              className="w-8 h-8 rounded-full bg-[var(--bg-surface-2)] hover:bg-[var(--nova-accent-color)] text-[var(--text-secondary)] hover:text-[var(--text-on-accent)] hover:shadow-md hover:shadow-[var(--nova-accent-color)]/25 border border-[var(--border-strong)] flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
              aria-label={t('foldersObj.addAnother') ?? 'Create new folder'}
              title={t('foldersObj.title') ?? 'Folders'}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Chats List Filtered by Active Folder */}
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-24 lg:pb-6 space-y-2.5">
            {currentFolder?.filterType === 'channels' && !isSearching && (
              <CommunitiesPanel
                channels={channels}
                localFingerprint={localFingerprint}
                onOpenChannel={onOpenChannel}
                onOpenChat={onSelectChat}
              />
            )}
            {categoryChats.length === 0 ? (
              /* Empty Folder State */
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in">
                <div className="w-12 h-12 rounded-full bg-[var(--nova-surface-raised)] border border-[var(--nova-border-subtle)] flex items-center justify-center text-[var(--nova-text-muted)] mb-3 shadow-inner">
                  <FolderPlus className="w-5 h-5 text-[var(--nova-accent-color)]" />
                </div>
                <p className="text-sm font-semibold text-[var(--nova-text-primary)]">Folder is empty</p>
                <p className="text-xs text-[var(--nova-text-muted)] mt-1 max-w-[220px]">
                  There are no chats assigned to &quot;{currentFolder.name}&quot; yet.
                </p>
                  <button
                    onClick={() => {
                      setEditingFolder(currentFolder);
                      setIsFolderModalOpen(true);
                    }}
                    className="mt-3 px-3.5 py-1.5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold hover:bg-[var(--nova-accent-color, ff5d2b)] transition shadow-md shadow-[var(--nova-accent-color)]/25 cursor-pointer"
                    aria-label={`Manage folder ${currentFolder.name} chats`}
                  >
                  Manage Folder Chats
                </button>
              </div>
            ) : (
              categoryChats.map((chat) => {
                const isSelected = activeChatId === chat.id;
                const unreadCount = readChats.has(chat.id) ? 0 : chat.unreadCount || 0;
                const isSwipingThis = swipingChatId === chat.id;
                return (
                <div
                  key={chat.id}
                  onTouchStart={(e) => { handleTouchStart(e, chat.id); startLongPress(e, chat.id); }}
                  onTouchMove={(e) => { handleTouchMove(e); cancelLongPress(); }}
                  onTouchEnd={() => { handleTouchEnd(chat.id, chat.isChannel); cancelLongPress(); }}
                  onTouchCancel={() => { resetSwipe(); cancelLongPress(); }}
                  className="relative overflow-hidden"
                  style={{ transform: isSwipingThis ? `translateX(-${swipeOffset}px)` : undefined }}
                >
                  {/* Swipe Action Buttons (revealed from right) */}
                  <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2" style={{ width: '320px' }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handlePinToggle(chat.id); resetSwipe(); }}
                      className="w-10 h-10 rounded-full bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center text-amber-400 transition cursor-pointer"
                      aria-label={pinnedChatIds.has(chat.id) ? t('common.unpin') : t('common.pin')}
                      title={pinnedChatIds.has(chat.id) ? 'Unpin' : 'Pin'}
                    >
                      <Pin className={`w-4 h-4 ${pinnedChatIds.has(chat.id) ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleArchiveToggle(chat.id); resetSwipe(); }}
                      className="w-10 h-10 rounded-full bg-blue-500/20 hover:bg-blue-500/30 flex items-center justify-center text-blue-400 transition cursor-pointer"
                      aria-label={archivedChatIds.has(chat.id) ? t('actions.unarchive') : t('actions.archive')}
                      title={archivedChatIds.has(chat.id) ? 'Unarchive' : 'Archive'}
                    >
                      <Archive className={`w-4 h-4 ${archivedChatIds.has(chat.id) ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); resetSwipe(); }}
                      className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center text-red-400 transition cursor-pointer"
                      aria-label={t('common.delete', { defaultValue: 'Delete' })}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); resetSwipe(); }}
                      className="w-10 h-10 rounded-full bg-gray-500/20 hover:bg-gray-500/30 flex items-center justify-center text-gray-400 transition cursor-pointer"
                      aria-label={t('common.mute', { defaultValue: 'Mute' })}
                      title="Mute"
                    >
                      <VolumeX className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Selection Checkbox (Select Mode) */}
                  {selectMode && (
                    <div className="flex items-center justify-center mr-2 shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedChatIds.has(chat.id)}
                        onChange={(e) => { e.stopPropagation(); toggleChatSelection(chat.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-2 border-[var(--nova-accent-color)] bg-transparent appearance-none cursor-pointer checked:bg-[var(--nova-accent-color)] checked:border-[var(--nova-accent-color)] checked:after:content-['✓'] checked:after:text-white checked:after:flex checked:after:items-center checked:after:justify-center transition-all duration-150"
                        aria-label="Select chat"
                      />
                    </div>
                  )}

                  {/* Chat Row Content */}
                  <div
                    onClick={() => selectMode ? toggleChatSelection(chat.id) : handleChatClick(chat.id, chat.isChannel)}
                    role="button"
                    aria-label={`Chat with ${chat.name}, ${chat.time}`}
                    tabIndex={0}
                    className={`group relative border rounded-[22px] p-3.5 transition-all duration-150 cursor-pointer flex items-center gap-3.5 shadow-sm ${
                      isSelected
                        ? 'bg-[var(--nova-surface-high)] border-[var(--nova-accent-color)]/60 shadow-lg shadow-[var(--nova-accent-color)]/15 ring-1 ring-[var(--nova-accent-color)]/30'
                        : 'bg-[var(--nova-surface-raised)]/90 hover:bg-[var(--nova-surface-high)] active:bg-[var(--nova-surface-high)] border-white/[0.04]'
                    }`}
                  >
                  {/* Avatar Slot */}
                  <div className="relative shrink-0">
                    {chat.isChannel ? (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[var(--nova-danger-gradient-from)] to-[var(--nova-accent-color)] flex items-center justify-center text-[var(--nova-text-primary)] shadow-inner font-bold">
                        <svg className="w-6 h-6 fill-[var(--nova-text-primary)]" viewBox="0 0 24 24">
                          <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
                        </svg>
                      </div>
                    ) : chat.groupAvatars ? (
                      <div className="w-12 h-12 rounded-full bg-[var(--nova-surface-high)] relative overflow-hidden border border-[var(--nova-border-subtle)] flex items-center justify-center">
                        <div className="absolute top-0.5 left-1 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                          <LazyMedia src={chat.groupAvatars[0]} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute top-0.5 right-1 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                          <LazyMedia src={chat.groupAvatars[1]} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute bottom-0.5 left-3 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                          <LazyMedia src={chat.groupAvatars[2]} alt="" className="w-full h-full object-cover" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)] relative">
                        <LazyMedia src={chat.avatar} alt={chat.name} className="w-full h-full object-cover" />
                        <div className="w-full h-full bg-[var(--nova-surface-high)] flex items-center justify-center text-xs font-bold text-[var(--nova-text-secondary)]">
                          {chat.name.slice(0, 2).toUpperCase()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Middle Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <h2 className="font-semibold text-[var(--nova-text-primary)] text-[15px] truncate tracking-tight group-hover:text-[var(--nova-accent-color)] transition-colors">
                          {chat.name}
                        </h2>
                        {isBotChat(chat.id) && (
                          <span className="flex h-5 items-center rounded-full bg-[var(--color-info)]/10 px-1.5 text-[10px] text-[var(--nova-accent-color)] font-semibold border border-[var(--color-info)]/20 shrink-0">
                            BOT
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--nova-text-muted)] font-normal shrink-0 ml-2">
                        {chat.time}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[13px] text-[var(--nova-text-muted)] truncate font-normal leading-snug pr-2">
                        {drafts[chat.id] ? (
                          <>
                            <span className="text-[var(--nova-accent-color,#ff4e18)] font-semibold">{t('chat.draft', { defaultValue: 'Draft' })}: </span>
                            <span className="text-[var(--nova-text-secondary)]">{drafts[chat.id]}</span>
                          </>
                        ) : (
                          chat.snippet
                        )}
                      </p>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {pinnedChatIds.has(chat.id) && (
                          <div className="text-[var(--nova-text-muted)]">
                            <Pin className="w-3.5 h-3.5 fill-current rotate-45" />
                          </div>
                        )}
                        {joinIndicators[chat.id]?.pending > 0 && (
                          <span
                            data-testid={`join-pending-${chat.id}`}
                            title={t('chats.joinRequestsBadge', {
                              count: joinIndicators[chat.id].pending,
                            })}
                            className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-bold flex items-center justify-center gap-1"
                          >
                            <Users className="w-3 h-3" />
                            {joinIndicators[chat.id].pending}
                          </span>
                        )}
                        {joinIndicators[chat.id]?.membership === 'pending' && (
                          <span
                            data-testid={`join-waiting-${chat.id}`}
                            title={t('chats.joinWaiting')}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] border border-[var(--nova-border-subtle)] flex items-center gap-1"
                          >
                            <Clock className="w-3 h-3" />
                            {t('chats.joinWaiting')}
                          </span>
                        )}
                        {unreadCount > 0 && (
                          <div data-testid={`unread-${chat.id}`} className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[11px] font-bold flex items-center justify-center shadow-md shadow-[var(--nova-accent-color)]/30">
                            {unreadCount}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveToggle(chat.id);
                          }}
                          className="w-7 h-7 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer shrink-0"
                          aria-label={
                            archivedChatIds.has(chat.id)
                              ? t('actions.unarchive', { defaultValue: 'Unarchive chat' })
                              : t('actions.archive', { defaultValue: 'Archive chat' })
                          }
                          title={
                            archivedChatIds.has(chat.id)
                              ? t('actions.unarchive', { defaultValue: 'Unarchive chat' })
                              : t('actions.archive', { defaultValue: 'Archive chat' })
                          }
                        >
                          {archivedChatIds.has(chat.id) ? (
                            <Archive className="w-3 h-3" />
                          ) : (
                            <Archive className="w-3 h-3 rotate-180" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePinToggle(chat.id);
                          }}
                          className="w-7 h-7 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer shrink-0"
                          aria-label={
                            pinnedChatIds.has(chat.id)
                              ? t('common.unpin', { defaultValue: 'Unpin' })
                              : t('common.pin', { defaultValue: 'Pin' })
                          }
                          title={
                            pinnedChatIds.has(chat.id)
                              ? t('actions.unpin', { defaultValue: 'Unpin chat' })
                              : t('actions.pin', { defaultValue: 'Pin chat' })
                          }
                        >
                          <Pin className={`w-3 h-3 ${pinnedChatIds.has(chat.id) ? 'fill-[var(--nova-accent-color,#ff4e18)]' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Pending join requests: an admin can decide without
                        opening the group; the card click stays untouched. */}
                    {joinIndicators[chat.id]?.pending > 0 && (
                      <div
                        data-testid={`join-actions-${chat.id}`}
                        className="mt-2 space-y-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {joinIndicators[chat.id].requests.slice(0, 3).map((request) => (
                          <div key={request.fingerprint} className="flex items-center gap-1.5">
                            <span className="flex-1 min-w-0 truncate text-[10px] font-mono text-amber-200/80">
                              {request.name || request.fingerprint}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleJoinDecision(chat.id, request.fingerprint, true)}
                              aria-label={`${t('chat.approveJoinRequest')}: ${request.fingerprint}`}
                              className="px-2 py-0.5 rounded-md bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/40 text-[9px] font-semibold text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/30 transition cursor-pointer shrink-0"
                            >
                              {t('chat.approveJoinRequest')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleJoinDecision(chat.id, request.fingerprint, false)}
                              aria-label={`${t('chat.rejectJoinRequest')}: ${request.fingerprint}`}
                              className="px-2 py-0.5 rounded-md bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[9px] font-semibold text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition cursor-pointer shrink-0"
                            >
                              {t('chat.rejectJoinRequest')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                  </div>
              );
            })
          )}
        </div>
      </>
    )}

{/* Floating Action Button (FAB) in the thumb zone for One-Handed Operation.
          The side follows the user's choice so a left-handed thumb reaches it. */}
        <div
          className={`fixed safe-bottom-fab z-35 lg:hidden flex flex-col pointer-events-auto ${
            fabSide === 'right' ? 'right-4 items-end' : 'left-4 items-start'
          }`}
          data-fab-side={fabSide}
        >
        {/* FAB Quick Action Bottom Sheet / Menu */}
        {isFabMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setIsFabMenuOpen(false)}
            />
            <div
              role="dialog"
              aria-label="Quick Actions"
              className="relative z-50 mb-3 w-56 rounded-3xl border border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)]/98 p-2 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-5 zoom-in-95 duration-200 space-y-1"
            >
              <button
                type="button"
onClick={() => {
                  setIsFabMenuOpen(false);
                  setNewChatModalOpen(true);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left text-xs font-semibold text-[var(--nova-text-primary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-[var(--nova-accent-color,#ff4e18)]/20 text-[var(--nova-accent-color,#ff4e18)] flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <span>{t('chats.newChat', { defaultValue: 'New Chat' })}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsFabMenuOpen(false);
                  setGroupModalOpen(true);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left text-xs font-semibold text-[var(--nova-text-primary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <span>{t('chats.newGroup', { defaultValue: 'New Group' })}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsFabMenuOpen(false);
                  document.getElementById('vcf-file-input')?.click();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left text-xs font-semibold text-[var(--nova-text-primary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <span>{t('contacts.import', { defaultValue: 'Import VCF' })}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  toggleFabSide();
                  setIsFabMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left text-xs font-semibold text-[var(--nova-text-primary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
                aria-label={t('chats.fabOtherSide', { defaultValue: 'Move button to the other side' })}
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Hand className="w-4 h-4" />
                </div>
                <span>
                  {fabSide === 'right'
                    ? t('chats.fabMoveLeft', { defaultValue: 'Move button left (left hand)' })
                    : t('chats.fabMoveRight', { defaultValue: 'Move button right (right hand)' })}
                </span>
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setIsFabMenuOpen((prev) => !prev)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 active:scale-90 cursor-pointer ${
            isFabMenuOpen
              ? 'bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] rotate-45'
              : 'bg-gradient-to-tr from-[var(--nova-accent-color,#ff4e18)] to-[var(--nova-danger-gradient-to)] text-[var(--nova-text-primary)] shadow-[var(--nova-accent-color,#ff4e18)]/50 hover:scale-105'
          }`}
          aria-label={t('chats.newAction', { defaultValue: 'New Action' })}
          title={t('chats.newAction', { defaultValue: 'New Action' })}
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>

      {/* Floating Bottom Navigation Bar. `absolute bottom-0` + the
          `safe-bottom-nav` offset keeps the thumb zone off the gesture bar
          while still tracking the screen's own layout. */}
      <div className="absolute bottom-0 safe-bottom-nav inset-x-0 flex justify-center z-30 pointer-events-none lg:hidden px-3">
        <nav className="pointer-events-auto grid w-full max-w-md grid-cols-4 gap-0.5 rounded-3xl border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-raised)]/95 p-1.5 shadow-2xl shadow-black/80 backdrop-blur-xl">
          {mobileNavItems.map(({ key, label, icon: Icon, active, onClick }) => (
            <button
              key={key}
              onClick={onClick}
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl transition-all duration-200 cursor-pointer active:scale-95 ${
                active
                  ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-lg shadow-[var(--nova-accent-color)]/30'
                  : 'text-[var(--nova-text-muted)] hover:text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
              }`}
            >
              <Icon className={`w-[20px] h-[20px] shrink-0 ${active ? 'fill-current stroke-none' : 'stroke-[2]'}`} />
              <span className="max-w-full truncate px-1 text-[10px] font-semibold leading-none">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Story Viewer Modal */}
      {storyViewerIndex !== null && storyFeed.length > 0 && (
        <StoryViewer
          stories={storyFeed}
          initialIndex={storyViewerIndex}
          now={now}
          onClose={() => setStoryViewerIndex(null)}
          onViewed={onViewStory}
          onDelete={onDeleteStory}
          onToggleReaction={onToggleStoryReaction}
        />
      )}

      <StoryComposerModal
        isOpen={isStoryComposerOpen}
        onClose={() => setIsStoryComposerOpen(false)}
        onPublish={(draft) => {
          onCreateStory?.(draft);
          setIsStoryComposerOpen(false);
        }}
      />

      {/* New Conversation Modal */}
      {newChatModalOpen && (
        <div
          onClick={() => setNewChatModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--nova-surface-raised)] border border-[var(--nova-border-subtle)] rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4"
          >
            <h3 className="font-bold text-base text-[var(--nova-text-primary)]">Start New Conversation</h3>
            <p className="text-xs text-[var(--nova-text-muted)]">
              Add someone with a link or QR code, or create a group:
            </p>
            {onOpenAnonymous && (
              <button
                type="button"
                onClick={() => {
                  setNewChatModalOpen(false);
                  onOpenAnonymous();
                }}
                className="w-full rounded-xl border border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/10 p-3 text-left transition hover:bg-[var(--nova-accent-color)]/20"
                aria-label="Add a new contact with a link or QR code"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)]">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-[var(--nova-text-primary)]">Add a new contact</span>
                    <span className="mt-0.5 block text-[10px] font-normal text-[var(--nova-text-secondary)]">
                      Share a link or QR code — no setup required
                    </span>
                  </span>
                </span>
              </button>
            )}
            <div className="space-y-2">
              <button
                onClick={() => {
                  setNewChatModalOpen(false);
                  onSelectChat('katie');
                }}
                className="w-full p-2.5 rounded-xl bg-[var(--nova-surface-high)] hover:bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold flex items-center gap-2.5 transition text-left"
                aria-label="Start conversation with Katie Rogers"
              >
                <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)] flex items-center justify-center text-[10px]">
                  KR
                </div>
                <span>Katie Rogers</span>
              </button>
            </div>
            <button
              onClick={() => {
                setNewChatModalOpen(false);
                setGroupModalOpen(true);
              }}
              className="w-full p-2.5 rounded-xl bg-[var(--nova-surface-high)] hover:bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold flex items-center gap-2.5 transition text-left"
              aria-label="Create group chat"
            >
              <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[10px]">
                <Users className="w-3.5 h-3.5" />
              </div>
              <span>Create Group Chat</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewChatModalOpen(false);
                document.getElementById('vcf-file-input')?.click();
              }}
              className="w-full p-2.5 rounded-xl bg-[var(--nova-surface-high)] hover:bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold flex items-center gap-2.5 transition text-left"
              aria-label="Import contacts from VCF file"
            >
              <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[10px]">
                <Cloud className="w-3.5 h-3.5" />
              </div>
              <span>Import Contacts (VCF)</span>
            </button>
            <input
              id="vcf-file-input"
              type="file"
              accept=".vcf,.vcf"
              className="hidden"
              onChange={(e) => {
                const file = e.target?.files?.[0];
                if (file) handleImportVCF(file);
              }}
            />
            <button
              onClick={() => setNewChatModalOpen(false)}
              className="w-full py-2 bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-secondary)] font-semibold text-xs rounded-xl transition"
              aria-label={t('common.cancel')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Group Creation Modal */}
      {groupModalOpen && (
        <div
          onClick={() => setGroupModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--nova-surface-raised)] border border-[var(--nova-border-subtle)] rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4"
          >
            <h3 className="font-bold text-base text-[var(--nova-text-primary)]">Create Group Chat</h3>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full bg-[var(--nova-surface-high)] text-[var(--nova-text-primary)] text-xs rounded-xl px-3 py-2.5 border border-[var(--nova-border-subtle)] focus:border-[var(--nova-accent-color)] outline-none"
            />
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {MOCK_CHATS.filter((chat) => chat.type === 'direct').map((chat) => (
                <label key={chat.id} className="flex items-center gap-2 text-xs text-[var(--nova-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(chat.id)}
                    onChange={(e) => {
                      setSelectedMembers((current) =>
                        e.target.checked
                          ? [...current, chat.id]
                          : current.filter((id) => id !== chat.id),
                      );
                    }}
                  />
                  <span>{chat.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!newGroupName.trim() || selectedMembers.length === 0) return;
                  const members = MOCK_CHATS.filter((chat) => selectedMembers.includes(chat.id));
                  const id = `group-${Date.now()}`;
                  const group: ChatItem = {
                    id,
                    name: newGroupName.trim(),
                    avatar: members[0]?.avatar || '',
                    groupAvatars: members.map((member) => member.avatar),
                    snippet: 'Group created',
                    time: 'now',
                    type: 'group',
                    category: 'All',
                    members: selectedMembers.map((memberId) => memberId),
                  };
                  MOCK_CHATS.push(group);
                  CONVERSATION_HISTORIES[id] = [];
                  const groups = [...loadCreatedGroups(), group];
                  saveCreatedGroups(groups);
                  const histories = loadCreatedGroupHistories();
                  histories[id] = [];
                  saveCreatedGroupHistories(histories);
                  setNewGroupName('');
                  setSelectedMembers([]);
                  setGroupModalOpen(false);
                  setGroupVersion((value) => value + 1);
                  onSelectChat(id);
                }}
                className="flex-1 py-2 bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] font-semibold text-xs rounded-xl transition"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setGroupModalOpen(false);
                  setNewGroupName('');
                  setSelectedMembers([]);
                }}
                className="flex-1 py-2 bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] font-semibold text-xs rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOLDERS MANAGEMENT / CREATION MODAL */}
      <FolderModal
        isOpen={isFolderModalOpen}
        folders={folders}
        chats={MOCK_CHATS}
        editingFolder={editingFolder}
        onSave={handleSaveFolder}
        onDelete={handleDeleteFolder}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
      />

      {/* Chat Row Context Menu (Long Press) */}
      {contextMenuChatId && contextMenuPosition && (() => {
        const chat = MOCK_CHATS.find(c => c.id === contextMenuChatId);
        if (!chat) return null;
        const isPinned = pinnedChatIds.has(chat.id);
        const isArchived = archivedChatIds.has(chat.id);
        const items = [
          {
            key: 'pin',
            label: isPinned ? t('common.unpin') : t('common.pin'),
            icon: <Pin className="w-5 h-5" />,
            onClick: () => { handlePinToggle(chat.id); closeContextMenu(); },
          },
          {
            key: 'archive',
            label: isArchived ? t('actions.unarchive') : t('actions.archive'),
            icon: <Archive className="w-5 h-5" />,
            onClick: () => { handleArchiveToggle(chat.id); closeContextMenu(); },
          },
          {
            key: 'mute',
            label: t('common.mute'),
            icon: <VolumeX className="w-5 h-5" />,
            onClick: () => { handleMuteToggle(chat.id); closeContextMenu(); },
          },
          {
            key: 'delete',
            label: t('common.delete'),
            icon: <Trash2 className="w-5 h-5" />,
            onClick: () => { handleDeleteChat(chat.id); closeContextMenu(); },
            destructive: true,
          },
        ];
        return (
          <NovaContextMenu
            isOpen={true}
            onClose={closeContextMenu}
            items={items}
            position={contextMenuPosition}
          />
        );
      })()}
    </div>
  );
});
