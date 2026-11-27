import { IconTrash as TrashX, IconUserCircle as UserCircle } from '@tabler/icons-react';
import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle} from "react";
import { LazyMedia } from "./LazyMedia";
import { useWheelScroll } from "../lib/ui/useWheelScroll";
import {
  FOLDER_SELECTED_EVENT,
  OPEN_FOLDER_MANAGER_EVENT,
  FOLDERS_STORAGE_KEY,
  loadActiveFolderId,
  loadFolders,
  notifyFoldersChanged,
  publishFolderUnreadCounts,
  selectFolder} from "../lib/chat/folders";
import { NovaContextMenu } from "../lib/ui/NovaContextMenu";
import { NovaIconButton, NovaMenu } from "../lib/ui";
import { useAccount } from "../hooks/useAccount";
import {
  IconSearch as Search,
  IconPlus as Plus,
  IconUsers as Users,
  IconMessage2 as MessageSquare,
  IconSettings as Settings,
  IconPin as Pin,
  IconX as X,
  IconFolderPlus as FolderPlus,
  IconFolder as Folder,
  IconClock as Clock,
  IconMapPin as MapPin,
  IconSpeakerphone as Megaphone,
  IconUserCircle as UserRound,
  IconSparkles as Sparkles,
  IconArchive as Archive,
  IconCloud as Cloud,
  IconTrash as Trash2,
  IconVolumeOff as VolumeX,
  IconCheck as Check,
  IconBellOff as BellOff,
  IconChevronRight as ChevronRight,
  IconGripVertical as GripVertical,
  IconLoader2 as Loader2,
  IconRotate as RotateCcw,
  IconArrowDown as ArrowDown,
  IconDotsVertical as MoreVertical,
  IconEdit as EditIcon} from "@tabler/icons-react";
import { getAllDrafts, subscribeDraftChanges } from "../lib/messaging/drafts";

import {
  MOCK_STORIES,
  MOCK_CHATS,
  CONVERSATION_HISTORIES,
  registerCreatedGroups,
  loadCreatedGroups,
  saveCreatedGroups,
  loadCreatedGroupHistories,
  saveCreatedGroupHistories} from "../data/mockMessengerData";
import {
  ChatItem,
  Story,
  MessageSearchResult,
  ChatFolder,
  ChannelInfo,
  StoryDraft} from "../types/messenger";
import { parseVCF, ParsedContact } from "../lib/contacts/vcfParser";
import { FolderModal } from "./FolderModal";
import { GroupModal } from "./GroupModal";
import { CommunitiesPanel } from "./CommunitiesPanel";
import { StoryComposerModal } from "./StoryComposerModal";
import { StoryViewer } from "./StoryViewer";
import { getStoryFeed, isStoryScheduled } from "../lib/social/store";
import {
  getGroupMembership,
  getPendingJoinRequests,
  type GroupJoinRequest,
  type GroupMembership} from "../lib/social/groupJoinRequests";
import { isGroupAdmin, loadGroupRoles } from "../lib/social/groupRoles";
import { decideJoinRequest } from "../lib/social/joinDecisions";
import { JOIN_REQUESTS_CHANGED_EVENT } from "../lib/social/joinRequestRelay";
import { buildGlobalSearchIndex } from "../lib/search/buildSearchIndex";
import { searchGlobal } from "../lib/search/globalSearch";
import { useLanguage } from "../context/LanguageContext";
import {
  muteContact,
  getNotificationPrefs} from "../lib/notifications/notificationPrefs";
import {
  CHAT_READ_EVENT,
  loadReadChats,
  markChatRead} from "../lib/messaging/unread";
import { triggerHaptic, hapticLight, hapticMedium } from "../lib/ui/haptics";

interface ChatsScreenProps {
  onSelectChat: (chatId: string) => void;
  onOpenChannel: (channelId?: string) => void;

