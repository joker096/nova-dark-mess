import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Paperclip, Send, Mic, Smile, X, ChevronDown, Search, MoreHorizontal } from 'lucide-react';
import {
  CONVERSATION_HISTORIES,
  appendConversationHistory,
  MOCK_CHATS,
} from '../data/mockMessengerData';
import { ChatMessage } from '../types/messenger';
import { VirtualizedList } from './VirtualizedList';
import { LazyMedia } from './LazyMedia';
import { renderMarkdown } from '../lib/markdown';
import { NovaNavBar, NovaMessage, NovaComposer, NovaDateSeparator, NovaReactionChips, NovaAvatar, NovaBadge } from '../lib/ui';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { useAccount } from '../hooks/useAccount';
import { formatCount } from '../lib/ui/formatCount';
import { markChatRead } from '../lib/messaging/unread';

interface ChatScreenV2Props {
  chatId: string;
  onBack: () => void;
  onOpenProfile: () => void;
}

const EMOJI_OPTIONS = ['❤️', '👍', '🔥', '😂', '😱', '👏', '🥰', '🎉'];

export const ChatScreenV2: React.FC<ChatScreenV2Props> = ({
  chatId,
  onBack,
  onOpenProfile,
}) => {
  const { t } = useLanguage();
  const { encryptAndSendMessage, identity } = useSecurity();
  const { account } = useAccount();
  const chatItem = MOCK_CHATS.find((item) => item.id === chatId);
  const isGroupChat = chatItem?.type === 'group';

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return (CONVERSATION_HISTORIES[chatId] || CONVERSATION_HISTORIES['katie']).map((msg, idx) => {
      if (idx === 1) {
        return {
          ...msg,
          reactions: [
            { emoji: '🔥', count: 2, fromMe: false },
            { emoji: '❤️', count: 1, fromMe: true },
          ],
        };
      }
      return msg;
    });
  });

  const [inputText, setInputText] = useState('');
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const profile = chatItem ? {
    name: chatItem.name,
    avatar: chatItem.avatar,
    status: 'online',
  } : {
    name: 'Contact',
    avatar: '',
    status: 'online',
  };

  const isProfileOnline = true;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    markChatRead(chatId);
  }, [chatId]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const messageId = 'm-' + Date.now();
    const newMessage: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text: inputText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      isRead: false,
    };
    setMessages((prev) => [...prev, newMessage]);
    appendConversationHistory(chatId, [newMessage]);
    setInputText('');
    setShowEmojiPicker(false);
    encryptAndSendMessage(chatId, inputText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReactionClick = (messageId: string, emoji: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions = msg.reactions || [];
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing) {
          if (existing.fromMe) {
            return {
              ...msg,
              reactions: reactions.map((r) =>
                r.emoji === emoji ? { ...r, count: r.count - 1, fromMe: false } : r
              ).filter((r) => r.count > 0),
            };
          } else {
            return {
              ...msg,
              reactions: reactions.map((r) =>
                r.emoji === emoji ? { ...r, count: r.count + 1, fromMe: true } : r
              ),
            };
          }
        } else {
          return {
            ...msg,
            reactions: [...reactions, { emoji, count: 1, fromMe: true }],
          };
        }
      })
    );
    setActiveReactionMsgId(null);
  };

  const handleReply = (message: ChatMessage) => {
    setReplyingTo(message);
  };

  const handleEdit = (message: ChatMessage) => {
    setEditingMsgId(message.id);
    setEditingText(message.text);
  };

  const handleSaveEdit = () => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === editingMsgId ? { ...msg, text: editingText, editedAt: Date.now() } : msg
      )
    );
    setEditingMsgId(null);
    setEditingText('');
  };

  const handleDelete = (messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleAvatarClick = () => {
    onOpenProfile();
  };

  const groupedMessages = useMemo(() => {
    const groups: { senderId: string; messages: ChatMessage[] }[] = [];
    let currentGroup: { senderId: string; messages: ChatMessage[] } | null = null;

    for (const msg of messages) {
      if (currentGroup && currentGroup.senderId === msg.senderId) {
        currentGroup.messages.push(msg);
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { senderId: msg.senderId, messages: [msg] };
      }
    }
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [messages]);

  const dateGroups = useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = '';
    let currentGroup: { date: string; messages: ChatMessage[] } | null = null;

    for (const msg of messages) {
      const msgDate = new Date(msg.createdAt || Date.now()).toDateString();
      if (currentGroup && currentGroup.date === msgDate) {
        currentGroup.messages.push(msg);
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { date: msgDate, messages: [msg] };
      }
    }
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-screen)]">
      <NovaNavBar
        showBack
        onBack={onBack}
        backLabel={t('common.back')}
        title={profile.name}
        right={
          <button
            onClick={onOpenProfile}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-control-primary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-field)] transition-colors"
            aria-label={t('common.profile')}
          >
            <NovaAvatar
              src={profile.avatar}
              alt={profile.name}
              name={profile.name}
              size="s"
              status={isProfileOnline ? 'online' : 'offline'}
              showStatus
            />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-[var(--space-screen)] space-y-4">
        {dateGroups.map((dateGroup, dateIndex) => (
          <React.Fragment key={dateGroup.date}>
            <NovaDateSeparator date={dateGroup.date} format="relative" sticky />
            {dateGroup.messages.map((message, msgIndex) => {
              const isOwn = message.senderId === 'me';
              const showAvatar = msgIndex === 0;
              const grouped = msgIndex > 0;

              return (
                <NovaMessage
                  key={message.id}
                  senderId={message.senderId}
                  senderName={isOwn ? 'You' : profile.name}
                  senderAvatar={profile.avatar}
                  time={message.time}
                  text={message.text}
                  reactions={message.reactions}
                  isOwn
                  showAvatar
                  grouped
                  onReactionClick={(emoji) => handleReactionClick(message.id, emoji)}
                  onAvatarClick={handleAvatarClick}
                  onTextClick={() => setActiveReactionMsgId(message.id)}
                />
              );
            })}
          </React.Fragment>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <NovaComposer
        value={inputText}
        onChange={setInputText}
        onSend={handleSend}
        onAttach={() => {}}
        onVoiceStart={() => {}}
        onVoiceEnd={() => {}}
        onEmojiClick={() => setShowEmojiPicker(!showEmojiPicker)}
        placeholder={t('chat.placeholder')}
        replyTo={replyingTo ? {
          id: replyingTo.id,
          name: replyingTo.senderId === 'me' ? 'You' : profile.name,
          text: replyingTo.text,
          isOwn: replyingTo.senderId === 'me',
        } : null}
        onCancelReply={() => setReplyingTo(null)}
        editingMessage={editingMsgId ? { id: editingMsgId, text: editingText } : null}
        onCancelEdit={() => {
          setEditingMsgId(null);
          setEditingText('');
        }}
      />

      {showEmojiPicker && (
        <div className="px-[var(--space-screen)] pb-3 bg-[var(--bg-screen)] border-t border-[var(--border-divider)]">
          <div className="flex flex-wrap gap-1 justify-center">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInputText(inputText + emoji);
                  setShowEmojiPicker(false);
                }}
                className="w-10 h-10 rounded-full text-2xl bg-[var(--bg-field)] hover:scale-110 transition-transform"
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};