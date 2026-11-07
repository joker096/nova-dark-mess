import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Users,
  Phone,
  MessageSquare,
  Settings,
  Pin,
  X,
  MessageCircle,
  FolderPlus,
  Folder,
} from 'lucide-react';
import {
  CURRENT_USER,
  MOCK_STORIES,
  MOCK_CHATS,
  CONVERSATION_HISTORIES,
} from '../data/mockMessengerData';
import { ChatItem, Story, MessageSearchResult, ChatFolder } from '../types/messenger';
import { FolderModal } from './FolderModal';

interface ChatsScreenProps {
  onSelectChat: (chatId: string) => void;
  onOpenChannel: () => void;
  onOpenSettings?: () => void;
  onOpenContacts?: () => void;
  onOpenCalls?: () => void;
  onOpenProfile?: () => void;
  activeChatId?: string;
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
  {
    id: 'channels',
    name: 'Channels',
    filterType: 'channels',
    chatIds: ['kyiv-channel'],
    icon: 'radio',
    isDefault: true,
  },
  {
    id: 'favorites',
    name: 'Favorites',
    filterType: 'custom',
    chatIds: ['katie', 'thailand'],
    icon: 'star',
    isDefault: true,
  },
];

export const ChatsScreen: React.FC<ChatsScreenProps> = ({
  onSelectChat,
  onOpenChannel,
  onOpenProfile,
  activeChatId,
}) => {
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
    } catch {}
    return DEFAULT_FOLDERS;
  });

  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ChatFolder | null>(null);
  const [folderToast, setFolderToast] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'chats' | 'messages'>('all');
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
      } catch {}
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
      } catch {}
      return updated;
    });
    if (activeFolderId === folderId) {
      setActiveFolderId('all');
    }
    triggerFolderToast('Folder deleted');
  };

  // Active folder object
  const currentFolder = useMemo(() => {
    return folders.find((f) => f.id === activeFolderId) || folders[0];
  }, [folders, activeFolderId]);

  // Filter chats by active folder when not searching
  const categoryChats = useMemo(() => {
    if (!currentFolder || currentFolder.id === 'all' || currentFolder.filterType === 'all') {
      return MOCK_CHATS;
    }
    if (currentFolder.filterType === 'direct') {
      return MOCK_CHATS.filter((c) => c.type === 'direct');
    }
    if (currentFolder.filterType === 'channels') {
      return MOCK_CHATS.filter((c) => c.isChannel || c.type === 'channel');
    }
    if (currentFolder.filterType === 'groups') {
      return MOCK_CHATS.filter((c) => c.type === 'group');
    }
    return MOCK_CHATS.filter((c) => currentFolder.chatIds.includes(c.id));
  }, [currentFolder]);

  // Calculate badge (unread or count) for each folder tab
  const getFolderBadge = (folder: ChatFolder) => {
    if (folder.id === 'all') return null;
    let matchedList: ChatItem[] = [];
    if (folder.filterType === 'direct') {
      matchedList = MOCK_CHATS.filter((c) => c.type === 'direct');
    } else if (folder.filterType === 'channels') {
      matchedList = MOCK_CHATS.filter((c) => c.isChannel || c.type === 'channel');
    } else if (folder.filterType === 'groups') {
      matchedList = MOCK_CHATS.filter((c) => c.type === 'group');
    } else {
      matchedList = MOCK_CHATS.filter((c) => folder.chatIds.includes(c.id));
    }
    const totalUnread = matchedList.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
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
  }, [searchQuery]);

  // Search through deep conversation history across all chats
  const matchedMessages = useMemo<MessageSearchResult[]>(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    const results: MessageSearchResult[] = [];

    Object.entries(CONVERSATION_HISTORIES).forEach(([chatId, messages]) => {
      const chat = MOCK_CHATS.find((c) => c.id === chatId);
      const chatName = chat?.name || chatId;
      const chatAvatar = chat?.avatar || '';
      const isChannel = chat?.isChannel;

      messages.forEach((msg) => {
        if (msg.text && msg.text.toLowerCase().includes(query)) {
          results.push({
            chatId,
            chatName,
            chatAvatar,
            isChannel,
            messageId: msg.id,
            text: msg.text,
            time: msg.time,
            senderName: msg.senderId === 'me' ? 'You' : chatName,
          });
        }
      });
    });

    return results;
  }, [searchQuery]);

  const totalResults = matchedChats.length + matchedMessages.length;
  const isSearching = searchQuery.trim().length > 0;

  const handleChatClick = (chatId: string, isChannel?: boolean) => {
    if (isChannel || chatId === 'kyiv-channel') {
      onOpenChannel();
    } else {
      onSelectChat(chatId);
    }
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
              className="text-[#ff4e18] font-semibold bg-[#ff4e18]/20 px-1 py-0.2 rounded"
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
    <div className="flex flex-col h-full bg-[#0c0d11] text-white relative select-none">
      {/* Toast Notification */}
      {folderToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-[#ff4e18]/50 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <FolderPlus className="w-3.5 h-3.5 text-[#ff4e18]" />
          <span>{folderToast}</span>
        </div>
      )}

      {/* Top Header: User Greeting */}
      <div className="pt-3 px-5 pb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenProfile}
            className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-[#181921] relative cursor-pointer active:scale-95 transition"
            title="My Profile"
          >
            <img
              src={CURRENT_USER.avatar}
              alt={CURRENT_USER.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="w-full h-full bg-[#ff4e18] flex items-center justify-center text-xs font-bold text-white">
              JS
            </div>
          </button>
          <div>
            <h1 className="text-[17px] font-bold text-white tracking-tight leading-tight">
              Hello, {CURRENT_USER.name}
            </h1>
            <p className="text-[11px] text-[#828795] font-normal leading-tight">
              You've got <span className="text-[#ff4e18] font-medium">{CURRENT_USER.unreadTotal} unread</span> chats
            </p>
          </div>
        </div>

        {/* Action icons on right */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewChatModalOpen(true)}
            className="w-9 h-9 rounded-full bg-[#181921] hover:bg-[#ff4e18] hover:text-white border border-white/5 flex items-center justify-center text-white/80 transition cursor-pointer active:scale-90 shadow-md"
            title="New Conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PROMINENT TOP REAL-TIME CHAT SEARCH BAR */}
      <div className="px-5 pt-1 pb-2 shrink-0">
        <div className="relative flex items-center">
          <div className="absolute left-3.5 text-[#ff4e18] pointer-events-none flex items-center justify-center">
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
            placeholder="Search contact name or message content..."
            className="w-full bg-[#171821] border border-white/[0.08] focus:border-[#ff4e18] focus:bg-[#1a1b26] text-white placeholder-white/35 text-xs rounded-full pl-10 pr-24 py-2.5 transition-all shadow-inner focus:outline-none"
          />

          <div className="absolute right-2.5 flex items-center gap-1">
            {searchQuery.trim() && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#ff4e18]/20 text-[#ff4e18] font-semibold border border-[#ff4e18]/30 shrink-0">
                {matchedChats.length} {matchedChats.length === 1 ? 'chat' : 'chats'}
              </span>
            )}
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="text-white/50 hover:text-white p-1 transition cursor-pointer"
                title="Clear search (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="hidden sm:inline-block text-[10px] text-white/30 font-mono pr-1 pointer-events-none">
                ⌘K
              </span>
            )}
          </div>
        </div>

        {/* Quick Search Keyword Chips */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] text-[#737887] shrink-0 font-medium pl-0.5">Quick search:</span>
          {CHAT_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setSearchQuery(chip)}
              className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-medium transition cursor-pointer shrink-0 ${
                searchQuery.toLowerCase() === chip.toLowerCase()
                  ? 'bg-[#ff4e18] text-white shadow-sm shadow-[#ff4e18]/30 font-semibold'
                  : 'bg-[#181921] text-[#8b909d] hover:text-white border border-white/5'
              }`}
            >
              {chip}
            </button>
          ))}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-2 py-0.5 rounded-full text-[10px] text-white/50 hover:text-white bg-white/5 transition cursor-pointer shrink-0"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* CONDITIONAL BODY: SEARCH RESULTS OR NORMAL FOLDER/STORIES VIEW */}
      {isSearching ? (
        /* SEARCH RESULTS VIEW */
        <div className="flex-1 overflow-y-auto px-5 pb-24 md:pb-6 space-y-3">
          {/* Search Scope Filter Pills */}
          <div className="flex items-center justify-between pt-1 pb-0.5">
            <div className="flex items-center gap-1.5 bg-[#14151b] p-1 rounded-xl border border-white/[0.04]">
              <button
                onClick={() => setSearchFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === 'all'
                    ? 'bg-[#222430] text-white shadow-sm'
                    : 'text-[#828795] hover:text-white'
                }`}
              >
                All ({totalResults})
              </button>
              <button
                onClick={() => setSearchFilter('chats')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === 'chats'
                    ? 'bg-[#222430] text-white shadow-sm'
                    : 'text-[#828795] hover:text-white'
                }`}
              >
                Chats ({matchedChats.length})
              </button>
              <button
                onClick={() => setSearchFilter('messages')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  searchFilter === 'messages'
                    ? 'bg-[#222430] text-white shadow-sm'
                    : 'text-[#828795] hover:text-white'
                }`}
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
                <div className="w-12 h-12 rounded-full bg-[#181921] border border-white/5 flex items-center justify-center text-white/30 mb-3">
                  <Search className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-white/80">No results found</p>
                <p className="text-xs text-[#717682] mt-1 max-w-[220px]">
                  No chats or messages match "{searchQuery}"
                </p>
              </div>
            ) : (
              <>
                {/* 1. Matching Chats filtered by contact name or message preview in real time */}
                {(searchFilter === 'all' || searchFilter === 'chats') && matchedChats.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold text-[#868b98] uppercase tracking-wider">
                        Matching Chats ({matchedChats.length})
                      </span>
                      <span className="text-[10px] text-[#ff4e18] font-medium">Real-time match</span>
                    </div>
                    {matchedChats.map((chat) => {
                      const isSelected = activeChatId === chat.id;
                      const query = searchQuery.toLowerCase().trim();
                      const nameMatches = chat.name.toLowerCase().includes(query);
                      const snippetMatches = chat.snippet.toLowerCase().includes(query);
                      const historyMessages = CONVERSATION_HISTORIES[chat.id] || [];
                      const matchingHistMsg = historyMessages.find((m) =>
                        m.text?.toLowerCase().includes(query)
                      );

                      return (
                        <div
                          key={chat.id}
                          onClick={() => handleChatClick(chat.id, chat.isChannel)}
                          className={`group relative border rounded-[22px] p-3.5 transition-all duration-150 cursor-pointer flex items-center gap-3.5 shadow-sm ${
                            isSelected
                              ? 'bg-[#222432] border-[#ff4e18]/60 shadow-lg shadow-[#ff4e18]/15 ring-1 ring-[#ff4e18]/30'
                              : 'bg-[#17181e]/90 hover:bg-[#1e1f27] active:bg-[#23242e] border-white/[0.04]'
                          }`}
                        >
                          {/* Avatar Slot */}
                          <div className="relative shrink-0">
                            {chat.isChannel ? (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#dc2626] to-[#ff4e18] flex items-center justify-center text-white shadow-inner font-bold">
                                <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                                  <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
                                </svg>
                              </div>
                            ) : chat.groupAvatars ? (
                              <div className="w-12 h-12 rounded-full bg-[#20222a] relative overflow-hidden border border-white/10 flex items-center justify-center">
                                <div className="absolute top-0.5 left-1 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                                  <img src={chat.groupAvatars[0]} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="absolute top-0.5 right-1 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                                  <img src={chat.groupAvatars[1]} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="absolute bottom-0.5 left-3 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                                  <img src={chat.groupAvatars[2]} alt="" className="w-full h-full object-cover" />
                                </div>
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-[#20222a] relative">
                                <img
                                  src={chat.avatar}
                                  alt={chat.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                                <div className="w-full h-full bg-[#232530] flex items-center justify-center text-xs font-bold text-white/70">
                                  {chat.name.slice(0, 2).toUpperCase()}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Middle Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5 truncate">
                                <h2 className="font-semibold text-white text-[15px] truncate tracking-tight group-hover:text-[#ff4e18] transition-colors">
                                  {highlightMatch(chat.name, searchQuery)}
                                </h2>
                                {nameMatches && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#ff4e18]/15 text-[#ff4e18] font-semibold border border-[#ff4e18]/30 shrink-0">
                                    Contact
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[#717682] font-normal shrink-0 ml-2">
                                {chat.time}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <p className="text-[13px] text-[#868b98] truncate font-normal leading-snug pr-2">
                                {snippetMatches ? (
                                  highlightMatch(chat.snippet, searchQuery)
                                ) : matchingHistMsg ? (
                                  <span>
                                    <span className="text-[#ff4e18] font-medium">Found in message: </span>
                                    {highlightMatch(matchingHistMsg.text || '', searchQuery)}
                                  </span>
                                ) : (
                                  highlightMatch(chat.snippet, searchQuery)
                                )}
                              </p>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {chat.isPinned && (
                                  <div className="text-white/40">
                                    <Pin className="w-3.5 h-3.5 fill-current rotate-45" />
                                  </div>
                                )}
                                {chat.unreadCount && (
                                  <div className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#ff4e18] text-white text-[11px] font-bold flex items-center justify-center shadow-md shadow-[#ff4e18]/30">
                                    {chat.unreadCount}
                                  </div>
                                )}
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
                    <div className="text-[11px] font-bold text-[#868b98] uppercase tracking-wider px-1">
                      Found in Messages ({matchedMessages.length})
                    </div>
                    {matchedMessages.map((match) => (
                      <div
                        key={match.messageId}
                        onClick={() => handleChatClick(match.chatId, match.isChannel)}
                        className="group bg-[#17181e]/90 hover:bg-[#1f2029] active:bg-[#252734] border border-white/[0.04] rounded-2xl p-3 transition cursor-pointer flex items-start gap-3 shadow-sm"
                      >
                        <div className="w-9 h-9 rounded-full overflow-hidden border border-white/10 bg-[#20222a] shrink-0 mt-0.5">
                          {match.isChannel ? (
                            <div className="w-full h-full bg-[#ff4e18] flex items-center justify-center text-white text-xs font-bold">
                              CH
                            </div>
                          ) : (
                            <img
                              src={match.chatAvatar}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-white text-xs truncate">
                              {match.chatName}
                              <span className="text-[10px] text-[#717682] font-normal ml-2">
                                · {match.senderName}
                              </span>
                            </span>
                            <span className="text-[10px] text-[#717682] shrink-0">
                              {match.time}
                            </span>
                          </div>
                          <p className="text-xs text-[#a0a5b2] leading-snug line-clamp-2">
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
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar scroll-smooth">
              {MOCK_STORIES.map((story) => (
                <button
                  key={story.id}
                  onClick={() => setActiveStory(story)}
                  className="w-[84px] h-[116px] rounded-[20px] relative overflow-hidden shrink-0 group focus:outline-none active:scale-95 transition cursor-pointer border border-white/5 shadow-md shadow-black/40"
                >
                  <img
                    src={story.coverImage}
                    alt={story.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/35" />

                  <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-black/50 backdrop-blur-md text-[10px] font-semibold text-white flex items-center justify-center border border-white/15">
                    {story.unreadCount}
                  </div>

                  <div className="absolute bottom-2 inset-x-0 flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full overflow-hidden border-[1.5px] border-[#ff4e18] shadow-sm mb-1 bg-black/40">
                      <img
                        src={story.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[11px] font-medium text-white/90 text-center truncate max-w-[76px] leading-tight drop-shadow">
                      {story.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* DYNAMIC FOLDER TABS SYSTEM WITH CREATE/MANAGE MODAL BUTTON */}
          <div className="px-5 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            {folders.map((folder) => {
              const isActive = activeFolderId === folder.id;
              const badge = getFolderBadge(folder);

              return (
                <div key={folder.id} className="relative group shrink-0">
                  <button
                    onClick={() => setActiveFolderId(folder.id)}
                    className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                      isActive
                        ? 'bg-[#ff4e18] text-white shadow-md shadow-[#ff4e18]/25'
                        : 'bg-[#18191f] text-[#8e93a0] hover:text-white hover:bg-[#20222a] border border-white/5'
                    }`}
                  >
                    <span>{folder.name}</span>
                    {badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isActive ? 'bg-black/25 text-white' : 'text-[#686c77]'
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
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#20222c] hover:bg-[#ff4e18] text-white/70 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm border border-white/10 cursor-pointer"
                      title="Edit folder"
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
              className="w-8 h-8 rounded-full bg-[#18191f] hover:bg-[#ff4e18] text-[#8e93a0] hover:text-white hover:shadow-md hover:shadow-[#ff4e18]/25 border border-white/5 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
              title="Add or manage folders"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Chats List Filtered by Active Folder */}
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-24 md:pb-6 space-y-2.5">
            {categoryChats.length === 0 ? (
              /* Empty Folder State */
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in">
                <div className="w-12 h-12 rounded-full bg-[#181922] border border-white/10 flex items-center justify-center text-white/40 mb-3 shadow-inner">
                  <FolderPlus className="w-5 h-5 text-[#ff4e18]" />
                </div>
                <p className="text-sm font-semibold text-white/90">Folder is empty</p>
                <p className="text-xs text-[#828795] mt-1 max-w-[220px]">
                  There are no chats assigned to "{currentFolder.name}" yet.
                </p>
                <button
                  onClick={() => {
                    setEditingFolder(currentFolder);
                    setIsFolderModalOpen(true);
                  }}
                  className="mt-3 px-3.5 py-1.5 rounded-full bg-[#ff4e18] text-white text-xs font-semibold hover:bg-[#ff5d2b] transition shadow-md shadow-[#ff4e18]/25 cursor-pointer"
                >
                  Manage Folder Chats
                </button>
              </div>
            ) : (
              categoryChats.map((chat) => {
                const isSelected = activeChatId === chat.id;
                return (
                <div
                  key={chat.id}
                  onClick={() => handleChatClick(chat.id, chat.isChannel)}
                  className={`group relative border rounded-[22px] p-3.5 transition-all duration-150 cursor-pointer flex items-center gap-3.5 shadow-sm ${
                    isSelected
                      ? 'bg-[#222432] border-[#ff4e18]/60 shadow-lg shadow-[#ff4e18]/15 ring-1 ring-[#ff4e18]/30'
                      : 'bg-[#17181e]/90 hover:bg-[#1e1f27] active:bg-[#23242e] border-white/[0.04]'
                  }`}
                >
                  {/* Avatar Slot */}
                  <div className="relative shrink-0">
                    {chat.isChannel ? (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#dc2626] to-[#ff4e18] flex items-center justify-center text-white shadow-inner font-bold">
                        <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                          <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
                        </svg>
                      </div>
                    ) : chat.groupAvatars ? (
                      <div className="w-12 h-12 rounded-full bg-[#20222a] relative overflow-hidden border border-white/10 flex items-center justify-center">
                        <div className="absolute top-0.5 left-1 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                          <img src={chat.groupAvatars[0]} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute top-0.5 right-1 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                          <img src={chat.groupAvatars[1]} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute bottom-0.5 left-3 w-6 h-6 rounded-full overflow-hidden border border-[#17181e]">
                          <img src={chat.groupAvatars[2]} alt="" className="w-full h-full object-cover" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-[#20222a] relative">
                        <img
                          src={chat.avatar}
                          alt={chat.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="w-full h-full bg-[#232530] flex items-center justify-center text-xs font-bold text-white/70">
                          {chat.name.slice(0, 2).toUpperCase()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Middle Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <h2 className="font-semibold text-white text-[15px] truncate tracking-tight group-hover:text-[#ff4e18] transition-colors">
                          {chat.name}
                        </h2>
                      </div>
                      <span className="text-[11px] text-[#717682] font-normal shrink-0 ml-2">
                        {chat.time}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[13px] text-[#868b98] truncate font-normal leading-snug pr-2">
                        {chat.snippet}
                      </p>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {chat.isPinned && (
                          <div className="text-white/40">
                            <Pin className="w-3.5 h-3.5 fill-current rotate-45" />
                          </div>
                        )}
                        {chat.unreadCount && (
                          <div className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#ff4e18] text-white text-[11px] font-bold flex items-center justify-center shadow-md shadow-[#ff4e18]/30">
                            {chat.unreadCount}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </>
    )}

      {/* Floating Bottom Navigation Bar */}
      <div className="absolute bottom-5 inset-x-0 flex justify-center z-30 pointer-events-none md:hidden">
        <div className="bg-[#181921]/90 backdrop-blur-xl border border-white/10 rounded-full px-5 py-2.5 flex items-center gap-7 shadow-2xl shadow-black/80 pointer-events-auto">
          <button
            onClick={() => setActiveFolderId('all')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer active:scale-90 transition ${
              activeFolderId === 'all' ? 'text-[#ff4e18]' : 'text-white/50 hover:text-white'
            }`}
          >
            <MessageSquare className="w-5 h-5 fill-current" />
            <span className="text-[9px] font-bold">Chats</span>
          </button>

          <button
            onClick={onOpenChannel}
            className="flex flex-col items-center gap-0.5 text-white/50 hover:text-white cursor-pointer active:scale-90 transition"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-[9px] font-medium">Channel</span>
          </button>

          <button
            onClick={() => {
              setEditingFolder(null);
              setIsFolderModalOpen(true);
            }}
            className="flex flex-col items-center gap-0.5 text-white/50 hover:text-white cursor-pointer active:scale-90 transition"
          >
            <Folder className="w-5 h-5" />
            <span className="text-[9px] font-medium">Folders</span>
          </button>

          <button
            onClick={onOpenProfile}
            className="flex flex-col items-center gap-0.5 text-white/50 hover:text-white cursor-pointer active:scale-90 transition"
          >
            <Users className="w-5 h-5" />
            <span className="text-[9px] font-medium">Profile</span>
          </button>
        </div>
      </div>

      {/* Story Viewer Modal */}
      {activeStory && (
        <div
          onClick={() => setActiveStory(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 cursor-pointer animate-in fade-in"
        >
          <div className="w-full flex items-center justify-between pt-2 px-2 z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden border border-white/20">
                <img src={activeStory.avatar} alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">{activeStory.name}</p>
                <p className="text-[10px] text-white/60">2 hours ago</p>
              </div>
            </div>
            <button
              onClick={() => setActiveStory(null)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>

          <div className="relative flex-1 flex items-center justify-center my-auto max-w-sm mx-auto overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <img src={activeStory.coverImage} alt="" className="w-full h-auto max-h-[70vh] object-cover" />
          </div>

          <div className="w-full max-w-sm mx-auto pb-4 px-2 z-10">
            <div className="bg-white/10 backdrop-blur-md rounded-full px-4 py-2 flex items-center justify-between text-xs text-white/70">
              <span>Reply to {activeStory.name}...</span>
              <span className="text-lg">🔥</span>
            </div>
          </div>
        </div>
      )}

      {/* New Conversation Modal */}
      {newChatModalOpen && (
        <div
          onClick={() => setNewChatModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#181922] border border-white/10 rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4"
          >
            <h3 className="font-bold text-base text-white">Start New Conversation</h3>
            <p className="text-xs text-[#8c919d]">Choose a contact from your address book or create a group:</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setNewChatModalOpen(false);
                  onSelectChat('katie');
                }}
                className="w-full p-2.5 rounded-xl bg-[#20222b] hover:bg-[#ff4e18] text-white text-xs font-semibold flex items-center gap-2.5 transition text-left"
              >
                <div className="w-6 h-6 rounded-full bg-[#ff4e18] flex items-center justify-center text-[10px]">
                  KR
                </div>
                <span>Katie Rogers</span>
              </button>
              <button
                onClick={() => {
                  setNewChatModalOpen(false);
                  onOpenChannel();
                }}
                className="w-full p-2.5 rounded-xl bg-[#20222b] hover:bg-[#ff4e18] text-white text-xs font-semibold flex items-center gap-2.5 transition text-left"
              >
                <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-[10px]">
                  CH
                </div>
                <span>Real Kyiv Life Channel</span>
              </button>
            </div>
            <button
              onClick={() => setNewChatModalOpen(false)}
              className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/70 font-semibold text-xs rounded-xl transition"
            >
              Cancel
            </button>
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
    </div>
  );
};