  onOpenContacts?: () => void;
  onOpenCalls?: () => void;
  onOpenSettings?: () => void;
  onOpenPremium?: () => void;
  onOpenAnonymous?: () => void;
  activeChatId?: string;
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

const CHAT_SEARCH_CHIPS = [
  "Katie",
  "Harry's",
  "Sunday",
  "Thailand",
  "dinner",
  "photos",
  "flight",
];

registerCreatedGroups();

export const ChatsScreen = forwardRef<
  { openFolderModal: () => void },
  ChatsScreenProps
>((props, ref) => {
  const {
    onSelectChat,
    onOpenChannel,
    onOpenSettings,
    onOpenPremium,
    onOpenAnonymous,
    activeChatId,
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
  const [groupModalExisting, setGroupModalExisting] = useState<{
    id: string;
    name: string;
    session: any;
    members: any[];
    relayUrl: string;
  } | null>(null);
  const [groupVersion, setGroupVersion] = useState(0);

  // Message drafts auto-synced across views for one-handed convenience
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    getAllDrafts(),
  );

  useEffect(() => {
    return subscribeDraftChanges(() => {
      setDrafts(getAllDrafts());
    });
  }, []);

  // Folders State with localStorage persistence
  const [folders, setFolders] = useState<ChatFolder[]>(loadFolders);

  const [activeFolderId, setActiveFolderId] = useState<string>(loadActiveFolderId);
  const [archivedChatIds, setArchivedChatIds] = useState<Set<string>>(
    new Set(),
  );
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

  // Folders are switched from the bottom navigation; the chat list only follows.
  useEffect(() => {
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === 'string') setActiveFolderId(id);
    };
    const onOpenManager = () => {
      setEditingFolder(null);
      setIsFolderModalOpen(true);
    };
    window.addEventListener(FOLDER_SELECTED_EVENT, onSelect);
    window.addEventListener(OPEN_FOLDER_MANAGER_EVENT, onOpenManager);
    return () => {
      window.removeEventListener(FOLDER_SELECTED_EVENT, onSelect);
      window.removeEventListener(OPEN_FOLDER_MANAGER_EVENT, onOpenManager);
    };
  }, []);
  const [folderToast, setFolderToast] = useState<string | null>(null);

  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  // Pull-to-refresh
  const pullStartYRef = useRef<number>(0);
  const isPullingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handlePullStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const container = scrollContainerRef.current;
    if (!container || container.scrollTop > 0) return;
    isPullingRef.current = true;
    pullStartYRef.current = e.touches[0].clientY;
  };

  const handlePullMove = (e: React.TouchEvent) => {
    if (!isPullingRef.current || e.touches.length !== 1) return;
    const container = scrollContainerRef.current;
    if (!container || container.scrollTop > 0) return;
    const dy = e.touches[0].clientY - pullStartYRef.current;
    if (dy > 0) {
      e.preventDefault();
      setPullDistance(Math.min(dy * 0.5, 80));
      if (pullDistance > 60 && !isPullRefreshing) {
        triggerHaptic("light");
      }
    }
  };

  const handlePullEnd = () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    if (pullDistance > 60 && !isPullRefreshing) {
      setIsPullRefreshing(true);
      triggerHaptic("medium");
      setTimeout(() => {
        setIsPullRefreshing(false);
        setPullDistance(0);
      }, 1000);
    } else {
      setPullDistance(0);
    }
  };

  // Horizontal swipe on the list switches folders.
  const folderSwipeRef = useRef({ startX: 0, startY: 0, dx: 0, active: false });

  const handleListTouchStart = (e: React.TouchEvent) => {
    handlePullStart(e);
    if (e.touches.length !== 1) return;
    folderSwipeRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      dx: 0,
      active: false,
    };
  };

  const handleListTouchMove = (e: React.TouchEvent) => {
    handlePullMove(e);
    const gesture = folderSwipeRef.current;
    if (!gesture || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - gesture.startX;
    const dy = e.touches[0].clientY - gesture.startY;
    gesture.dx = dx;
    if (!gesture.active && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      gesture.active = true;
    }
  };

  const handleListTouchEnd = () => {
    handlePullEnd();
    const gesture = folderSwipeRef.current;
    if (gesture?.active && Math.abs(gesture.dx) >= 64) {
      const index = folders.findIndex((folder) => folder.id === activeFolderId);
      const nextFolder = index >= 0 ? folders[gesture.dx < 0 ? index + 1 : index - 1] : undefined;
      if (nextFolder) {
        triggerHaptic("light");
        selectFolder(nextFolder.id);
        triggerFolderToast(nextFolder.name);
      }
    }
    folderSwipeRef.current = { startX: 0, startY: 0, dx: 0, active: false };
  };

  // Long-press context menu
  const [contextMenuChatId, setContextMenuChatId] = useState<string | null>(
    null,
  );
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(
    new Set(),
  );
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (e: React.TouchEvent, chatId: string) => {
    const touch = e.touches[0];
    longPressTimerRef.current = setTimeout(() => {
      setContextMenuChatId(chatId);
      setContextMenuPosition({ x: touch.clientX, y: touch.clientY });
      // Haptic feedback
      hapticLight();
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

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<
    "all" | "chats" | "messages"
  >("all");
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  const [isStoryComposerOpen, setIsStoryComposerOpen] = useState(false);
  const storyFeed = useMemo(() => getStoryFeed(stories, now), [stories, now]);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quickSearchChipsRef = useWheelScroll();
  const storiesRef = useWheelScroll();

  // Global shortcut: Cmd+K / Ctrl+K jumps to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
    notifyFoldersChanged();
    selectFolder(folderToSave.id);
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
    notifyFoldersChanged();
    if (activeFolderId === folderId) {
      selectFolder("all");
    }
    triggerFolderToast("Folder deleted");
  };

  // Join requests show up in the list, so an admin sees a pending request
  // without opening every group. Relayed requests arrive while no chat is open.
  const [joinVersion, setJoinVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setJoinVersion((version) => version + 1);
    window.addEventListener(JOIN_REQUESTS_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(JOIN_REQUESTS_CHANGED_EVENT, onChange);
  }, []);

  const joinIndicators = useMemo(() => {
    const map: Record<
      string,
      {
        pending: number;
        requests: GroupJoinRequest[];
        membership: GroupMembership | null;
      }
    > = {};
    for (const chat of MOCK_CHATS) {
      if (chat.type !== "group") continue;
      const membership = getGroupMembership(chat.id);
      const isAdmin =
        !!localFingerprint &&
        isGroupAdmin(loadGroupRoles(chat.id), localFingerprint);
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

  const handleJoinDecision = (
    chatId: string,
    fingerprint: string,
    approved: boolean,
  ) => {
    const roles = decideJoinRequest({
      groupId: chatId,
      fingerprint,
      localFingerprint: localFingerprint ?? "",
      approved,
    });
    if (!roles) return;
    setGroupVersion((version) => version + 1);
    triggerFolderToast(
      approved ? t("chat.joinRequestApproved") : t("chat.joinRequestDeclined"),
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
    if (currentFolder.id === "all" || currentFolder.filterType === "all") {
      result = MOCK_CHATS.filter((c) => !archivedChatIds.has(c.id));
    } else if (currentFolder.id === "archive") {
      result = MOCK_CHATS.filter((c) => archivedChatIds.has(c.id));
    } else if (currentFolder.filterType === "direct") {
      result = MOCK_CHATS.filter((c) => c.type === "direct");
    } else if (currentFolder.filterType === "channels") {
      result = MOCK_CHATS.filter((c) => c.isChannel || c.type === "channel");
    } else if (currentFolder.filterType === "groups") {
      result = MOCK_CHATS.filter((c) => c.type === "group");
    } else {
      result = MOCK_CHATS.filter((c) => currentFolder.chatIds.includes(c.id));
    }

    // Append user-imported contacts as direct chats (only in 'all' folder)
    if (currentFolder.id === "all" || currentFolder.filterType === "all") {
      const contactChats: ChatItem[] = userContacts.map((c) => ({
        id: `contact-${c.name.replace(/\s+/g, "-").toLowerCase()}`,
        name: c.name,
        avatar:
          c.avatar ??
          `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=random`,
        snippet: c.phone ?? c.email ?? "Imported contact",
        time: "",
        unreadCount: 0,
        isPinned: false,
        type: "direct",
        category: "Imported",
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
  }, [
    currentFolder,
    groupVersion,
    archivedChatIds,
    pinnedChatIds,
    userContacts,
  ]);

  // Per-folder unread totals feed the folder chips in the bottom navigation.
  const folderUnreadCounts = useMemo(() => {
    const matches = (folder: ChatFolder) => {
      if (folder.filterType === "direct") return MOCK_CHATS.filter((c) => c.type === "direct");
      if (folder.filterType === "channels") {
        return MOCK_CHATS.filter((c) => c.isChannel || c.type === "channel");
      }
      if (folder.filterType === "groups") return MOCK_CHATS.filter((c) => c.type === "group");
      if (folder.filterType === "all") return MOCK_CHATS;
      return MOCK_CHATS.filter((c) => folder.chatIds.includes(c.id));
    };
    const counts: Record<string, number> = {};
    for (const folder of folders) {
      counts[folder.id] = matches(folder).reduce(
        (total, chat) => total + (readChats.has(chat.id) ? 0 : chat.unreadCount || 0),
        0,
      );
    }
    return counts;
  }, [folders, readChats]);

  useEffect(() => {
    publishFolderUnreadCounts(folderUnreadCounts);
  }, [folderUnreadCounts]);

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
        m.text?.toLowerCase().includes(query),
      );
      return nameMatch || snippetMatch || historyMatch;
    });
  }, [searchQuery, groupVersion]);

  // Local search index across all conversation history (text, documents,
  // polls, locations, media captions). No server-side index is involved.
  const searchIndex = useMemo(
    () =>
      buildGlobalSearchIndex({
        chats: MOCK_CHATS,
        histories: CONVERSATION_HISTORIES,
      }),
    [groupVersion],
  );

  // Search through deep conversation history across all chats
  const matchedMessages = useMemo<MessageSearchResult[]>(() => {
    if (!searchQuery.trim()) return [];

    return searchGlobal(searchIndex, searchQuery, {
      kinds: ["message"],
      limit: 150,
    }).map((result) => {
      const chat = MOCK_CHATS.find((c) => c.id === result.chatId);
      const messagePrefix = `chat:${result.chatId}:`;
      const messageId = result.id.startsWith(messagePrefix)
        ? result.id.slice(messagePrefix.length)
        : result.id;
      const msg = CONVERSATION_HISTORIES[result.chatId]?.find(
        (m) => m.id === messageId,
      );

      return {
        chatId: result.chatId,
        chatName: result.chatName,
        chatAvatar: result.chatAvatar ?? chat?.avatar ?? "",
        isChannel: chat?.isChannel,
        messageId,
        text: msg?.text ?? result.text,
        time: result.time ?? msg?.time ?? "",
        senderName: result.senderName ?? result.chatName,
      };
    });
  }, [searchQuery, searchIndex]);

  const totalResults = matchedChats.length + matchedMessages.length;
  const isSearching = searchQuery.trim().length > 0;


  const handleChatClick = (chatId: string, isChannel?: boolean) => {
    markChatRead(chatId);
    if (isChannel || chatId === "kyiv-channel") {
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
        if (activeFolderId === "archive") setActiveFolderId("all");
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
    const isMuted =
      prefs.muteUntil[chatId] && prefs.muteUntil[chatId] > Date.now();

    if (isMuted) {
      // Unmute
      muteContact(chatId, 0);
      triggerFolderToast("Chat unmuted");
    } else {
      // Mute for 1 hour (default), could show a modal for duration selection
      muteContact(chatId, 60 * 60 * 1000);
      triggerFolderToast("Chat muted for 1 hour");
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
    triggerFolderToast("Chat deleted and archived");
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
          const newContacts = contacts.filter(
            (c) => !existingNames.has(c.name),
          );
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
    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
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
          ),
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-primary)] relative select-none">
      {/* Toast Notification */}
      {folderToast && (
        <div
          data-testid="folder-toast"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-surface)]/[0.95] border border-[var(--nova-accent-color)]/50 text-[var(--text-primary)] text-xs px-3.5 py-1.5 rounded-full shadow-[var(--shadow-2)] backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <FolderPlus className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
          <span>{folderToast}</span>
        </div>
      )}

      {/* Telegram-style Top Bar (morphs into Selection Bar when selectMode is active) */}
      {selectMode ? (
        <header className="h-[52px] px-3 flex items-center justify-between gap-2 shrink-0 bg-[var(--nova-surface)]/92 backdrop-blur-xl border-b border-[var(--nova-border-subtle)] animate-in fade-in duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <NovaIconButton
              label={t('common.cancel', { defaultValue: 'Cancel' })}
              icon={<X />}
              size={36}
              variant="ghost"
              onClick={toggleSelectMode}
            />
            <span className="text-[15px] font-semibold text-[var(--text-primary)] tabular-nums truncate">
              {selectedChatIds.size}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <NovaIconButton
              label={t('common.selectAll', { defaultValue: 'Select all' })}
              icon={<Check />}
              size={36}
              variant="ghost"
              onClick={selectedChatIds.size === categoryChats.length ? clearSelection : selectAllChats}
            />
            <NovaIconButton
              label={t('chat.pinChat', { defaultValue: 'Pin' })}
              icon={<Pin />}
              size={36}
              variant="ghost"
              disabled={selectedChatIds.size === 0}
              onClick={bulkPin}
            />
            <NovaIconButton
              label={t('channel.disableNotifications', { defaultValue: 'Mute' })}
              icon={<BellOff />}
              size={36}
              variant="ghost"
              disabled={selectedChatIds.size === 0}
              onClick={bulkMute}
            />
            <NovaIconButton
              label={t('chats.archive', { defaultValue: 'Archive' })}
              icon={<Archive />}
              size={36}
              variant="ghost"
              disabled={selectedChatIds.size === 0}
              onClick={bulkArchive}
            />
            <NovaIconButton
              label={t('common.delete', { defaultValue: 'Delete' })}
              icon={<Trash2 />}
              size={36}
              variant="danger"
              disabled={selectedChatIds.size === 0}
              onClick={bulkDelete}
            />
          </div>
        </header>
      ) : (
        <header className="h-[52px] px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 bg-[var(--bg-app)]/90 backdrop-blur-xl border-b border-[var(--nova-border-subtle)]/60">
          {/* Left: Title */}
          <h1 className="lg:hidden truncate text-[18px] font-bold text-[var(--text-primary)] tracking-tight">
            {t('common.chats')}
          </h1>
          <h1 className="hidden lg:block truncate text-[16px] font-semibold text-[var(--text-primary)] tracking-tight">
            {account.nickname}
          </h1>

          {/* Right: Actions */}
          <div className="flex shrink-0 items-center gap-0.5">
            <NovaIconButton
              label={t('chats.newChat')}
              icon={<EditIcon />}
              size={36}
              variant="ghost"
              onClick={() => setNewChatModalOpen(true)}
            />

            <NovaIconButton
              label={t('chats.search', { defaultValue: 'Search' })}
              icon={<Search />}
              size={36}
              variant="ghost"
              className="lg:hidden"
              onClick={() => searchInputRef.current?.focus()}
            />

            <NovaMenu
              label={t('common.menu', { defaultValue: 'Menu' })}
              align="end"
              trigger={
                <NovaIconButton
                  label={t('common.menu', { defaultValue: 'Menu' })}
                  icon={<MoreVertical />}
                  size={36}
                  variant="ghost"
                />
              }
              items={[
                {
                  key: 'select',
                  label: t('common.select', { defaultValue: 'Select' }),
                  icon: <Check />,
                  onSelect: toggleSelectMode,
                },
                {
                  key: 'new-chat',
                  label: t('chats.newChat'),
                  icon: <Plus />,
                  onSelect: () => setNewChatModalOpen(true),
                },
                {
                  key: 'folders',
                  label: t('foldersObj.title'),
                  icon: <Folder />,
                  onSelect: () => {
                    setEditingFolder(null);
                    setIsFolderModalOpen(true);
                  },
                },
                ...(onOpenAnonymous
                  ? [
                      {
                        key: 'contacts',
                        label: t('common.contacts'),
                        icon: <UserCircle />,
                        onSelect: onOpenAnonymous,
                      },
                    ]
                  : []),
                {
                  key: 'premium',
                  label: t('premium.title'),
                  icon: <Sparkles />,
                  separatorBefore: true,
                  onSelect: onOpenPremium,
                },
                {
                  key: 'settings',
                  label: t('settings.title'),
                  icon: <Settings />,
                  onSelect: onOpenSettings,
                },
              ]}
            />
          </div>
        </header>
      )}

      {/* INLINE SEARCH BAR (Telegram-style: expands in place when activated) */}
      <div className={`px-3 sm:px-4 pb-2 shrink-0 transition-all duration-200 ${searchQuery ? 'opacity-100 h-auto' : 'opacity-0 h-0 overflow-hidden pointer-events-none'}`}>
        <div className="relative flex items-center">
          <div className="absolute left-3 text-[var(--nova-accent-color)] pointer-events-none flex items-center justify-center">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchQuery("");
            }}
            placeholder={t('chats.searchPlaceholder', { defaultValue: 'Search conversations...' })}
            className="w-full bg-[var(--bg-surface-2)] border border-[var(--border)] focus:border-[var(--nova-accent-color)] focus:bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-xs rounded-full pl-9 pr-20 py-2 transition-all shadow-inner focus:outline-none"
          />

          <div className="absolute right-2 flex items-center gap-1">
            {searchQuery.trim() && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] font-semibold border border-[var(--nova-accent-color)]/30 shrink-0">
                {matchedChats.length}{" "}
                {matchedChats.length === 1 ? "chat" : "chats"}
              </span>
            )}
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 transition cursor-pointer"
                aria-label={t("common.close")}
                title={t("common.close")}
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
        {searchQuery && (
          <div
            className="flex items-center gap-1 mt-1 overflow-x-auto no-scrollbar"
            ref={quickSearchChipsRef}
            data-testid="quick-search-chips"
          >
            <span className="text-[9px] text-[var(--nova-text-muted)] shrink-0 font-medium pl-0.5">
              {t('chats.quickSearch')}
            </span>
            {CHAT_SEARCH_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setSearchQuery(chip)}
                className={`min-h-5 px_2 py-0.5 rounded-full text-[9px] font-medium transition cursor-pointer shrink-0 ${
                  searchQuery.toLowerCase() === chip.toLowerCase()
                    ? "bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-sm shadow-[var(--nova-accent-color)]/30 font-semibold"
                    : "bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-strong)]"
                }`}
                aria-label={chip}
              >
                {chip}
              </button>
            ))}
            <button
              onClick={() => setSearchQuery("")}
              className="min-h-5 px-1.5 py-0.5 rounded-full text-[9px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface-2)]/30 transition cursor-pointer shrink-0"
              aria-label={t("common.reset") ?? "Reset"}
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* CONDITIONAL BODY: SEARCH RESULTS OR NORMAL FOLDER/STORIES VIEW */}
      {isSearching ? (
        /* SEARCH RESULTS VIEW */
        <div className="flex-1 overflow-y-auto px-5 pb-36 lg:pb-6 space-y-3 safe-area-bottom-min">
          {/* Search Scope Filter Pills */}
          <div className="flex items-center justify-between pt-1 pb-0.5">
            <div className="flex items-center gap-1.5 bg-[var(--bg-surface-2)] p-1 rounded-xl border border-[var(--border-strong)]">
              <button
                onClick={() => setSearchFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === "all"
                    ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
                aria-label={t('chats.searchFilterAll', { count: totalResults })}
              >
                All ({totalResults})
              </button>
              <button
                onClick={() => setSearchFilter("chats")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === "chats"
                    ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
                aria-label={t('chats.searchFilterChats', { count: matchedChats.length })}
              >
                Chats ({matchedChats.length})
              </button>
              <button
                onClick={() => setSearchFilter("messages")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === "messages"
                    ? "bg-[var(--nova-surface-high)] text-[var(--nova-text-primary)] shadow-sm"
                    : "text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)]"
                }`}
                aria-label={t('chats.searchFilterMessages', { count: matchedMessages.length })}
              >
                Messages ({matchedMessages.length})
              </button>
            </div>
            <span className="text-[10px] text-[#636875]">
              {totalResults} matches
            </span>
          </div>

          {/* Results Lists */}
          <div className="space-y-4">
            {totalResults === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-surface-2)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-tertiary)] mb-3">
                  <Search className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  No results found
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-[220px]">
                  No chats or messages match &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              <>
                {/* 1. Matching Chats filtered by contact name or message preview in real time */}
                {(searchFilter === "all" || searchFilter === "chats") &&
                  matchedChats.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                          Matching Chats ({matchedChats.length})
                        </span>
                        <span className="text-[10px] text-[var(--nova-accent-color)] font-medium">
                          Real-time match
                        </span>
                      </div>
                      {matchedChats.map((chat) => {
                        const isSelected = activeChatId === chat.id;
                        const unreadCount = readChats.has(chat.id)
                          ? 0
                          : chat.unreadCount || 0;
                        const query = searchQuery.toLowerCase().trim();
                        const nameMatches = chat.name
                          .toLowerCase()
                          .includes(query);
                        const snippetMatches = chat.snippet
                          .toLowerCase()
                          .includes(query);
                        const historyMessages =
                          CONVERSATION_HISTORIES[chat.id] || [];
                        const matchingHistMsg = historyMessages.find((m) =>
                          m.text?.toLowerCase().includes(query),
                        );

                        return (
                          <div
                            onTouchStart={(e) => startLongPress(e, chat.id)}
                            onTouchMove={cancelLongPress}
                            onTouchEnd={cancelLongPress}
                            onTouchCancel={cancelLongPress}
                          >

                            <div
                              key={chat.id}
                              onClick={() =>
                                handleChatClick(chat.id, chat.isChannel)
                              }
                              role="button"
                              aria-label={t('chats.chatWith', { name: chat.name })}
                              tabIndex={0}
                              className={`group relative border rounded-xl p-3 transition-all duration-150 cursor-pointer flex items-center gap-3 shadow-sm ${
                                isSelected
                                  ? "bg-[var(--bg-surface-2)] border-[var(--nova-accent-color)]/60 shadow-lg shadow-[var(--nova-accent-color)]/15 ring-1 ring-[var(--nova-accent-color)]/30"
                                  : "bg-[var(--bg-app)] hover:bg-[var(--bg-surface-2)] active:bg-[var(--bg-hover)] border border-[var(--border)]"
                              }`}
                              data-testid={`chat-item-${chat.id}`}
                            >
                              {/* Avatar Slot */}
                              <div className="relative shrink-0">
                                {chat.isChannel ? (
                                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[var(--nova-danger-gradient-from)] to-[var(--nova-accent-color)] flex items-center justify-center text-[var(--text-on-accent)] shadow-inner font-bold">
                                    <svg
                                      className="w-6 h-6 fill-[var(--text-on-accent)]"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
                                    </svg>
                                  </div>
                                ) : chat.groupAvatars ? (
                                  <div className="w-11 h-11 rounded-full bg-[var(--bg-surface-2)] relative overflow-hidden border border-[var(--border-strong)] flex items-center justify-center">
                                    <div className="absolute top-0.5 left-1 w-6 h-6 rounded-full overflow-hidden border border-[var(--border-strong)]">
                                      <LazyMedia
                                        src={chat.groupAvatars[0]}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="absolute top-0.5 right-1 w-6 h-6 rounded-full overflow-hidden border border-[var(--border-strong)]">
                                      <LazyMedia
                                        src={chat.groupAvatars[1]}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="absolute bottom-0.5 left-3 w-6 h-6 rounded-full overflow-hidden border border-[var(--border-strong)]">
                                      <LazyMedia
                                        src={chat.groupAvatars[2]}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-11 h-11 rounded-full overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-surface-2)] relative">
                                    {chat.avatar ? (
                                      <LazyMedia
                                        src={chat.avatar}
                                        alt={chat.name}
                                        className="w-full h-full object-cover"
                                      />
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
                                        <span className="text-[var(--nova-accent-color)] font-medium">
                                          Found in message:{" "}
                                        </span>
                                        {highlightMatch(
                                          matchingHistMsg.text || "",
                                          searchQuery,
                                        )}
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
                                      <div
                                        data-testid={`unread-${chat.id}`}
                                        className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[11px] font-bold flex items-center justify-center shadow-md shadow-[var(--nova-accent-color)]/30"
                                      >
                                        {unreadCount}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <ChevronRight
                                className="w-4 h-4 text-[var(--nova-text-muted)] group-hover:text-[var(--nova-accent-color)] transition-colors shrink-0 ml-2"
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                {/* 2. Matching Messages in Conversation History */}
                {(searchFilter === "all" || searchFilter === "messages") &&
                  matchedMessages.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] font-bold text-[var(--nova-text-muted)] uppercase tracking-wider px-1">
                        Found in Messages ({matchedMessages.length})
                      </div>
                      {matchedMessages.map((match) => (
                        <div
                          key={match.messageId}
                          onClick={() =>
                            handleChatClick(match.chatId, match.isChannel)
                          }
                          role="button"
                          aria-label={t('chats.messageFrom', { chatName: match.chatName, senderName: match.senderName })}
                          tabIndex={0}
                          className="group bg-[var(--nova-surface-raised)]/90 hover:bg-[var(--nova-surface-raised)] active:bg-[var(--nova-surface-high)] border border-[var(--nova-border-color)] rounded-2xl p-3 transition cursor-pointer flex items-start gap-3 shadow-sm"
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
          <div className="pt-1 pb-2 px-4 shrink-0">
            <div
              ref={storiesRef}
              className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth"
              data-testid="stories-row"
            >
              <button
                onClick={() => setIsStoryComposerOpen(true)}
                className="w-[76px] h-[104px] rounded-[18px] shrink-0 border border-dashed border-[var(--nova-border-color)] bg-[var(--nova-overlay-weak)] flex flex-col items-center justify-center gap-1.5 text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:border-[var(--nova-accent-color)] active:scale-95 transition cursor-pointer"
                aria-label={t("stories.addStory")}
              >
                <span className="w-7 h-7 rounded-full bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/50 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </span>
                <span className="text-[10px] font-medium text-center leading-tight max-w-[64px]">
                  {t("stories.addStory")}
                </span>
              </button>
              {storyFeed.map((story, index) => (
                <button
                  key={story.id}
                  onClick={() => setStoryViewerIndex(index)}
                  className="w-[76px] h-[104px] rounded-[18px] relative overflow-hidden shrink-0 group focus:outline-none active:scale-95 transition cursor-pointer border border-[var(--nova-border-subtle)] shadow-md shadow-black/40"
                  aria-label={t('chats.storyFrom', { name: story.name })}
                >
                  <LazyMedia
                    src={story.coverImage}
                    alt={story.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/35" />
                  <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

                  <div className="absolute top-1.5 left-1.5 h-4 min-w-4 px-1 rounded-full bg-black/50 backdrop-blur-md text-[9px] font-semibold text-[var(--nova-text-primary)] flex items-center justify-center border border-[var(--nova-border-color)]">
                    {isStoryScheduled(story, now) ? (
                      <Clock className="w-2.5 h-2.5" />
                    ) : (
                      story.unreadCount
                    )}
                  </div>

                  <div className="absolute bottom-1.5 inset-x-0 flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full overflow-hidden border-[1.5px] border-[var(--nova-accent-color)] shadow-sm mb-0.5 bg-black/40">
                      <LazyMedia
                        src={story.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[10px] font-medium text-[var(--nova-text-primary)] text-center truncate max-w-[70px] leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {story.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

                  {/* Chats List Filtered by Active Folder */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-4 pt-1.5 pb-36 lg:pb-6 space-y-2 safe-area-bottom-min"
            data-testid="chats-list"
            onTouchStart={handleListTouchStart}
            onTouchMove={handleListTouchMove}
            onTouchEnd={handleListTouchEnd}
            onTouchCancel={handleListTouchEnd}
          >
{/* Mobile Search Bar - always visible on mobile */}
            <div className="lg:hidden mb-3">
              <div className="relative flex items-center">
                <div className="absolute left-3 text-[var(--nova-accent-color)] pointer-events-none flex items-center justify-center">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSearchQuery("");
                  }}
                  placeholder={t('chats.searchPlaceholderMobile', { defaultValue: 'Search chats...' })}
                  className="w-full bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-xs rounded-full pl-9 pr-9 py-2 transition-all shadow-inner focus:outline-none data-[inline-focus]:focus-visible:ring-0"
                  data-inline-focus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={t("common.close")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Pull-to-refresh indicator */}
            {pullDistance > 0 && (
              <div
                className="flex items-center justify-center py-2 text-[var(--nova-text-muted)] transition"
                style={{
                  transform: `translateY(${Math.max(pullDistance - 20, 0)}px)`,
                }}
              >
                {isPullRefreshing ? (
                  <>
                    <Loader2 className="w-5 h-5 text-[var(--nova-accent-color)] animate-spin" />
                    <span className="ml-2 text-xs">
                      {t("common.refreshing")}
                    </span>
                  </>
                ) : pullDistance > 60 ? (
                  <>
                    <RotateCcw className="w-5 h-5 text-[var(--nova-accent-color)]" />
                    <span className="ml-2 text-xs">
                      {t("common.releaseToRefresh")}
                    </span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="w-5 h-5" />
                    <span className="ml-2 text-xs">
                      {t("common.pullToRefresh")}
                    </span>
                  </>
                )}
              </div>
            )}
            {currentFolder?.filterType === "channels" && !isSearching && (
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
                <p className="text-sm font-semibold text-[var(--nova-text-primary)]">
                  Folder is empty
                </p>
                <p className="text-xs text-[var(--nova-text-muted)] mt-1 max-w-[220px]">
                  There are no chats assigned to &quot;{currentFolder.name}
                  &quot; yet.
                </p>
                <button
                  onClick={() => {
                    setEditingFolder(currentFolder);
                    setIsFolderModalOpen(true);
                  }}
                  className="mt-3 px-3.5 py-1.5 rounded-2xl bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold hover:bg-[var(--nova-accent-color, ff5d2b)] transition shadow-md shadow-[var(--nova-accent-color)]/25 cursor-pointer active:bg-[var(--nova-overlay-strong)]"
                  aria-label={t('chats.manageFolderChats', { name: currentFolder.name })}
                >
                  Manage Folder Chats
                </button>
                <div className="mt-4 flex flex-col gap-2 w-full max-w-xs">
<button
                    onClick={() => setNewChatModalOpen(true)}
                    className="px-4 py-2 rounded-2xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] text-xs font-semibold hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)]"
                  >
                    <Plus className="w-3 h-3 mr-1.5" />
                    Create New Chat
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic("light");
                      onOpenAnonymous?.();
                    }}
                    className="px-4 py-2 rounded-2xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] text-xs font-semibold hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)]"
                  >
                    <Users className="w-3 h-3 mr-1.5" />
                    Invite Contact
                  </button>
                </div>
              </div>
            ) : (
              categoryChats.map((chat) => {
                const isSelected = activeChatId === chat.id;
                const unreadCount = readChats.has(chat.id)
                  ? 0
                  : chat.unreadCount || 0;
                return (
                  <div
                    key={chat.id}
                    onTouchStart={(e) => startLongPress(e, chat.id)}
                    onTouchMove={cancelLongPress}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                  >

                    {/* Selection Checkbox (Select Mode) */}
                    {selectMode && (
                      <div className="flex items-center justify-center mr-2 shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedChatIds.has(chat.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleChatSelection(chat.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-2 border-[var(--nova-accent-color)] bg-transparent appearance-none cursor-pointer checked:bg-[var(--nova-accent-color)] checked:border-[var(--nova-accent-color)] checked:after:content-['✓'] checked:after:text-white checked:after:flex checked:after:items-center checked:after:justify-center transition-all duration-150"
                          aria-label={t('chats.selectChat')}
                        />
                      </div>
                    )}

                      {/* Chat Row Content */}
                    <div
                      onClick={() =>
                        selectMode
                          ? toggleChatSelection(chat.id)
                          : handleChatClick(chat.id, chat.isChannel)
                      }
                      role="button"
                      aria-label={t('chats.chatWith', { name: chat.name })}
                      tabIndex={0}
                      className={`group relative border rounded-xl p-2 transition-all duration-150 cursor-pointer flex items-center gap-2 shadow-sm ${
                        isSelected
                          ? "bg-[var(--nova-surface-high)] border-[var(--nova-accent-color)]/60 shadow-lg shadow-[var(--nova-accent-color)]/15 ring-1 ring-[var(--nova-accent-color)]/30"
                          : "bg-[var(--nova-surface-raised)]/90 hover:bg-[var(--nova-surface-high)] active:bg-[var(--nova-surface-high)] border-[var(--nova-border-color)]"
                      }`}
                      data-testid={`chat-item-${chat.id}`}
                    >
                      {/* Avatar Slot */}
                      <div className="relative shrink-0">
                        {chat.isChannel ? (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[var(--nova-danger-gradient-from)] to-[var(--nova-accent-color)] flex items-center justify-center text-[var(--nova-text-primary)] shadow-inner font-bold">
                            <svg
                              className="w-5 h-5 fill-[var(--nova-text-primary)]"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
                            </svg>
                          </div>
                        ) : chat.groupAvatars ? (
                          <div className="w-10 h-10 rounded-full bg-[var(--nova-surface-high)] relative overflow-hidden border border-[var(--nova-border-subtle)] flex items-center justify-center">
                            <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full overflow-hidden border border-[#17181e]">
                              <LazyMedia
                                src={chat.groupAvatars[0]}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full overflow-hidden border border-[#17181e]">
                              <LazyMedia
                                src={chat.groupAvatars[1]}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="absolute bottom-0.5 left-2.5 w-4 h-4 rounded-full overflow-hidden border border-[#17181e]">
                              <LazyMedia
                                src={chat.groupAvatars[2]}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)] relative">
                            <LazyMedia
                              src={chat.avatar}
                              alt={chat.name}
                              className="w-full h-full object-cover"
                            />
                            <div className="w-full h-full bg-[var(--nova-surface-high)] flex items-center justify-center text-xs font-bold text-[var(--nova-text-secondary)]">
                              {chat.name.slice(0, 2).toUpperCase()}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Middle Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1 truncate">
                            <h2 className="font-semibold text-[var(--nova-text-primary)] text-[13px] truncate tracking-tight group-hover:text-[var(--nova-accent-color)] transition-colors">
                              {chat.name}
                            </h2>
                            {isBotChat(chat.id) && (
                              <span className="flex h-4 items-center rounded-full bg-[var(--color-info)]/10 px-1 text-[9px] text-[var(--nova-accent-color)] font-semibold border border-[var(--color-info)]/20 shrink-0">
                                BOT
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[var(--nova-text-muted)] font-normal shrink-0 ml-1.5">
                            {chat.time}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-[var(--nova-text-muted)] truncate font-normal leading-snug pr-2">
                            {drafts[chat.id] ? (
                              <>
                                <span className="text-[var(--nova-accent-color,#ff4e18)] font-semibold">
                                  {t("chat.draft", { defaultValue: "Draft" })}
                                  :{" "}
                                </span>
                                <span className="text-[var(--nova-text-secondary)]">
                                  {drafts[chat.id]}
                                </span>
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
                                title={t("chats.joinRequestsBadge", {
                                  count: joinIndicators[chat.id].pending,
                                })}
                                className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-bold flex items-center justify-center gap-1"
                              >
                                <Users className="w-3 h-3" />
                                {joinIndicators[chat.id].pending}
                              </span>
                            )}
                            {joinIndicators[chat.id]?.membership ===
                              "pending" && (
                              <span
                                data-testid={`join-waiting-${chat.id}`}
                                title={t("chats.joinWaiting")}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] border border-[var(--nova-border-subtle)] flex items-center gap-1"
                              >
                                <Clock className="w-3 h-3" />
                                {t("chats.joinWaiting")}
                              </span>
                            )}
                            {unreadCount > 0 && (
                              <div
                                data-testid={`unread-${chat.id}`}
                                className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[11px] font-bold flex items-center justify-center shadow-md shadow-[var(--nova-accent-color)]/30"
                              >
                                {unreadCount}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveToggle(chat.id);
                              }}
                              className="w-6 h-6 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] shrink-0"
                              aria-label={
                                archivedChatIds.has(chat.id)
                                  ? t("actions.unarchive", {
                                      defaultValue: "Unarchive chat",
                                    })
                                  : t("actions.archive", {
                                      defaultValue: "Archive chat",
                                    })
                              }
                              title={
                                archivedChatIds.has(chat.id)
                                  ? t("actions.unarchive", {
                                      defaultValue: "Unarchive chat",
                                    })
                                  : t("actions.archive", {
                                      defaultValue: "Archive chat",
                                    })
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
                              className="w-6 h-6 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] shrink-0"
                              aria-label={
                                pinnedChatIds.has(chat.id)
                                  ? t("common.unpin", { defaultValue: "Unpin" })
                                  : t("common.pin", { defaultValue: "Pin" })
                              }
                              title={
                                pinnedChatIds.has(chat.id)
                                  ? t("actions.unpin", {
                                      defaultValue: "Unpin chat",
                                    })
                                  : t("actions.pin", {
                                      defaultValue: "Pin chat",
                                    })
                              }
                            >
                              <Pin
                                className={`w-3 h-3 ${pinnedChatIds.has(chat.id) ? "fill-[var(--nova-accent-color,#ff4e18)]" : ""}`}
                              />
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
                            {joinIndicators[chat.id].requests
                              .slice(0, 3)
                              .map((request) => (
                                <div
                                  key={request.fingerprint}
                                  className="flex items-center gap-1.5"
                                >
                                  <span className="flex-1 min-w-0 truncate text-[10px] font-mono text-amber-200/80">
                                    {request.name || request.fingerprint}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleJoinDecision(
                                        chat.id,
                                        request.fingerprint,
                                        true,
                                      )
                                    }
                                    aria-label={`${t("chat.approveJoinRequest")}: ${request.fingerprint}`}
                                    className="px-2 py-0.5 rounded-md bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/40 text-[9px] font-semibold text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/30 transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] shrink-0"
                                  >
                                    {t("chat.approveJoinRequest")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleJoinDecision(
                                        chat.id,
                                        request.fingerprint,
                                        false,
                                      )
                                    }
                                    aria-label={`${t("chat.rejectJoinRequest")}: ${request.fingerprint}`}
                                    className="px-2 py-0.5 rounded-md bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[9px] font-semibold text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] shrink-0"
                                  >
                                    {t("chat.rejectJoinRequest")}
                                  </button>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Swipe Actions Hint - shows on hover/focus */}
                    <div
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none"
                      aria-hidden="true"
                    >
                      <div className="w-6 h-6 rounded-full bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] flex items-center justify-center">
                        <GripVertical className="w-3 h-3 text-[var(--nova-text-muted)]" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}


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
            <h3 className="font-bold text-base text-[var(--nova-text-primary)]">
              {t('chats.startNewConversation')}
            </h3>
            <p className="text-xs text-[var(--nova-text-muted)]">
              {t('chats.addContactOrGroup')}
            </p>
            {onOpenAnonymous && (
              <button
                type="button"
                onClick={() => {
                  setNewChatModalOpen(false);
                  onOpenAnonymous();
                }}
                className="w-full rounded-xl border border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/10 p-3 text-left transition hover:bg-[var(--nova-accent-color)]/20"
                aria-label={t('chats.addContactWithLink')}
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)]">
                    <UserCircle className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-[var(--nova-text-primary)]">
                      {t('chats.addContact')}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-normal text-[var(--nova-text-secondary)]">
                      {t('chats.shareLinkOrQr')}
                    </span>
                  </span>
                </span>
              </button>
            )}
            <div className="space-y-2">
              <button
                onClick={() => {
                  setNewChatModalOpen(false);
                  onSelectChat("katie");
                }}
                className="w-full p-2.5 rounded-xl bg-[var(--nova-surface-high)] hover:bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold flex items-center gap-2.5 transition text-left"
                aria-label={t('chats.startConversationWith', { name: 'Katie Rogers' })}
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
                setGroupModalExisting(null);
                setGroupModalOpen(true);
              }}
              className="w-full p-2.5 rounded-xl bg-[var(--nova-surface-high)] hover:bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold flex items-center gap-2.5 transition text-left"
              aria-label={t('chats.createGroupChat')}
            >
              <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[10px]">
                <Users className="w-3.5 h-3.5" />
              </div>
              <span>{t('chats.createGroupChatTitle')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewChatModalOpen(false);
                document.getElementById("vcf-file-input")?.click();
              }}
              className="w-full p-2.5 rounded-xl bg-[var(--nova-surface-high)] hover:bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold flex items-center gap-2.5 transition text-left"
              aria-label={t('chats.importContactsVcf')}
            >
              <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[10px]">
                <Cloud className="w-3.5 h-3.5" />
              </div>
              <span>{t('chats.importContactsVcfTitle')}</span>
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
              aria-label={t("common.cancel")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Group Modal (Create/Manage) */}
      <GroupModal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        existingGroup={groupModalExisting}
        onGroupCreated={(groupId) => {
          setGroupVersion((value) => value + 1);
        }}
      />

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
      {contextMenuChatId &&
        contextMenuPosition &&
        (() => {
          const chat = MOCK_CHATS.find((c) => c.id === contextMenuChatId);
          if (!chat) return null;
          const isPinned = pinnedChatIds.has(chat.id);
          const isArchived = archivedChatIds.has(chat.id);
          const items = [
            {
              key: "pin",
              label: isPinned ? t("common.unpin") : t("common.pin"),
              icon: <Pin className="w-5 h-5" />,
              onClick: () => {
                handlePinToggle(chat.id);
                closeContextMenu();
              },
            },
            {
              key: "archive",
              label: isArchived ? t("actions.unarchive") : t("actions.archive"),
              icon: <Archive className="w-5 h-5" />,
              onClick: () => {
                handleArchiveToggle(chat.id);
                closeContextMenu();
              },
            },
            {
              key: "mute",
              label: t("common.mute"),
              icon: <VolumeX className="w-5 h-5" />,
              onClick: () => {
                handleMuteToggle(chat.id);
                closeContextMenu();
              },
            },
            {
              key: "delete",
              label: t("common.delete"),
              icon: <TrashX className="w-5 h-5" />,
              onClick: () => {
                handleDeleteChat(chat.id);
                closeContextMenu();
              },
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










