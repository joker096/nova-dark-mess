import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useWheelScroll } from '../lib/ui/useWheelScroll';
import {
  ArrowLeft,
  Paperclip,
  Send,
  Mic,
  Check,
  CheckCheck,
  Copy,
  Reply,
  Pin,
  PinOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ListFilter,
  X,
  Palette,
  Search,
  Clock,
  Video,
  Image as ImageIcon,
  Smile,
  Heart,
  Sparkles,
  MapPin,
  FileText,
  Camera,
  Download,
  Forward,
  Lock,
  BarChart2,
} from 'lucide-react';
import { CONVERSATION_HISTORIES, CONTACT_PROFILES, KATIE_SHARED_MEDIA, MOCK_CHATS, CURRENT_USER } from '../data/mockMessengerData';
import { ChatMessage, VoiceNoteData, DocumentAttachment, PollData, StickerData, LocationData } from '../types/messenger';
import { DoodleBackground } from './DoodleBackground';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { VoiceMemoInput, VoiceMemoInputHandle } from './VoiceMemoInput';
import { WallpaperSettingsModal } from './WallpaperSettingsModal';
import { ScheduleMessageModal } from './ScheduleMessageModal';
import { VideoCallOverlay } from './VideoCallOverlay';
import { SharedMediaSection } from './SharedMediaSection';
import { FileSelectionModal } from './FileSelectionModal';
import { PollCreateModal } from './PollCreateModal';
import { PollBubble } from './chat/PollBubble';
import { LocationPickerModal } from './LocationPickerModal';
import { LocationBubble } from './chat/LocationBubble';
import { StickerPickerDrawer } from './chat/StickerPickerDrawer';
import {
  WALLPAPER_OPTIONS,
  WALLPAPER_STORAGE_KEY,
  WALLPAPER_INTENSITY_KEY,
  WallpaperId,
} from '../data/wallpapers';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { usePremium } from '../hooks/usePremium';

interface ChatScreenProps {
  chatId: string;
  onBack: () => void;
  onOpenProfile: () => void;
}

interface ScheduledMessageItem {
  id: string;
  text?: string;
  voiceNote?: VoiceNoteData;
  targetTimestamp: number;
  formattedTime: string;
}

const EMOJI_OPTIONS = ['❤️', '👍', '🔥', '😂', '😱', '👏', '🥰', '🎉'];
const QUICK_SEARCH_CHIPS = ["Harry's", 'Sunday', 'hang out', 'Rebecca', 'photos', 'dinner', 'voice', 'remember'];

// Premium outgoing bubble themes (additive — default theme keeps the current design untouched)
const PREMIUM_THEMES: Record<string, { label: string; grad: string; shadow: string; border: string }> = {
  default: { label: 'Default', grad: 'from-[var(--nova-accent-color, #ff521a)] to-[var(--nova-accent-color, #ff3b00)]', shadow: 'shadow-[var(--nova-accent-color, #ff4e18)]/25', border: 'border-[var(--nova-accent-color, #ff4e18)]/45' },
  sapphire: { label: 'Sapphire', grad: 'from-[#1E3A8A] to-[#3B82F6]', shadow: 'shadow-[#3B82F6]/25', border: 'border-[#3B82F6]/60' },
  amethyst: { label: 'Amethyst', grad: 'from-[#4C1D95] to-[#8B5CF6]', shadow: 'shadow-[#8B5CF6]/25', border: 'border-[#8B5CF6]/60' },
  emerald: { label: 'Emerald', grad: 'from-[#064E3B] to-[#10B981]', shadow: 'shadow-[#10B981]/25', border: 'border-[#10B981]/60' },
};
const CHAT_THEME_KEY = 'nova_chat_theme';

export const ChatScreen: React.FC<ChatScreenProps> = ({ chatId, onBack, onOpenProfile }) => {
  const { t } = useLanguage();
  const { encryptAndSendMessage } = useSecurity();
  const { checkout, canUse } = usePremium();
  const profile = CONTACT_PROFILES[chatId] || CONTACT_PROFILES['katie'];
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

  useEffect(() => {
    setMessages((CONVERSATION_HISTORIES[chatId] || CONVERSATION_HISTORIES['katie']).map((msg, idx) => {
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
    }));
  }, [chatId]);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingActivity, setTypingActivity] = useState<'typing' | 'recording'>('typing');
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Premium chat theme (persisted). 'default' keeps the existing design exactly as-is.
  const [chatTheme, setChatTheme] = useState<'default' | 'sapphire' | 'amethyst' | 'emerald'>(() => {
    try {
      const saved = localStorage.getItem(CHAT_THEME_KEY) as
        | 'default' | 'sapphire' | 'amethyst' | 'emerald'
        | undefined;
      return saved && Object.prototype.hasOwnProperty.call(PREMIUM_THEMES, saved) ? saved : 'default';
    } catch {
      return 'default';
    }
  });

  const theme = PREMIUM_THEMES[chatTheme];

  // Sync chat colour theme to global accent CSS variable (menu icons, highlights, etc.)
  useEffect(() => {
    const ACCENT_COLORS: Record<'default' | 'sapphire' | 'amethyst' | 'emerald', string> = {
      default: '#ff4e18',
      sapphire: '#3B82F6',
      amethyst: '#8B5CF6',
      emerald: '#10B981',
    };
    const root = document.documentElement;
    root.style.setProperty('--nova-accent-color', ACCENT_COLORS[chatTheme]);
    try {
      localStorage.setItem('nova_accent_color', ACCENT_COLORS[chatTheme]);
    } catch {
      void 0;
    }
  }, [chatTheme]);

  // In-chat search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [searchFilterMode, setSearchFilterMode] = useState<'context' | 'filtered'>('context');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Wallpaper theme state persisting to localStorage
  const [wallpaperId, setWallpaperId] = useState<WallpaperId>(() => {
    try {
      const saved = localStorage.getItem(WALLPAPER_STORAGE_KEY) as WallpaperId;
      if (saved && WALLPAPER_OPTIONS.some((o) => o.id === saved)) {
        return saved;
      }
    } catch {
      void 0;
    }
    return 'neon-nebula';
  });
  const [wallpaperIntensity, setWallpaperIntensity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(WALLPAPER_INTENSITY_KEY);
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 20 && val <= 100) return val;
      }
    } catch {
      void 0;
    }
    return 70;
  });
  const [isWallpaperModalOpen, setIsWallpaperModalOpen] = useState(false);
  const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
  const [isVideoCallMinimized, setIsVideoCallMinimized] = useState(false);

  // Pinned Messages Carousel State
  const [isPinnedCarouselOpen, setIsPinnedCarouselOpen] = useState(false);
  const [currentPinIndex, setCurrentPinIndex] = useState(0);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [pinnedToast, setPinnedToast] = useState<string | null>(null);
  const [activeHeaderTab, setActiveHeaderTab] = useState<'chat' | 'gallery'>('chat');
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isStickerDrawerOpen, setIsStickerDrawerOpen] = useState(false);
  const [stagedAttachment, setStagedAttachment] = useState<{
    images?: string[];
    document?: DocumentAttachment;
  } | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [dismissedSmartReplyMsgId, setDismissedSmartReplyMsgId] = useState<string | null>(null);

  // Forward / Multi-select state
  const [isForwardSelecting, setIsForwardSelecting] = useState(false);
  const [forwardSelectedIds, setForwardSelectedIds] = useState<Set<string>>(new Set());
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);

  // Scheduled Messages State
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessageItem[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const sendLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSendLongPressTriggeredRef = useRef(false);

  // Voice recording & waveform staging states
  const voiceMemoRef = useRef<VoiceMemoInputHandle>(null);
  const [recordedVoiceNote, setRecordedVoiceNote] = useState<VoiceNoteData | null>(null);

  // Swipe-to-reply gesture states
  const [swipingMsgId, setSwipingMsgId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const swipeTriggeredRef = useRef(false);
  const swipeOffsetRef = useRef(0);
  const swipingMsgIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const mainInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressFiredRef = useRef(false);
  const pointerStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const quickSearchChipsRef = useWheelScroll();
  const attachmentMenuRef = useWheelScroll();
  const emojiBarRef = useWheelScroll();
  const smartRepliesRef = useWheelScroll();



  const pinnedMessages = messages.filter((m) => m.isPinned);

  const scrollToBottom = () => {
    if (!searchQuery.trim()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, recordedVoiceNote]);

  // Scheduled Messages Delivery Loop: checks every second
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setScheduledMessages((prev) => {
        const readyToSend = prev.filter((item) => item.targetTimestamp <= now);
        if (readyToSend.length === 0) return prev;

        readyToSend.forEach((item) => {
          const messageId = 'm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
          const newMsg: ChatMessage = {
            id: messageId,
            senderId: 'me',
            text: item.text,
            voiceNote: item.voiceNote,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRead: false,
          };

          setMessages((msgs) => [...msgs, newMsg]);
          triggerPinnedToast(
            `Scheduled message sent: "${item.text?.slice(0, 24) || 'Voice note'}"`
          );

          // Simulated recipient read receipt: transitions to double checks
          setTimeout(() => {
            setMessages((msgs) =>
              msgs.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
            );
          }, 600);

          // Simulate Katie's real-time reply
          setTimeout(() => {
            setTypingActivity('typing');
            setIsTyping(true);
          }, 850);

          setTimeout(() => {
            setIsTyping(false);
            setTypingActivity('typing');
            setMessages((msgs) => [
              ...msgs,
              {
                id: 'm-' + (Date.now() + 1),
                senderId: 'other',
                text: "Got your message! Perfect timing, talk to you soon 🙌",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
          }, 2700);
        });

        return prev.filter((item) => item.targetTimestamp > now);
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Focus search input when search mode opens
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isSearchOpen]);

  // Keep currentPinIndex within bounds when pinnedMessages changes
  useEffect(() => {
    if (currentPinIndex >= pinnedMessages.length && pinnedMessages.length > 0) {
      setCurrentPinIndex(pinnedMessages.length - 1);
    }
  }, [pinnedMessages.length, currentPinIndex]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (sendLongPressTimerRef.current) clearTimeout(sendLongPressTimerRef.current);
    };
  }, []);

  // Escape dismisses transient gesture-driven overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (activeReactionMsgId) {
        setActiveReactionMsgId(null);
      } else if (isAttachmentMenuOpen) {
        setIsAttachmentMenuOpen(false);
      } else if (isEmojiPickerOpen) {
        setIsEmojiPickerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeReactionMsgId, isAttachmentMenuOpen, isEmojiPickerOpen]);

  const triggerPinnedToast = (text: string) => {
    setPinnedToast(text);
    setTimeout(() => setPinnedToast(null), 2200);
  };

  // Matching messages based on search query
  const matchingMessages = messages.filter((msg) => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase().trim();

    if (msg.text && msg.text.toLowerCase().includes(q)) return true;
    if (msg.pinnedNote && msg.pinnedNote.toLowerCase().includes(q)) return true;
    if (
      msg.voiceNote &&
      (q.includes('voice') ||
        q.includes('audio') ||
        q.includes('голосовое') ||
        msg.voiceNote.duration.includes(q))
    ) {
      return true;
    }
    if (
      msg.images &&
      (q.includes('photo') ||
        q.includes('image') ||
        q.includes('фото') ||
        q.includes('pic'))
    ) {
      return true;
    }
    return false;
  });

  // Displayed messages: in 'filtered' mode, only matches are shown. In 'context' mode, the full timeline is shown.
  const displayedMessages =
    isSearchOpen && searchQuery.trim() && searchFilterMode === 'filtered'
      ? matchingMessages
      : messages;

  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => {
        setHighlightedMsgId((curr) => (curr === msgId ? null : curr));
      }, 2200);
    }
  };

  const handleNextMatch = () => {
    if (matchingMessages.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % matchingMessages.length;
    setActiveMatchIndex(nextIdx);
    scrollToMessage(matchingMessages[nextIdx].id);
  };

  const handlePrevMatch = () => {
    if (matchingMessages.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + matchingMessages.length) % matchingMessages.length;
    setActiveMatchIndex(prevIdx);
    scrollToMessage(matchingMessages[prevIdx].id);
  };

  const handleSelectSearchQuery = (query: string) => {
    setSearchQuery(query);
    setActiveMatchIndex(0);
    setTimeout(() => {
      const match = messages.find((m) => {
        const q = query.toLowerCase().trim();
        return (
          (m.text && m.text.toLowerCase().includes(q)) ||
          (m.pinnedNote && m.pinnedNote.toLowerCase().includes(q))
        );
      });
      if (match) {
        scrollToMessage(match.id);
      }
    }, 60);
  };

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveMatchIndex(0);
    setSearchFilterMode('context');
  };

  // Scroll to first match whenever search query changes
  useEffect(() => {
    if (isSearchOpen && searchQuery.trim() && matchingMessages.length > 0) {
      setActiveMatchIndex(0);
      scrollToMessage(matchingMessages[0].id);
    }
  }, [searchQuery, isSearchOpen]);

  // Highlight matched search terms inside message text and captions
  const highlightMatchedText = (
    text?: string,
    query?: string,
    isActiveMessageMatch?: boolean
  ): React.ReactNode => {
    if (!text) return null;
    if (!query || !query.trim()) return text;

    const q = query.trim().toLowerCase();
    const index = text.toLowerCase().indexOf(q);
    if (index === -1) return text;

    const before = text.substring(0, index);
    const match = text.substring(index, index + q.length);
    const after = text.substring(index + q.length);

    return (
      <>
        {before}
        <mark
          className={
            isActiveMessageMatch
              ? 'bg-gradient-to-r from-[#ff551d] to-[#ff3800] text-white font-bold rounded px-1.5 py-0.5 shadow-[0_0_14px_rgba(255,78,24,0.9)] ring-1 ring-white/90 scale-105 inline-block transition-transform duration-200'
              : 'bg-[var(--nova-accent-color, #ff4e18)]/35 text-white font-semibold rounded px-1 py-0.5 border border-[var(--nova-accent-color, #ff4e18)]/40'
          }
        >
          {match}
        </mark>
        {highlightMatchedText(after, query, isActiveMessageMatch)}
      </>
    );
  };

  // Wallpaper Handlers
  const handleSelectWallpaper = (id: WallpaperId) => {
    setWallpaperId(id);
    try {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, id);
    } catch {
      void 0;
    }
    const item = WALLPAPER_OPTIONS.find((o) => o.id === id);
    triggerPinnedToast(`Wallpaper: ${item?.name || id}`);
  };

  const handleIntensityChange = (intensity: number) => {
    setWallpaperIntensity(intensity);
    try {
      localStorage.setItem(WALLPAPER_INTENSITY_KEY, intensity.toString());
    } catch {
      void 0;
    }
  };

  const handleCycleWallpaper = () => {
    const currentIndex = WALLPAPER_OPTIONS.findIndex((o) => o.id === wallpaperId);
    const nextIndex = (currentIndex + 1) % WALLPAPER_OPTIONS.length;
    const nextId = WALLPAPER_OPTIONS[nextIndex].id;
    handleSelectWallpaper(nextId);
  };

  // Video Call Handlers
  const handleStartVideoCall = () => {
    setIsVideoCallOpen(true);
    setIsVideoCallMinimized(false);
    triggerPinnedToast(`Starting video call with ${profile.name}...`);
  };

  const handleEndVideoCall = (durationFormatted: string) => {
    setIsVideoCallOpen(false);
    setIsVideoCallMinimized(false);
    triggerPinnedToast(`Video call ended • ${durationFormatted}`);

    // Add a record to chat history
    const callRecordMsg: ChatMessage = {
      id: 'call-' + Date.now(),
      senderId: 'me',
      text: `📹 Video call with ${profile.name.split(' ')[0]} • Duration: ${durationFormatted}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: true,
    };
    setMessages((prev) => [...prev, callRecordMsg]);
  };

  // Pinned Messages Handlers
  const handleTogglePinMessage = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === msgId) {
          const nextState = !m.isPinned;
          triggerPinnedToast(nextState ? 'Message pinned to header' : 'Message unpinned');
          return { ...m, isPinned: nextState };
        }
        return m;
      })
    );
    setActiveReactionMsgId(null);
  };

  const handleUnpinMessage = (msgId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, isPinned: false } : m))
    );
    triggerPinnedToast('Message unpinned');
  };

  const handlePrevPin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPinIndex((prev) => (prev > 0 ? prev - 1 : pinnedMessages.length - 1));
  };

  const handleNextPin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPinIndex((prev) => (prev < pinnedMessages.length - 1 ? prev + 1 : 0));
  };

  const handleJumpToMessage = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => setHighlightedMsgId(null), 2400);
    }
  };

  // Send Button Long Press for Scheduling Handlers
  const handleSendPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isSendLongPressTriggeredRef.current = false;
    sendLongPressTimerRef.current = setTimeout(() => {
      isSendLongPressTriggeredRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      setIsScheduleModalOpen(true);
    }, 450);
  };

  const handleSendPointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (sendLongPressTimerRef.current) {
      clearTimeout(sendLongPressTimerRef.current);
      sendLongPressTimerRef.current = null;
    }
    if (!isSendLongPressTriggeredRef.current) {
      handleSendMessage();
    }
  };

  const handleSendPointerCancel = () => {
    if (sendLongPressTimerRef.current) {
      clearTimeout(sendLongPressTimerRef.current);
      sendLongPressTimerRef.current = null;
    }
  };

  const handleScheduleMessage = (targetDate: Date, formattedTime: string) => {
    const text = inputText.trim();
    if (!text && !recordedVoiceNote) return;

    const newItem: ScheduledMessageItem = {
      id: 'sched-' + Date.now(),
      text: text || undefined,
      voiceNote: recordedVoiceNote || undefined,
      targetTimestamp: targetDate.getTime(),
      formattedTime,
    };

    setScheduledMessages((prev) => [...prev, newItem]);
    setInputText('');
    setRecordedVoiceNote(null);
    triggerPinnedToast(`Message scheduled (${formattedTime})`);
  };

  // Voice Recording Handlers
  const handleSendVoiceNote = (customNote?: VoiceNoteData) => {
    const noteToSend = customNote || recordedVoiceNote;
    if (!noteToSend) return;

    const messageId = 'm-' + Date.now();
    const newMessage: ChatMessage = {
      id: messageId,
      senderId: 'me',
      voiceNote: noteToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: replyingTo.senderId === 'me' ? 'You' : profile.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    setRecordedVoiceNote(null);
    setReplyingTo(null);

    // Transition read status after 1.8s
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 500);

    const shouldVoiceReply = Math.random() > 0.4;
    setTimeout(() => {
      setTypingActivity(shouldVoiceReply ? 'recording' : 'typing');
      setIsTyping(true);
    }, 750);

    setTimeout(() => {
      setIsTyping(false);
      setTypingActivity('typing');
      if (shouldVoiceReply) {
        setMessages((prev) => [
          ...prev,
          {
            id: 'm-' + (Date.now() + 1),
            senderId: 'other',
            voiceNote: {
              duration: '0:12',
              durationSeconds: 12,
              waveform: [30, 45, 70, 95, 80, 60, 40, 75, 90, 85, 65, 50, 70, 85, 60, 45, 30, 20],
            },
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: 'm-' + (Date.now() + 1),
            senderId: 'other',
            text: "Got your voice message! Sounds great, let's meet up soon!",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    }, 2800);
  };

  const handleTriggerIncomingVoiceNote = () => {
    if (isTyping) return;
    setTypingActivity('recording');
    setIsTyping(true);
    triggerPinnedToast(`${profile.name} is recording an audio note...`);
    setTimeout(() => {
      setIsTyping(false);
      setTypingActivity('typing');
      setMessages((prev) => [
        ...prev,
        {
          id: 'm-katie-voice-' + Date.now(),
          senderId: 'other',
          voiceNote: {
            duration: '0:16',
            durationSeconds: 16,
            waveform: [25, 40, 60, 85, 90, 75, 50, 65, 95, 100, 70, 55, 45, 60, 80, 90, 65, 45, 30, 20],
          },
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 2200);
  };

  const handleSimulateTypingActivity = (activityType: 'typing' | 'recording' = 'typing') => {
    if (isTyping) return;
    setTypingActivity(activityType);
    setIsTyping(true);
    triggerPinnedToast(
      activityType === 'recording'
        ? `${profile.name} is recording audio...`
        : `${profile.name} is typing in real time...`
    );

    setTimeout(() => {
      setIsTyping(false);
      setTypingActivity('typing');

      if (activityType === 'recording') {
        setMessages((prev) => [
          ...prev,
          {
            id: 'm-katie-voice-' + Date.now(),
            senderId: 'other',
            voiceNote: {
              duration: '0:12',
              durationSeconds: 12,
              waveform: [30, 45, 70, 90, 85, 65, 50, 75, 95, 80, 60, 45, 35, 20],
            },
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        const spontaneousMsgs = [
          "Hey! Are you still down for that coffee this Sunday?",
          "By the way, John just texted me — he's bringing Rebecca too! 🎉",
          "Sounds great, let's catch up then! Talk soon 🙌",
          "Deal! I'll see you at Harry's at 7pm.",
        ];
        const randomText = spontaneousMsgs[Math.floor(Math.random() * spontaneousMsgs.length)];
        setMessages((prev) => [
          ...prev,
          {
            id: 'm-spontaneous-' + Date.now(),
            senderId: 'other',
            text: randomText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    }, 2400);
  };

  // Pointer, Swipe-to-Reply & Double-tap Handlers
  const isInteractiveGestureTarget = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    target.closest('button, a, input, textarea, select, [role="button"]') !== null;

  const resetSwipeState = () => {
    swipeOffsetRef.current = 0;
    setSwipeOffset(0);
    swipingMsgIdRef.current = null;
    setSwipingMsgId(null);
    isDraggingRef.current = false;
    swipeTriggeredRef.current = false;
  };

  const handlePointerDown = (e: React.PointerEvent, msgId: string) => {
    if (e.button !== 0) return;
    if (isInteractiveGestureTarget(e.target)) return;

    // Forward-select mode uses taps only; suppress long-press and swipe gestures.
    if (isForwardSelecting) {
      pointerStartPosRef.current = null;
      return;
    }

    if (swipingMsgIdRef.current && swipingMsgIdRef.current !== msgId) {
      resetSwipeState();
    }

    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    swipeOffsetRef.current = 0;
    swipeTriggeredRef.current = false;
    isDraggingRef.current = false;
    isLongPressFiredRef.current = false;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      void 0;
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current) {
        isLongPressFiredRef.current = true;
        setActiveReactionMsgId(msgId);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(40);
        }
      }
    }, 400);
  };

  const handlePointerMove = (e: React.PointerEvent, msg: ChatMessage) => {
    if (!pointerStartPosRef.current) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    if (isForwardSelecting) return;

    const dx = e.clientX - pointerStartPosRef.current.x;
    const dy = e.clientY - pointerStartPosRef.current.y;

    // Detect horizontal swipe to the right
    if (dx > 8 && Math.abs(dx) > Math.abs(dy)) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      isDraggingRef.current = true;
      const maxOffset = 76;
      const dampedOffset = Math.min(maxOffset, Math.max(0, dx * 0.58));

      swipingMsgIdRef.current = msg.id;
      setSwipingMsgId(msg.id);
      swipeOffsetRef.current = dampedOffset;
      setSwipeOffset(dampedOffset);

      // Trigger threshold haptic when crossing 42px
      if (dampedOffset >= 42 && !swipeTriggeredRef.current) {
        swipeTriggeredRef.current = true;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(35);
        }
      } else if (dampedOffset < 42 && swipeTriggeredRef.current) {
        swipeTriggeredRef.current = false;
      }
    } else if (Math.abs(dy) > 10 && !isDraggingRef.current) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent, msg: ChatMessage) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const fromInteractiveChild = isInteractiveGestureTarget(e.target);
    pointerStartPosRef.current = null;

    if (isLongPressFiredRef.current) {
      isLongPressFiredRef.current = false;
      isDraggingRef.current = false;
      return;
    }

    const swipedMsgId = swipingMsgIdRef.current;
    const finalOffset = swipeOffsetRef.current;
    const wasDragging = isDraggingRef.current;

    if (wasDragging && swipedMsgId === msg.id) {
      const shouldReply = finalOffset >= 42 && !isForwardSelecting && !fromInteractiveChild;
      if (shouldReply) {
        handleReplyMessage(msg);
        triggerPinnedToast(`Replying to ${msg.senderId === 'me' ? 'myself' : profile.name}`);
        setTimeout(() => {
          mainInputRef.current?.focus();
        }, 80);
      }
      swipeOffsetRef.current = 0;
      setSwipeOffset(0);
      setTimeout(() => {
        swipingMsgIdRef.current = null;
        setSwipingMsgId(null);
      }, 250);
      isDraggingRef.current = false;
      return;
    }

    isDraggingRef.current = false;

    if (fromInteractiveChild) return;

    // Forward-selecting mode: toggle selection on tap
    if (isForwardSelecting) {
      handleToggleForwardSelect(msg.id);
      return;
    }

    // Double-tap detection
    const now = Date.now();
    const prev = lastTapRef.current;
    if (prev.id === msg.id && now - prev.time < 320) {
      setActiveReactionMsgId(msg.id);
      lastTapRef.current = { id: '', time: 0 };
    } else {
      lastTapRef.current = { id: msg.id, time: now };
    }
  };

  const handlePointerCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartPosRef.current = null;
    if (isDraggingRef.current) {
      resetSwipeState();
    }
  };

  const handleSelectReaction = (msgId: string, emoji: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId) return msg;

        const existing = msg.reactions || [];
        const existingReaction = existing.find((r) => r.emoji === emoji);

        let updatedReactions;
        if (existingReaction) {
          if (existingReaction.fromMe) {
            if (existingReaction.count <= 1) {
              updatedReactions = existing.filter((r) => r.emoji !== emoji);
            } else {
              updatedReactions = existing.map((r) =>
                r.emoji === emoji ? { ...r, count: r.count - 1, fromMe: false } : r
              );
            }
          } else {
            updatedReactions = existing.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1, fromMe: true } : r
            );
          }
        } else {
          updatedReactions = [...existing, { emoji, count: 1, fromMe: true }];
        }

        if (existingReaction && existingReaction.fromMe) {
          triggerPinnedToast(`Removed reaction ${emoji}`);
        } else {
          triggerPinnedToast(`Reacted ${emoji}`);
        }

        return { ...msg, reactions: updatedReactions };
      })
    );

    setActiveReactionMsgId(null);
  };

  const handleCopyMessage = (msg: ChatMessage) => {
    if (msg.text) {
      navigator.clipboard.writeText(msg.text);
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId(null), 1800);
    }
    setActiveReactionMsgId(null);
  };

  const handleReplyMessage = (msg: ChatMessage) => {
    setReplyingTo(msg);
    setActiveReactionMsgId(null);
    voiceMemoRef.current?.cancelRecording();
    setIsAttachmentMenuOpen(false);
    setIsEmojiPickerOpen(false);
    const preview = msg.text || (msg.voiceNote ? `Voice message (${msg.voiceNote.duration})` : 'Photo attachment');
    const sender = msg.senderId === 'me' ? 'myself' : profile.name;
    triggerPinnedToast(`Replying to ${sender}: "${preview.slice(0, 26)}${preview.length > 26 ? '...' : ''}"`);
    setHighlightedMsgId(msg.id);
    setTimeout(() => {
      mainInputRef.current?.focus();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  // Forward handlers
  const handleStartForward = (msgId: string) => {
    setActiveReactionMsgId(null);
    setIsForwardSelecting(true);
    setForwardSelectedIds(new Set([msgId]));
    triggerPinnedToast('Selecting messages to forward');
  };

  const handleToggleForwardSelect = (msgId: string) => {
    setForwardSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
        if (next.size === 0) {
          setIsForwardSelecting(false);
        }
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const handleCancelForward = () => {
    setIsForwardSelecting(false);
    setForwardSelectedIds(new Set());
    triggerPinnedToast('Forward selection cancelled');
  };

  const handleOpenForwardModal = () => {
    if (forwardSelectedIds.size === 0) {
      setIsForwardSelecting(false);
      return;
    }
    setIsForwardModalOpen(true);
  };

  const handleForwardToChat = (targetChatId: string) => {
    const selectedMsgs = messages.filter((m) => forwardSelectedIds.has(m.id));
    const senderName = profile.name;

    const newMsgs: ChatMessage[] = selectedMsgs.map((m) => ({
      ...m,
      id: 'fwd-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      senderId: 'me' as const,
      forwardedFrom: senderName,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
    }));

    // Add to current chat if forwarding to self, otherwise just simulate
    if (targetChatId === 'me' || targetChatId === CURRENT_USER.id) {
      setMessages((prev) => [...prev, ...newMsgs]);
    } else {
      // Simulate: show toast that messages were forwarded
      triggerPinnedToast(`Forwarded ${newMsgs.length} message${newMsgs.length > 1 ? 's' : ''} to ${MOCK_CHATS.find((c) => c.id === targetChatId)?.name || 'contact'}`);
    }

    setIsForwardModalOpen(false);
    setIsForwardSelecting(false);
    setForwardSelectedIds(new Set());
  };

  const handleAttachItem = (type: 'photo' | 'location' | 'document' | 'voice' | 'poll' | 'stickers') => {
    setIsAttachmentMenuOpen(false);
    if (type === 'voice') {
      voiceMemoRef.current?.startRecording();
      return;
    }
    if (type === 'photo' || type === 'document') {
      setIsFileModalOpen(true);
      return;
    }
    if (type === 'poll') {
      setIsPollModalOpen(true);
      return;
    }
    if (type === 'stickers') {
      setIsEmojiPickerOpen(false);
      setIsStickerDrawerOpen(true);
      return;
    }
    if (type === 'location') {
      setIsLocationModalOpen(true);
      return;
    }

    const messageId = 'm-' + Date.now();
    let newMsg: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text: '📄 Summer_Trip_Schedule.pdf (2.4 MB - Document attached)',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: replyingTo.senderId === 'me' ? 'You' : profile.name,
          }
        : undefined,
    };
    triggerPinnedToast('Document attached');

    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);

    // Transition read status after 600ms
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 600);

    setTimeout(() => {
      setTypingActivity('typing');
      setIsTyping(true);
    }, 850);

    setTimeout(() => {
      setIsTyping(false);
      setTypingActivity('typing');
      const attachmentResponses = [
        "Love this! Looks amazing ✨",
        "Got your attachment, opening it right now! 📄",
        "Saved it, thank you! 🙌",
      ];
      const randomResponse = attachmentResponses[Math.floor(Math.random() * attachmentResponses.length)];
      setMessages((prev) => [
        ...prev,
        {
          id: 'm-' + (Date.now() + 1),
          senderId: 'other',
          text: randomResponse,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 2600);
  };

  const handleCreatePoll = (poll: PollData) => {
    const messageId = 'm-' + Date.now();
    const newMsg: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text: `📊 ${poll.question}`,
      poll,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: replyingTo.senderId === 'me' ? 'You' : profile.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);
    triggerPinnedToast(t('poll.pollCreated', 'Poll created!'));

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 600);

    // Simulated contact response voting in the poll
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.poll) return m;
          const options = m.poll.options.map((opt, idx) => {
            if (idx === 0) {
              return { ...opt, votes: opt.votes + 1 };
            }
            return opt;
          });
          const total = options.reduce((s, o) => s + o.votes, 0);
          return {
            ...m,
            poll: { ...m.poll, options, totalVotes: total },
          };
        })
      );
      triggerPinnedToast(t('poll.votedNotification', { name: profile.name, defaultValue: `${profile.name} voted in your poll` }));
    }, 2200);
  };

  const handleVotePoll = (pollId: string, optionId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.poll || m.poll.id !== pollId) return m;
        const curPoll = m.poll;
        const updatedOptions = curPoll.options.map((opt) => {
          if (opt.id === optionId) {
            const nowVoted = !opt.votedByMe;
            return {
              ...opt,
              votedByMe: nowVoted,
              votes: nowVoted ? opt.votes + 1 : Math.max(0, opt.votes - 1),
            };
          }
          if (!curPoll.allowsMultiple && opt.votedByMe) {
            return {
              ...opt,
              votedByMe: false,
              votes: Math.max(0, opt.votes - 1),
            };
          }
          return opt;
        });
        const total = updatedOptions.reduce((s, o) => s + o.votes, 0);
        return {
          ...m,
          poll: {
            ...curPoll,
            options: updatedOptions,
            totalVotes: total,
          },
        };
      })
    );
  };

  const handleRetractVote = (pollId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.poll || m.poll.id !== pollId) return m;
        const updatedOptions = m.poll.options.map((opt) => ({
          ...opt,
          votedByMe: false,
          votes: opt.votedByMe ? Math.max(0, opt.votes - 1) : opt.votes,
        }));
        const total = updatedOptions.reduce((s, o) => s + o.votes, 0);
        return {
          ...m,
          poll: {
            ...m.poll,
            options: updatedOptions,
            totalVotes: total,
          },
        };
      })
    );
  };

  const handleSendSticker = (sticker: StickerData) => {
    setIsEmojiPickerOpen(false);
    const messageId = 'm-' + Date.now();
    const newMsg: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text: `${sticker.emoji} ${sticker.name}`,
      sticker,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: replyingTo.senderId === 'me' ? 'You' : profile.name,
          }
        : undefined,
    };
    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 600);
  };

  const handleSendGif = (gifUrl: string, title?: string) => {
    setIsEmojiPickerOpen(false);
    const messageId = 'm-' + Date.now();
    const newMsg: ChatMessage = {
      id: messageId,
      senderId: 'me',
      images: [gifUrl],
      text: title || 'GIF',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: replyingTo.senderId === 'me' ? 'You' : profile.name,
          }
        : undefined,
    };
    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 600);
  };

  const handleSendLocation = (location: LocationData) => {
    const messageId = 'm-' + Date.now();
    const newMsg: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text: `📍 ${location.title}`,
      location,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: replyingTo.senderId === 'me' ? 'You' : profile.name,
          }
        : undefined,
    };
    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);
    triggerPinnedToast(location.isLive ? 'Live location shared' : 'Location sent');

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 600);
  };

  const handleSendAttachmentFromModal = (payload: {
    text?: string;
    images?: string[];
    document?: DocumentAttachment;
  }) => {
    const messageId = 'm-' + Date.now();
    const newMessage: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text: payload.text,
      images: payload.images,
      document: payload.document,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: replyingTo.senderId === 'me' ? 'You' : profile.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    setReplyingTo(null);
    setStagedAttachment(null);
    triggerPinnedToast(
      payload.images
        ? `Sent ${payload.images.length} photo(s)`
        : payload.document
        ? `Sent ${payload.document.name}`
        : 'Attachment sent'
    );

    // Transition read status after 500ms
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 500);

    // Katie begins real-time typing after 750ms
    setTimeout(() => {
      setTypingActivity('typing');
      setIsTyping(true);
    }, 750);

    setTimeout(() => {
      setIsTyping(false);
      setTypingActivity('typing');
      const responses = payload.images
        ? [
            "Love these photos! Looks so fun ✨",
            "Awesome shots, saving these right away! 📸",
            "Can't wait to catch up, thanks for sharing!",
          ]
        : payload.document
        ? [
            "Got the document! Reviewing it now 📄",
            "Thanks for sharing this file, looks great!",
            "Saved it, see you Sunday!",
          ]
        : [
            "Sounds awesome! Let's definitely do that.",
            "Can't wait to catch up! 🎉",
          ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setMessages((prev) => {
        const lastUserMsg = prev[prev.length - 1];
        return [
          ...prev,
          {
            id: 'm-' + (Date.now() + 1),
            senderId: 'other',
            text: randomResponse,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            replyTo:
              lastUserMsg && lastUserMsg.senderId === 'me'
                ? {
                    id: lastUserMsg.id,
                    text:
                      lastUserMsg.text ||
                      (lastUserMsg.document ? `Document: ${lastUserMsg.document.name}` : 'Photo attachment'),
                    senderName: 'You',
                  }
                : undefined,
          },
        ];
      });
    }, 2600);
  };

  const handleSendMessage = (customText?: string, forcedReplyTo?: ChatMessage | null) => {
    const text = (customText ?? inputText).trim();
    if (!text && !stagedAttachment) return;

    const messageId = 'm-' + Date.now();
    const activeReply = forcedReplyTo !== undefined ? forcedReplyTo : replyingTo;
    const currentAttachment = stagedAttachment;
    const newMessage: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text: text || undefined,
      images: currentAttachment?.images,
      document: currentAttachment?.document,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: activeReply
        ? {
            id: activeReply.id,
            text: activeReply.text || (activeReply.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: activeReply.senderId === 'me' ? 'You' : profile.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    if (text) {
      void encryptAndSendMessage(chatId, text).catch((err) => {
        console.warn('Message encryption failed:', err);
      });
    }
    if (!customText) {
      setInputText('');
    }
    setReplyingTo(null);
    setStagedAttachment(null);

    // Transition read status after 500ms
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 500);

    // Katie begins real-time typing after 750ms
    setTimeout(() => {
      setTypingActivity('typing');
      setIsTyping(true);
    }, 750);

    setTimeout(() => {
      setIsTyping(false);
      setTypingActivity('typing');
      const responses = currentAttachment?.images
        ? [
            "Love these photos! Looks so fun ✨",
            "Awesome shots, saving these right away! 📸",
            "Can't wait to catch up, thanks for sharing!",
          ]
        : currentAttachment?.document
        ? [
            "Got the document! Reviewing it now 📄",
            "Thanks for sharing this file, looks great!",
            "Saved it, see you Sunday!",
          ]
        : [
            "Sounds awesome! Let's definitely do that.",
            "Perfect, I'll text John now and let you know what he says!",
            "Can't wait to catch up, it's been way too long! 🎉",
            "Deal! Let's meet at 7pm then.",
          ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setMessages((prev) => {
        const lastUserMsg = prev[prev.length - 1];
        return [
          ...prev,
          {
            id: 'm-' + (Date.now() + 1),
            senderId: 'other',
            text: randomResponse,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            replyTo:
              lastUserMsg && lastUserMsg.senderId === 'me'
                ? {
                    id: lastUserMsg.id,
                    text:
                      lastUserMsg.text ||
                      (lastUserMsg.document
                        ? `Document: ${lastUserMsg.document.name}`
                        : lastUserMsg.voiceNote
                        ? 'Voice message'
                        : 'Photo attachment'),
                    senderName: 'You',
                  }
                : undefined,
          },
        ];
      });
    }, 2600);
  };

  // Context-aware Smart Reply suggestions based on the last received message content
  const lastReceivedMessage = useMemo(() => {
    return [...messages].reverse().find((m) => m.senderId === 'other');
  }, [messages]);

  const smartReplies = useMemo(() => {
    if (!lastReceivedMessage || dismissedSmartReplyMsgId === lastReceivedMessage.id) return [];
    const text = lastReceivedMessage.text?.toLowerCase() || '';
    if (text.includes('?')) {
      return ['Yes', 'No', 'Maybe 😄', 'Tell me more'];
    }
    if (text.includes('love') || text.includes('❤️')) {
      return ['❤️', '💕', 'Same here!'];
    }
    return ['Nice! 👍', 'Haha 😄', 'For sure!'];
  }, [lastReceivedMessage, dismissedSmartReplyMsgId]);
  const shouldShowSmartReplies = smartReplies.length > 0 && !inputText.trim();

  // ID of the latest message sent by 'me' that has been read by Katie
  const latestReadSentMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === 'me' && messages[i].isRead) {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

  const sharedMediaCount = useMemo(() => {
    const urls = new Set<string>();
    messages.forEach((m) => {
      m.images?.forEach((u) => urls.add(u));
    });
    (profile.sharedMedia || KATIE_SHARED_MEDIA).forEach((item) => {
      urls.add(item.url);
    });
    return urls.size;
  }, [messages]);

  const handleJumpFromGallery = (msgId: string) => {
    setActiveHeaderTab('chat');
    setTimeout(() => {
      handleJumpToMessage(msgId);
    }, 150);
  };

  const currentPinnedMsg =
    pinnedMessages.length > 0
      ? pinnedMessages[Math.min(currentPinIndex, pinnedMessages.length - 1)]
      : null;

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white relative select-none overflow-hidden">
      {/* Dynamic Background Wallpaper with session persistence */}
      <DoodleBackground wallpaperId={wallpaperId} intensity={wallpaperIntensity} />

      {/* Toast Notification */}
      {pinnedToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-[var(--nova-accent-color, #ff4e18)]/50 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Clock className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)]" />
          <span>{pinnedToast}</span>
        </div>
      )}

      {/* Floating Header Pill */}
      <div className="p-2 shrink-0 relative z-20">
        <div className="bg-[#14151c]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-2.5 py-1.5 flex items-center justify-between shadow-xl shadow-black/60 min-h-[44px]">
          {isSearchOpen ? (
            /* ACTIVE SEARCH BAR HEADER WITH WORD STEPPER & CONTROLS */
            <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-200">
              <button
                onClick={handleCloseSearch}
                className="w-8 h-8 rounded-full bg-[#1f2029]/80 hover:bg-[#282a36] border border-white/5 flex items-center justify-center text-white/90 active:scale-95 transition cursor-pointer shrink-0"
                title={t('common.back')}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="flex-1 bg-[#1a1b26] border border-[var(--nova-accent-color, #ff4e18)]/50 focus-within:border-[var(--nova-accent-color, #ff4e18)] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 shadow-inner min-w-0">
                <Search className="w-4 h-4 text-[var(--nova-accent-color, #ff4e18)] shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      handleCloseSearch();
                    } else if (e.key === 'Enter') {
                      if (e.shiftKey) {
                        handlePrevMatch();
                      } else {
                        handleNextMatch();
                      }
                    } else if (e.key === 'ArrowDown') {
                      handleNextMatch();
                    } else if (e.key === 'ArrowUp') {
                      handlePrevMatch();
                    }
                  }}
                  placeholder={t('chat.searchInChat')}
                  className="w-full bg-transparent text-xs text-white placeholder-white/40 focus:outline-none py-0.5 min-w-0"
                />

                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setActiveMatchIndex(0);
                      searchInputRef.current?.focus();
                    }}
                    className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition cursor-pointer shrink-0"
                    title={t('common.close')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Match counter badge */}
                {searchQuery.trim() && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 text-[var(--nova-accent-color, #ff4e18)] shrink-0 border border-[var(--nova-accent-color, #ff4e18)]/30 font-semibold whitespace-nowrap">
                    {matchingMessages.length > 0
                      ? `${activeMatchIndex + 1}/${matchingMessages.length}`
                      : '0/0'}
                  </span>
                )}
              </div>

              {/* Stepper buttons: Jump Up / Down through matches */}
              {searchQuery.trim() && matchingMessages.length > 0 && (
                <div className="flex items-center gap-0.5 bg-[#1a1b26] border border-white/10 rounded-xl p-0.5 shrink-0">
                  <button
                    onClick={handlePrevMatch}
                    className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-[var(--nova-accent-color, #ff4e18)] transition cursor-pointer active:scale-95"
                    title={t('common.previous')}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNextMatch}
                    className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-[var(--nova-accent-color, #ff4e18)] transition cursor-pointer active:scale-95"
                    title={t('common.next')}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Toggle View Mode: Filter Only vs Context Stream */}
              {searchQuery.trim() && (
                <button
                  onClick={() =>
                    setSearchFilterMode((mode) =>
                      mode === 'context' ? 'filtered' : 'context'
                    )
                  }
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition cursor-pointer active:scale-95 shrink-0 ${
                    searchFilterMode === 'filtered'
                      ? 'bg-[var(--nova-accent-color, #ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/30 border border-[var(--nova-accent-color, #ff4e18)]'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
                  }`}
                  title={
                    searchFilterMode === 'filtered'
                      ? 'Showing filtered matches only. Click for conversation context.'
                      : 'Showing conversation context. Click to filter only matching messages.'
                  }
                >
                  <ListFilter className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={handleCloseSearch}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 hover:text-white transition cursor-pointer active:scale-95 shrink-0"
              >
                Done
              </button>
            </div>
          ) : (
            /* STANDARD CONTACT HEADER */
            <>
              <button
                onClick={onBack}
                className="w-9 h-9 rounded-full bg-[#1f2029]/80 hover:bg-[#282a36] border border-white/5 flex items-center justify-center text-white/90 active:scale-95 transition cursor-pointer md:hidden shrink-0"
                aria-label="Back to chats"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 min-w-0 flex-1 mx-0.5">
                <button
                  onClick={onOpenProfile}
                  className="flex flex-col items-center min-w-0 cursor-pointer focus:outline-none group"
                >
                  <span className="font-bold text-[14.5px] text-white tracking-tight group-hover:text-[var(--nova-accent-color, #ff4e18)] transition truncate">
                    {profile.name}
                  </span>
                  {isTyping ? (
                    <div className="flex items-center gap-1 mt-0.5 px-1.5 py-px rounded-full bg-[var(--nova-accent-color, #ff4e18)]/15 border border-[var(--nova-accent-color, #ff4e18)]/30 animate-in fade-in zoom-in-95 duration-200 shadow-sm shadow-[var(--nova-accent-color, #ff4e18)]/20 select-none">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--nova-accent-color, #ff4e18)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--nova-accent-color, #ff4e18)]"></span>
                      </span>
                      {typingActivity === 'recording' ? (
                        <>
                          <Mic className="w-2 h-2 text-[var(--nova-accent-color, #ff4e18)] animate-pulse" />
                          <span className="text-[10px] font-semibold text-[var(--nova-accent-color, #ff4e18)] tracking-tight">recording</span>
                          <div className="flex items-center gap-0.5 h-1.5">
                            <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-0.5" />
                            <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.2s] h-1" />
                            <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.4s] h-1" />
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] font-semibold text-[var(--nova-accent-color, #ff4e18)] tracking-tight">typing</span>
                          <div className="flex items-center gap-0.5 pt-px">
                            <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce [animation-delay:-0.32s]" />
                            <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce [animation-delay:-0.16s]" />
                            <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce" />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                      <span className="text-[10px] text-[#868b98] font-normal leading-none">
                        {profile.status}
                      </span>
                    </div>
                  )}
                </button>

                {/* Header Menu Tabs: [ Chat | Gallery ] */}
                <div className="flex items-center gap-0.5 p-0.5 bg-[#181922] rounded-lg border border-white/5 select-none shrink-0">
                  <button
                    onClick={() => setActiveHeaderTab('chat')}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                      activeHeaderTab === 'chat'
                        ? 'text-white shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                    style={activeHeaderTab === 'chat' ? { backgroundColor: 'var(--nova-accent-color)' } : undefined}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setActiveHeaderTab('gallery')}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer flex items-center gap-0.5 ${
                      activeHeaderTab === 'gallery'
                        ? 'text-white shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                    style={activeHeaderTab === 'gallery' ? { backgroundColor: 'var(--nova-accent-color)' } : undefined}
                  >
                    <ImageIcon className="w-2.5 h-2.5" />
                    <span>Gallery</span>
                    <span className="text-[9px] opacity-80 font-mono">({sharedMediaCount})</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Video Call Toggle Button */}
                <button
                  onClick={handleStartVideoCall}
                  className={`w-7 h-7 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                    isVideoCallOpen
                      ? 'bg-[var(--nova-accent-color, #ff4e18)] text-white border-[var(--nova-accent-color, #ff4e18)] shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/30 animate-pulse'
                      : 'bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)]/20 border-white/10 hover:border-[var(--nova-accent-color, #ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color, #ff4e18)]'
                  }`}
                  title={isVideoCallOpen ? 'Video call in progress (click to view)' : `Start video call with ${profile.name}`}
                >
                  <Video className="w-3 h-3" />
                </button>

                {/* Search Messages in Chat Button */}
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)]/20 border border-white/10 hover:border-[var(--nova-accent-color, #ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color, #ff4e18)] flex items-center justify-center transition cursor-pointer active:scale-95"
                  title={t('common.search')}
                >
                  <Search className="w-3 h-3" />
                </button>

                {/* Wallpaper Settings Button */}
                <button
                  onClick={() => setIsWallpaperModalOpen(true)}
                  className={`w-7 h-7 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                    isWallpaperModalOpen
                      ? 'bg-[var(--nova-accent-color, #ff4e18)] text-white border-[var(--nova-accent-color, #ff4e18)] shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/30'
                      : 'bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)]/20 border-white/10 hover:border-[var(--nova-accent-color, #ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color, #ff4e18)]'
                  }`}
                  title={t('settings.chatWallpaper')}
                >
                  <Palette className="w-3 h-3" />
                </button>

                {/* Premium Chat Theme Toggle */}
                <button
                  disabled={chatTheme !== 'default' && !canUse('chat_themes')}
                  onClick={() => {
                    const isPremiumTheme = chatTheme !== 'default';
                    if (isPremiumTheme && !canUse('chat_themes')) {
                      checkout();
                      return;
                    }
                    const next =
                      chatTheme === 'emerald' ? 'default' : Object.keys(PREMIUM_THEMES).includes(chatTheme)
                        ? (['default', 'sapphire', 'amethyst', 'emerald'] as const)[
                          (['default', 'sapphire', 'amethyst', 'emerald'] as const).indexOf(chatTheme) + 1
                        ]
                        : 'default';
                    if (next !== 'default' && !canUse('chat_themes')) {
                      checkout();
                      return;
                    }
                    setChatTheme(next);
                    try {
                      localStorage.setItem(CHAT_THEME_KEY, next);
                    } catch {
      void 0;
    }
                  }}
                  className={`w-7 h-7 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                    chatTheme === 'default'
                      ? 'bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)]/20 border-white/10 hover:border-[var(--nova-accent-color, #ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color, #ff4e18)]'
                      : 'bg-[var(--nova-accent-color, #ff4e18)] text-white border-[var(--nova-accent-color, #ff4e18)] shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/30'
                  }`}
                  title={`Chat theme: ${theme.label}${!canUse('chat_themes') && chatTheme === 'default' ? ' (Premium)' : ''}`}
                >
                  {canUse('chat_themes') || chatTheme !== 'default' ? (
                    <Sparkles className={`w-3 h-3 ${chatTheme === 'default' ? '' : 'fill-white'}`} />
                  ) : (
                    <Lock className="w-3 h-3" />
                  )}
                </button>

                {/* Pinned Messages Header Button */}
                <button
                  onClick={() => setIsPinnedCarouselOpen((prev) => !prev)}
                  className={`relative w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer active:scale-95 ${
                    isPinnedCarouselOpen
                      ? 'bg-[var(--nova-accent-color, #ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/30'
                      : pinnedMessages.length > 0
                      ? 'bg-[var(--nova-accent-color, #ff4e18)]/20 border border-[var(--nova-accent-color, #ff4e18)]/50 text-[var(--nova-accent-color, #ff4e18)] hover:bg-[var(--nova-accent-color, #ff4e18)]/30'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
                  }`}
                  title={isPinnedCarouselOpen ? 'Close pinned messages' : 'View pinned messages'}
                >
                  <Pin className={`w-3 h-3 ${isPinnedCarouselOpen || pinnedMessages.length > 0 ? 'fill-current' : ''}`} />
                  {pinnedMessages.length > 0 && (
                    <span
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                        isPinnedCarouselOpen
                          ? 'bg-white text-[var(--nova-accent-color, #ff4e18)]'
                          : 'bg-[var(--nova-accent-color, #ff4e18)] text-white shadow-sm'
                      }`}
                    >
                      {pinnedMessages.length}
                    </span>
                  )}
                </button>

                {/* Demo: simulate incoming message */}
                <button
                  onClick={isTyping ? handleTriggerIncomingVoiceNote : () => handleSimulateTypingActivity('typing')}
                  disabled={isTyping}
                  className={`w-7 h-7 rounded-full border transition flex items-center justify-center cursor-pointer active:scale-95 ${
                    isTyping
                      ? 'bg-[var(--nova-accent-color, #ff4e18)]/25 border-[var(--nova-accent-color, #ff4e18)] text-[var(--nova-accent-color, #ff4e18)] ring-1 ring-[var(--nova-accent-color, #ff4e18)]/40 animate-pulse'
                      : 'bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)]/20 border-white/10 hover:border-[var(--nova-accent-color, #ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color, #ff4e18)]'
                  }`}
                  title={isTyping ? 'Receive voice note' : 'Simulate typing'}
                >
                  {isTyping ? <Mic className="w-3 h-3 text-[var(--nova-accent-color, #ff4e18)]" /> : <Sparkles className="w-3 h-3 text-[var(--nova-accent-color, #ff4e18)]" />}
                </button>

                <button
                  onClick={onOpenProfile}
                  className={`relative w-8 h-8 rounded-full overflow-hidden border transition-all duration-300 cursor-pointer active:scale-95 shrink-0 ${
                    isTyping
                      ? 'border-[var(--nova-accent-color, #ff4e18)] ring-2 ring-[var(--nova-accent-color, #ff4e18)]/60 shadow-[0_0_16px_rgba(255,78,24,0.6)]'
                      : 'border-white/15 ring-2 ring-[var(--nova-accent-color, #ff4e18)]/20'
                  }`}
                  title={t('common.profile')}
                >
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                  {/* Real-time live status beacon on avatar */}
                  {isTyping ? (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)] border-2 border-[#12131b] flex items-center justify-center animate-pulse shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    </span>
                  ) : (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#12131b] shadow-sm shadow-emerald-500/50" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CONDITIONAL BODY: SHARED MEDIA GALLERY vs ACTIVE CONVERSATION */}
      {activeHeaderTab === 'gallery' ? (
        <SharedMediaSection
          messages={messages}
          contactName={profile.name}
          contactId={chatId}
          onClose={() => setActiveHeaderTab('chat')}
          onJumpToMessage={handleJumpFromGallery}
        />
      ) : (
        <>
          {/* QUICK SEARCH KEYWORD CHIPS (when search is open) */}
      {isSearchOpen && (
        <div ref={quickSearchChipsRef} className="px-3 -mt-1 mb-2 shrink-0 z-20 flex items-center gap-1.5 overflow-x-auto no-scrollbar animate-in slide-in-from-top-1 fade-in" data-testid="quick-search-chips">
          <span className="text-[10px] text-[#868b98] shrink-0 font-medium pl-1">Suggested:</span>
          {QUICK_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setSearchQuery(chip)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition cursor-pointer shrink-0 ${
                searchQuery.toLowerCase() === chip.toLowerCase()
                  ? 'bg-[var(--nova-accent-color, #ff4e18)] text-white'
                  : 'bg-[#181922] text-[#8e93a0] hover:text-white border border-white/5'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* DISMISSIBLE PINNED MESSAGES CAROUSEL */}
      {isPinnedCarouselOpen && (
        <div className="px-3 -mt-1 mb-2 shrink-0 relative z-30 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="bg-[#151622]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 shadow-2xl shadow-black/70">
            {/* Header row of carousel */}
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5 px-1">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)]">
                  <Pin className="w-3 h-3 fill-current" />
                </div>
                <span className="text-xs font-bold text-white tracking-wide">
                  Pinned Messages
                </span>
                {pinnedMessages.length > 0 && (
                  <span className="text-[10px] text-white/50 px-1.5 py-0.2 rounded-full bg-white/5 font-mono">
                    {currentPinIndex + 1}/{pinnedMessages.length}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {pinnedMessages.length > 1 && (
                  <>
                    <button
                      onClick={handlePrevPin}
                      className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                      title={t('common.previous')}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleNextPin}
                      className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                      title={t('common.next')}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsPinnedCarouselOpen(false)}
                  className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer ml-1"
                  title={t('common.close')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Current Pinned Message Card */}
            {currentPinnedMsg ? (
              <div
                onClick={() => handleJumpToMessage(currentPinnedMsg.id)}
                className="mt-2 p-2 rounded-xl bg-[#1b1c28]/90 hover:bg-[#202232] border border-white/5 transition cursor-pointer group flex items-start justify-between gap-2.5 active:scale-[0.99]"
                title={t('chat.replyingTo')}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {currentPinnedMsg.images && currentPinnedMsg.images.length > 0 ? (
                    <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/10">
                      <img
                        src={currentPinnedMsg.images[0]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : currentPinnedMsg.voiceNote ? (
                    <div className="w-9 h-9 rounded-lg bg-[var(--nova-accent-color, #ff4e18)]/15 border border-[var(--nova-accent-color, #ff4e18)]/30 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)] shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-[#252836] border border-white/5 flex items-center justify-center text-xs font-bold text-white/80 shrink-0">
                      {currentPinnedMsg.senderId === 'me' ? 'You' : 'KR'}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[var(--nova-accent-color, #ff4e18)]">
                        {currentPinnedMsg.senderId === 'me' ? 'You' : profile.name}
                      </span>
                      <span className="text-[10px] text-white/40">
                        {currentPinnedMsg.time}
                      </span>
                      {currentPinnedMsg.pinnedNote && (
                        <span className="text-[10px] text-white/50 truncate hidden sm:inline">
                          · {currentPinnedMsg.pinnedNote}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-white/90 truncate mt-0.5 font-normal">
                      {currentPinnedMsg.voiceNote
                        ? `Voice message (${currentPinnedMsg.voiceNote.duration})`
                        : currentPinnedMsg.text || 'Photo attachment'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 self-center">
                  <button
                    onClick={(e) => handleUnpinMessage(currentPinnedMsg.id, e)}
                    className="p-1 rounded-md text-white/40 hover:text-red-400 hover:bg-white/5 transition cursor-pointer"
                    title={t('common.unpin')}
                  >
                    <PinOff className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-[var(--nova-accent-color, #ff4e18)] font-medium group-hover:underline flex items-center gap-0.5">
                    Jump
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-3 text-center text-xs text-white/40">
                No pinned messages yet. Long-press any message to pin it.
              </div>
            )}

            {/* Pagination indicator dots */}
            {pinnedMessages.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-2">
                {pinnedMessages.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentPinIndex(idx)}
                    className={`transition-all duration-200 cursor-pointer ${
                      idx === currentPinIndex
                        ? 'w-4 h-1 rounded-full bg-[var(--nova-accent-color, #ff4e18)]'
                        : 'w-1.5 h-1 rounded-full bg-white/20 hover:bg-white/40'
                    }`}
                    title={`Go to pinned message ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Date Pill Divider */}
      <div className="flex justify-center my-1 relative z-10 shrink-0">
        <span className="text-[11px] font-medium text-[#737887] bg-[#14151c]/80 backdrop-blur-md px-3.5 py-1 rounded-full border border-white/5 shadow-inner">
          Today, 24 June
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div
        onClick={() => setActiveReactionMsgId(null)}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-3 relative z-10 no-scrollbar"
      >
        {/* Empty Search Results State */}
        {isSearchOpen && searchQuery.trim() && matchingMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in">
            <div className="w-12 h-12 rounded-full bg-[#181922] border border-white/10 flex items-center justify-center text-white/40 mb-3 shadow-inner">
              <Search className="w-5 h-5 text-white/30" />
            </div>
            <p className="text-sm font-semibold text-white/90">No words found in this chat</p>
            <p className="text-xs text-[#828795] mt-1 max-w-[240px]">
              No messages match &quot;{searchQuery}&quot;. Try searching for words like &quot;Harry&apos;s&quot;, &quot;hang out&quot;, or &quot;Sunday&quot;.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setSearchQuery('')}
                className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer"
              >
                Clear Search
              </button>
              <button
                onClick={() => handleSelectSearchQuery("Harry's")}
                className="px-3.5 py-1.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 border border-[var(--nova-accent-color, #ff4e18)]/40 text-[var(--nova-accent-color, #ff4e18)] text-xs font-semibold hover:bg-[var(--nova-accent-color, #ff4e18)]/30 transition cursor-pointer"
              >
                Try &quot;Harry&apos;s&quot;
              </button>
            </div>
          </div>
        )}

        {displayedMessages.map((msg) => {
          const isMine = msg.senderId === 'me';
          const isPickerOpen = activeReactionMsgId === msg.id;
          const isHighlighted = highlightedMsgId === msg.id;
          const isCurrentSearchMatch =
            isSearchOpen &&
            searchQuery.trim().length > 0 &&
            matchingMessages[activeMatchIndex]?.id === msg.id;
          const hasWordMatch =
            isSearchOpen &&
            searchQuery.trim().length > 0 &&
            matchingMessages.some((m) => m.id === msg.id);

          const isThisSwiping = swipingMsgId === msg.id;
          const currentOffset = isThisSwiping ? swipeOffset : 0;
          const isThresholdReached = currentOffset >= 42;

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`flex flex-col relative transition-all duration-300 ${
                isMine ? 'items-end' : 'items-start'
              }`}
            >
              {/* Swipe-to-reply background indicator icon */}
              {isThisSwiping && currentOffset > 4 && (
                <div
                  data-testid="swipe-reply-indicator"
                  style={{
                    opacity: Math.min(1, currentOffset / 28),
                    transform: `translateY(-50%) scale(${Math.min(1.18, 0.6 + currentOffset / 52)})`,
                  }}
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors pointer-events-none z-0 ${
                    isThresholdReached
                      ? 'bg-[var(--nova-accent-color, #ff4e18)] text-white shadow-lg shadow-[var(--nova-accent-color, #ff4e18)]/50 ring-2 ring-white/20'
                      : 'bg-white/10 text-white/60'
                  }`}
                >
                  <Reply
                    className={`w-4 h-4 transition-transform duration-150 ${
                      isThresholdReached ? 'rotate-[-12deg] scale-110' : ''
                    }`}
                  />
                </div>
              )}

              {/* Context Floating Reaction & Actions Picker Capsule */}
              {isPickerOpen && (
                <>
                  {/* Invisible backdrop to dismiss reaction picker when clicking outside */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveReactionMsgId(null);
                    }}
                    className="fixed inset-0 z-30"
                  />

                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute -top-14 z-40 bg-[#151621]/98 border border-white/20 rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-in zoom-in-90 fade-in duration-150 ${
                      isMine ? 'right-0' : 'left-0'
                    }`}
                  >
                    {EMOJI_OPTIONS.map((emoji) => {
                      const isSelected = msg.reactions?.some((r) => r.emoji === emoji && r.fromMe);
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleSelectReaction(msg.id, emoji)}
                          className={`text-xl p-1.5 rounded-full hover:scale-135 active:scale-95 transition-transform cursor-pointer relative group ${
                            isSelected ? 'bg-white/20 scale-120' : 'hover:bg-white/10'
                          }`}
                          title={`React with ${emoji}`}
                        >
                          <span className="select-none">{emoji}</span>
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)] absolute -bottom-0.5 left-1/2 -translate-x-1/2 shadow-[0_0_6px_var(--nova-accent-color, #ff4e18)]" />
                          )}
                        </button>
                      );
                    })}

                    <div className="h-4 w-[1px] bg-white/20 mx-1" />

                    {/* Quick Action Buttons: Reply, Pin, Copy */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplyMessage(msg);
                        }}
                        className="px-2 py-1 rounded-full bg-[var(--nova-accent-color, #ff4e18)] hover:bg-[var(--nova-accent-color, #ff5d2b)] text-white flex items-center gap-1 text-[11px] font-semibold transition cursor-pointer shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/40 active:scale-95"
                        title={t('common.reply')}
                      >
                        <Reply className="w-3.5 h-3.5" />
                        <span>Reply</span>
                      </button>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePinMessage(msg.id);
                        }}
                        className={`p-1.5 rounded-full transition cursor-pointer ${
                          msg.isPinned
                            ? 'text-[var(--nova-accent-color, #ff4e18)] bg-[var(--nova-accent-color, #ff4e18)]/20 hover:bg-[var(--nova-accent-color, #ff4e18)]/30'
                            : 'text-white/70 hover:text-white hover:bg-white/10'
                        }`}
                        title={msg.isPinned ? 'Unpin message' : 'Pin message'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${msg.isPinned ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyMessage(msg);
                        }}
                        className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        title={t('common.copy')}
                      >
                        {copiedMsgId === msg.id ? (
                          <CheckCheck className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartForward(msg.id);
                        }}
                        className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        title="Forward message"
                      >
                        <Forward className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Active Search Match Indicator Badge */}
              {isCurrentSearchMatch && (
                <div
                  className={`flex items-center gap-1 text-[9.5px] font-bold text-[var(--nova-accent-color, #ff4e18)] mb-1 px-1 animate-in fade-in slide-in-from-top-1 ${
                    isMine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span className="bg-[var(--nova-accent-color, #ff4e18)] text-white px-2 py-0.5 rounded-full shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/40 flex items-center gap-1 tracking-tight font-sans">
                    <Search className="w-2.5 h-2.5" />
                    Match {activeMatchIndex + 1} of {matchingMessages.length}
                  </span>
                </div>
              )}

              <div className={`flex items-center max-w-full group/row relative ${isMine ? 'justify-end' : 'justify-start'}`}>
                {/* Message Bubble Container with Touch and Pointer Handlers */}
                <div
                  data-testid={`bubble-${msg.id}`}
                  onPointerDown={(e) => handlePointerDown(e, msg.id)}
                  onPointerMove={(e) => handlePointerMove(e, msg)}
                  onPointerUp={(e) => handlePointerUp(e, msg)}
                  onPointerCancel={handlePointerCancel}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveReactionMsgId(msg.id);
                  }}
                  style={{
                    transform: isThisSwiping ? `translateX(${currentOffset}px)` : 'translateX(0px)',
                    transition:
                      isThisSwiping && isDraggingRef.current
                        ? 'none'
                        : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    touchAction: 'pan-y',
                  }}
                  className={`relative group touch-manipulation cursor-pointer transition-all duration-300 select-none ${
                    isPickerOpen ? 'scale-[1.02] ring-2 ring-[var(--nova-accent-color, #ff4e18)]/50' : 'active:scale-[0.99]'
                  } ${
                    isCurrentSearchMatch
                      ? 'ring-2 ring-[var(--nova-accent-color, #ff4e18)] shadow-[0_0_24px_rgba(255,78,24,0.6)] rounded-[24px]'
                      : isHighlighted
                      ? 'ring-2 ring-[var(--nova-accent-color, #ff4e18)] shadow-[0_0_22px_rgba(255,78,24,0.6)] rounded-[24px]'
                      : hasWordMatch
                      ? 'ring-1 ring-[var(--nova-accent-color, #ff4e18)]/40 rounded-[24px]'
                      : ''
                  }`}
                >
                  {/* Quick Action Pill on hover (Desktop) attached directly to the message bubble */}
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`absolute -top-3.5 ${isMine ? 'left-3' : 'right-3'} z-20 hidden sm:flex items-center gap-1 bg-[#141520]/95 border border-white/20 backdrop-blur-xl rounded-full px-2 py-0.5 shadow-xl shadow-black/80 opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 select-none`}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplyMessage(msg);
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full hover:bg-[var(--nova-accent-color, #ff4e18)] text-white/80 hover:text-white transition active:scale-90 text-[10px] font-semibold cursor-pointer"
                      title="Reply to message"
                    >
                      <Reply className="w-3 h-3 text-[var(--nova-accent-color, #ff4e18)]" />
                      <span>Reply</span>
                    </button>
                    <div className="w-[1px] h-3 bg-white/15" />
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartForward(msg.id);
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full hover:bg-[var(--nova-accent-color, #ff4e18)] text-white/80 hover:text-white transition active:scale-90 text-[10px] font-semibold cursor-pointer"
                      title="Forward message"
                    >
                      <Forward className="w-3 h-3 text-[var(--nova-accent-color, #ff4e18)]" />
                      <span>Forward</span>
                    </button>
                    <div className="w-[1px] h-3 bg-white/15" />
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveReactionMsgId((curr) => (curr === msg.id ? null : msg.id));
                      }}
                      className="p-1 rounded-full hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 transition active:scale-90 cursor-pointer"
                      title="Add reaction (emoji popup)"
                    >
                      <Heart className="w-3 h-3 fill-rose-400/50" />
                    </button>
                  </div>
                  {/* Forward Selection Checkmark Overlay */}
                  {isForwardSelecting && (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`absolute top-2 ${isMine ? 'right-2' : 'left-2'} z-30 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 ${
                        forwardSelectedIds.has(msg.id)
                          ? 'bg-[var(--nova-accent-color, #ff4e18)] scale-100'
                          : 'bg-white/20 hover:bg-white/30 scale-95'
                      }`}
                    >
                      {forwardSelectedIds.has(msg.id) ? (
                        <Check className="w-4 h-4 text-white stroke-[3]" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-white/50" />
                      )}
                    </div>
                  )}
                  {/* Pinned Message Indicator Badge on the bubble */}
                  {msg.isPinned && (
                    <div
                      className={`flex items-center gap-1 text-[9.5px] font-semibold text-[var(--nova-accent-color, #ff4e18)] mb-1 px-1 ${
                        isMine ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <Pin className="w-2.5 h-2.5 fill-current" />
                      <span>Pinned</span>
                      {msg.pinnedNote && (
                        <span className="opacity-90 font-normal">
                          • {highlightMatchedText(msg.pinnedNote, searchQuery, isCurrentSearchMatch)}
                        </span>
                      )}
                    </div>
                  )}

                  {isMine ? (
                    msg.sticker ? (
                      <div className="relative group/sticker flex flex-col items-end my-1">
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-1.5 pl-2.5 pr-2 py-1 rounded-lg bg-black/40 border-l-2 border-white/80 text-xs cursor-pointer select-none transition hover:bg-black/60 max-w-[220px]"
                          >
                            <div className="font-bold text-[10px] text-white/95 truncate">
                              {msg.replyTo.senderName}
                            </div>
                            <p className="text-[11px] truncate text-white/80 font-normal">
                              {msg.replyTo.text}
                            </p>
                          </div>
                        )}
                        <div className="w-36 h-36 flex items-center justify-center p-1 transition hover:scale-105 active:scale-95 duration-200">
                          {msg.sticker.imageUrl ? (
                            <img
                              src={msg.sticker.imageUrl}
                              alt={msg.sticker.name}
                              className="w-full h-full object-contain filter drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
                            />
                          ) : (
                            <span className="text-6xl">{msg.sticker.emoji}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] text-white/85 mt-1 border border-white/10 shadow-md">
                          <span className="font-mono">{msg.time}</span>
                          {msg.isRead ? (
                            <CheckCheck className="w-3.5 h-3.5 inline text-sky-400 stroke-[2.5]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 inline text-white/60 stroke-[2]" />
                          )}
                        </div>
                      </div>
                    ) : msg.poll ? (
                      <div className={`bg-[#171824]/95 border ${theme.border} text-white rounded-[22px] rounded-br-[4px] p-4 max-w-[92%] sm:max-w-md shadow-xl ${theme.shadow}`}>
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-2.5 pl-2.5 pr-2 py-1 rounded-lg bg-black/30 border-l-2 border-white/80 text-xs cursor-pointer select-none transition hover:bg-black/50"
                          >
                            <div className="font-bold text-[10.5px] text-white/95">
                              {msg.replyTo.senderName}
                            </div>
                            <p className="text-[11.5px] truncate text-white/85 font-normal">
                              {msg.replyTo.text}
                            </p>
                          </div>
                        )}
                        <PollBubble
                          poll={msg.poll}
                          onVote={handleVotePoll}
                          onRetractVote={handleRetractVote}
                          isMe={true}
                        />
                        <div className="flex items-center justify-end gap-1.5 text-[10px] text-white/70 mt-2 font-mono">
                          <span>{msg.time}</span>
                          {msg.isRead ? (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-400 stroke-[2.5]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-white/60 stroke-[2]" />
                          )}
                        </div>
                      </div>
                    ) : msg.location ? (
                      <div className={`bg-[#171824]/95 border ${theme.border} text-white rounded-[22px] rounded-br-[4px] p-3 max-w-[88%] sm:max-w-sm shadow-xl ${theme.shadow}`}>
                        <LocationBubble location={msg.location} isMe={true} />
                        <div className="flex items-center justify-end gap-1.5 text-[10px] text-white/70 mt-2 font-mono">
                          <span>{msg.time}</span>
                          {msg.isRead ? (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-400 stroke-[2.5]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-white/60 stroke-[2]" />
                          )}
                        </div>
                      </div>
                    ) : msg.voiceNote ? (
                      <div className={`bg-[#1b1c26]/95 ${theme.border} text-white rounded-[22px] rounded-br-[4px] p-3 max-w-[85%] shadow-lg ${theme.shadow}`}>
                        {msg.forwardedFrom && (
                          <div className="mb-2 flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-lg bg-black/25 border-l-2 border-[var(--nova-accent-color, #ff4e18)]/70 text-[10px] text-white/70">
                            <Forward className="w-2.5 h-2.5 text-[var(--nova-accent-color, #ff4e18)]/70" />
                            <span>Forwarded from {msg.forwardedFrom}</span>
                          </div>
                        )}
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-2 pl-2.5 pr-2 py-1 rounded-lg bg-black/25 border-l-2 border-white/80 text-xs cursor-pointer select-none transition hover:bg-black/35"
                            title={t('chat.replyingTo')}
                          >
                            <div className="font-bold text-[10.5px] text-white/95 flex items-center gap-1">
                              <Reply className="w-2.5 h-2.5" />
                              <span>{msg.replyTo.senderName}</span>
                            </div>
                            <p className="text-[11.5px] truncate text-white/85 mt-0.5 font-normal">
                              {msg.replyTo.text}
                            </p>
                          </div>
                        )}
                        <AudioWaveformPlayer
                          voiceNote={msg.voiceNote}
                          isMe={true}
                          accentColor="var(--nova-accent-color, #ff4e18)"
                        />
                        <div className="flex items-center justify-between gap-2 text-[10px] text-white/70 mt-1.5 font-medium select-none">
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReplyMessage(msg);
                            }}
                            className="text-white/60 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 cursor-pointer transition active:scale-90"
                            title={t('common.reply')}
                          >
                            <Reply className="w-2.5 h-2.5" />
                            <span className="text-[9.5px]">Reply</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-white/75 font-mono">{msg.time}</span>
                            {msg.isRead ? (
                              <span
                                title={t('common.read')}
                                className="inline-flex items-center text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)] animate-in zoom-in-75 duration-200 font-bold"
                              >
                                <CheckCheck className="w-3.5 h-3.5 inline-block stroke-[2.5]" />
                              </span>
                            ) : (
                              <span
                                title={t('common.sent')}
                                className="inline-flex items-center text-white/50 animate-in fade-in duration-150"
                              >
                                <Check className="w-3.5 h-3.5 inline-block stroke-[2]" />
                              </span>
                            )}
                            {msg.id === latestReadSentMsgId && (
                              <span
                                className="inline-flex items-center gap-1 pl-1 ml-0.5 border-l border-white/20 animate-in fade-in zoom-in-75 duration-200 select-none"
                                title={t('common.read')}
                              >
                                <img
                                  src={profile.avatar}
                                  alt="Seen"
                                  className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-white/60 shadow-sm"
                                />
                                <span className="text-[9px] font-semibold text-white/90 hidden sm:inline">Seen</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`bg-gradient-to-r ${theme.grad} text-white rounded-[22px] rounded-br-[4px] px-4 py-2.5 max-w-[82%] shadow-lg ${theme.shadow} text-[14px] leading-relaxed`}>
                        {msg.forwardedFrom && (
                          <div className="mb-2 flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-lg bg-black/25 border-l-2 border-white/60 text-[10px] text-white/70">
                            <Forward className="w-2.5 h-2.5 text-white/70" />
                            <span>Forwarded from {msg.forwardedFrom}</span>
                          </div>
                        )}
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-2 pl-2.5 pr-2 py-1 rounded-lg bg-black/25 border-l-2 border-white/80 text-xs cursor-pointer select-none transition hover:bg-black/35"
                            title={t('chat.replyingTo')}
                          >
                            <div className="font-bold text-[10.5px] text-white/95 flex items-center gap-1">
                              <Reply className="w-2.5 h-2.5" />
                              <span>{msg.replyTo.senderName}</span>
                            </div>
                            <p className="text-[11.5px] truncate text-white/85 mt-0.5 font-normal">
                              {msg.replyTo.text}
                            </p>
                          </div>
                        )}
                        {msg.images && msg.images.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 mb-2 rounded-[16px] overflow-hidden">
                            {msg.images.map((imgUrl, idx) => (
                              <div
                                key={idx}
                                className="rounded-[14px] overflow-hidden h-36 bg-black/20 border border-white/10 relative group cursor-pointer"
                              >
                                <img
                                  src={imgUrl}
                                  alt=""
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.document && (
                          <div className="flex items-center gap-3 p-3 bg-black/25 rounded-2xl border border-white/10 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-white truncate">{msg.document.name}</p>
                              <p className="text-[10.5px] text-white/70 mt-0.5">{msg.document.size}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => triggerPinnedToast(`Downloaded ${msg.document?.name}`)}
                              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition cursor-pointer active:scale-95"
                              title="Download document"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <p>{highlightMatchedText(msg.text, searchQuery, isCurrentSearchMatch)}</p>
                        <div className="flex items-center justify-between gap-2 text-[10px] text-white/80 mt-1.5 font-medium select-none">
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReplyMessage(msg);
                            }}
                            className="text-white/70 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 cursor-pointer transition active:scale-90"
                            title={t('common.reply')}
                          >
                            <Reply className="w-2.5 h-2.5" />
                            <span className="text-[9.5px]">Reply</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-white/85 font-mono">{msg.time}</span>
                            {msg.isRead ? (
                              <span
                                title={t('common.read')}
                                className="inline-flex items-center text-sky-200 drop-shadow-[0_0_6px_rgba(56,189,248,0.9)] animate-in zoom-in-75 duration-200 font-bold"
                              >
                                <CheckCheck className="w-3.5 h-3.5 inline-block stroke-[2.5]" />
                              </span>
                            ) : (
                              <span
                                title={t('common.sent')}
                                className="inline-flex items-center text-white/60 animate-in fade-in duration-150"
                              >
                                <Check className="w-3.5 h-3.5 inline-block stroke-[2]" />
                              </span>
                            )}
                            {msg.id === latestReadSentMsgId && (
                              <span
                                className="inline-flex items-center gap-1 pl-1 ml-0.5 border-l border-white/20 animate-in fade-in zoom-in-75 duration-200 select-none"
                                title={t('common.read')}
                              >
                                <img
                                  src={profile.avatar}
                                  alt="Seen"
                                  className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-white/60 shadow-sm"
                                />
                                <span className="text-[9px] font-semibold text-white/95 hidden sm:inline">Seen</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    msg.sticker ? (
                      <div className="relative group/sticker flex flex-col items-start my-1">
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-1.5 pl-2.5 pr-2 py-1 rounded-lg bg-white/10 border-l-2 border-[var(--nova-accent-color)] text-xs cursor-pointer select-none transition hover:bg-white/15 max-w-[220px]"
                          >
                            <div className="font-bold text-[10px] text-[var(--nova-accent-color)] truncate">
                              {msg.replyTo.senderName}
                            </div>
                            <p className="text-[11px] truncate text-white/80 font-normal">
                              {msg.replyTo.text}
                            </p>
                          </div>
                        )}
                        <div className="w-36 h-36 flex items-center justify-center p-1 transition hover:scale-105 active:scale-95 duration-200">
                          {msg.sticker.imageUrl ? (
                            <img
                              src={msg.sticker.imageUrl}
                              alt={msg.sticker.name}
                              className="w-full h-full object-contain filter drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
                            />
                          ) : (
                            <span className="text-6xl">{msg.sticker.emoji}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] text-white/75 mt-1 border border-white/10 shadow-md">
                          <span className="font-mono">{msg.time}</span>
                        </div>
                      </div>
                    ) : msg.poll ? (
                      <div className="bg-[#171824]/95 border border-white/10 text-[#e5e7eb] rounded-[22px] rounded-tl-[4px] p-4 max-w-[92%] sm:max-w-md shadow-xl shadow-black/40">
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-2.5 pl-2.5 pr-2 py-1 rounded-lg bg-white/5 border-l-2 border-[var(--nova-accent-color)] text-xs cursor-pointer select-none transition hover:bg-white/10"
                          >
                            <div className="font-bold text-[10.5px] text-[var(--nova-accent-color)]">
                              {msg.replyTo.senderName}
                            </div>
                            <p className="text-[11.5px] truncate text-white/80 font-normal">
                              {msg.replyTo.text}
                            </p>
                          </div>
                        )}
                        <PollBubble
                          poll={msg.poll}
                          onVote={handleVotePoll}
                          onRetractVote={handleRetractVote}
                          isMe={false}
                        />
                        <div className="flex items-center justify-end text-[10px] text-[#717682] mt-2 font-mono">
                          <span>{msg.time}</span>
                        </div>
                      </div>
                    ) : msg.location ? (
                      <div className="bg-[#171824]/95 border border-white/10 text-[#e5e7eb] rounded-[22px] rounded-tl-[4px] p-3 max-w-[88%] sm:max-w-sm shadow-xl shadow-black/40">
                        <LocationBubble location={msg.location} isMe={false} />
                        <div className="flex items-center justify-end text-[10px] text-[#717682] mt-2 font-mono">
                          <span>{msg.time}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#181921]/95 border border-white/5 text-[#e5e7eb] rounded-[22px] rounded-tl-[4px] p-3.5 max-w-[88%] shadow-md shadow-black/40 text-[14px] leading-relaxed">
                      {msg.forwardedFrom && (
                        <div className="mb-2 flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-lg bg-white/5 border-l-2 border-[var(--nova-accent-color, #ff4e18)]/70 text-[10px] text-[#868b98]">
                          <Forward className="w-2.5 h-2.5 text-[var(--nova-accent-color, #ff4e18)]/70" />
                          <span>Forwarded from {msg.forwardedFrom}</span>
                        </div>
                      )}
                      {msg.replyTo && (
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJumpToMessage(msg.replyTo!.id);
                          }}
                          className="mb-2 pl-2.5 pr-2 py-1 rounded-lg bg-white/5 border-l-2 border-[var(--nova-accent-color, #ff4e18)] text-xs cursor-pointer select-none transition hover:bg-white/10"
                          title={t('chat.replyingTo')}
                        >
                          <div className="font-bold text-[10.5px] text-[var(--nova-accent-color, #ff4e18)] flex items-center gap-1">
                            <Reply className="w-2.5 h-2.5" />
                            <span>{msg.replyTo.senderName}</span>
                          </div>
                          <p className="text-[11.5px] truncate text-white/80 mt-0.5 font-normal">
                            {msg.replyTo.text}
                          </p>
                        </div>
                      )}
                      {msg.images && msg.images.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mb-2.5">
                          {msg.images.map((imgUrl, idx) => (
                            <div
                              key={idx}
                              className="rounded-[16px] overflow-hidden h-36 bg-[#232530] border border-white/5 relative group cursor-pointer"
                            >
                              <img
                                src={imgUrl}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.voiceNote && (
                        <div className="mb-1">
                          <AudioWaveformPlayer
                            voiceNote={msg.voiceNote}
                            isMe={false}
                            accentColor="var(--nova-accent-color, #ff4e18)"
                          />
                        </div>
                      )}

                      {msg.document && (
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/10 mb-2">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-[var(--nova-accent-color, #ff4e18)]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate">{msg.document.name}</p>
                            <p className="text-[10.5px] text-[#868b98] mt-0.5">{msg.document.size}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => triggerPinnedToast(`Downloaded ${msg.document?.name}`)}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer active:scale-95"
                            title="Download document"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {msg.text && <p>{highlightMatchedText(msg.text, searchQuery, isCurrentSearchMatch)}</p>}

                      <div className="flex items-center justify-between gap-1 text-[10px] text-[#717682] mt-1.5 font-medium select-none">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReplyMessage(msg);
                            }}
                            className="text-[var(--nova-accent-color, #ff4e18)] hover:text-[#ff6e38] flex items-center gap-1 py-0.5 px-1.5 rounded-md hover:bg-white/5 cursor-pointer transition active:scale-90"
                            title="Reply to this message"
                          >
                            <Reply className="w-3 h-3" />
                            <span className="text-[10px] font-semibold">Reply</span>
                          </button>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveReactionMsgId((curr) => (curr === msg.id ? null : msg.id));
                            }}
                            className="text-[#717682] hover:text-rose-400 p-1 rounded-md hover:bg-white/5 transition active:scale-90 cursor-pointer"
                            title="Add reaction"
                          >
                            <Heart className="w-3 h-3" />
                          </button>
                        </div>
                        <span>{msg.time}</span>
                      </div>
                    </div>
                  ))}

                  {/* Selected Emoji Reactions Display at Bottom of Bubble */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div
                      className={`flex items-center gap-1.5 -mt-2.5 relative z-10 animate-in zoom-in-90 fade-in duration-150 ${
                        isMine ? 'justify-end pr-2' : 'justify-start pl-2'
                      }`}
                    >
                      {msg.reactions.map((r, i) => (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectReaction(msg.id, r.emoji);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs transition-all duration-200 cursor-pointer active:scale-90 shadow-lg ${
                            r.fromMe
                              ? 'bg-[#20151c]/95 border border-[var(--nova-accent-color, #ff4e18)]/70 text-white font-bold ring-1 ring-[var(--nova-accent-color, #ff4e18)]/40 shadow-[var(--nova-accent-color, #ff4e18)]/25'
                              : 'bg-[#181920]/95 border border-white/10 text-white/90 hover:bg-[#20222a]'
                          }`}
                        >
                          <span>{r.emoji}</span>
                          <span className="text-[10px] opacity-75">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-start animate-in fade-in duration-200">
            <div className="bg-[#181921]/95 border border-[var(--nova-accent-color, #ff4e18)]/25 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 shadow-md shadow-black/50">
              {typingActivity === 'recording' ? (
                <>
                  <Mic className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)] animate-pulse" />
                  <span className="text-xs text-[var(--nova-accent-color, #ff4e18)] font-semibold">Katie is recording audio</span>
                  <div className="flex items-center gap-0.5 h-2.5">
                    <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-1" />
                    <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_0.2s_infinite] h-2.5" />
                    <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_0.4s_infinite] h-1.5" />
                    <span className="w-0.5 bg-[var(--nova-accent-color, #ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_0.1s_infinite] h-2" />
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs text-[var(--nova-accent-color, #ff4e18)] font-semibold">Katie is typing</span>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce [animation-delay:-0.32s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce [animation-delay:-0.16s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)] animate-bounce" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* FLOATING IN-CHAT SEARCH MATCH NAVIGATOR */}
      {isSearchOpen && searchQuery.trim() && matchingMessages.length > 0 && (
        <div className="mx-4 mb-2 z-20 flex items-center justify-between bg-[#151622]/95 backdrop-blur-xl border border-[var(--nova-accent-color, #ff4e18)]/40 rounded-2xl px-3.5 py-2 shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-bottom-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)] shrink-0">
              <Search className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white truncate">
                Word: <span className="text-[var(--nova-accent-color, #ff4e18)]">&quot;{searchQuery}&quot;</span>
              </span>
              <span className="text-[10px] text-[#8e93a0]">
                Match {activeMatchIndex + 1} of {matchingMessages.length} •{' '}
                {searchFilterMode === 'filtered' ? 'Filtered view' : 'In conversation stream'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handlePrevMatch}
              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/80 hover:text-white flex items-center gap-1 text-xs font-medium transition cursor-pointer active:scale-95"
              title={t('common.previous')}
            >
              <ChevronUp className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)]" />
              <span className="text-[11px] font-semibold">Prev</span>
            </button>
            <button
              onClick={handleNextMatch}
              className="px-2 py-1 rounded-lg bg-[var(--nova-accent-color, #ff4e18)]/20 hover:bg-[var(--nova-accent-color, #ff4e18)]/30 border border-[var(--nova-accent-color, #ff4e18)]/40 text-[var(--nova-accent-color, #ff4e18)] flex items-center gap-1 text-xs font-medium transition cursor-pointer active:scale-95"
              title={t('common.next')}
            >
              <span className="text-[11px] font-semibold">Next</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* FORWARD SELECTION TOOLBAR */}
      {isForwardSelecting && (
        <div className="px-4 py-2.5 bg-[#161724]/95 border-t border-b border-[var(--nova-accent-color, #ff4e18)]/40 flex items-center justify-between z-20 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)] shrink-0 border border-[var(--nova-accent-color, #ff4e18)]/30">
              <Forward className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-white">
                {forwardSelectedIds.size} message{forwardSelectedIds.size > 1 ? 's' : ''} selected
              </span>
              <p className="text-[10px] text-[#868b98]">Tap messages to select or deselect</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenForwardModal}
              className="px-3 py-1.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)] hover:bg-[var(--nova-accent-color, #ff5d2b)] text-white text-xs font-semibold transition cursor-pointer shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/30 active:scale-95 flex items-center gap-1.5"
            >
              <Forward className="w-3.5 h-3.5" />
              <span>Forward</span>
            </button>
            <button
              onClick={handleCancelForward}
              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition flex items-center gap-1 text-[11px] font-semibold cursor-pointer active:scale-95"
              title={t('common.cancel')}
            >
              <X className="w-3.5 h-3.5 text-white/60" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Reply Preview Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-[#161724]/95 border-t border-b border-[var(--nova-accent-color, #ff4e18)]/40 flex items-center justify-between text-xs z-20 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-150">
          <div
            onClick={() => handleJumpToMessage(replyingTo.id)}
            className="flex items-center gap-2.5 truncate cursor-pointer group flex-1 mr-2"
            title={t('chat.replyingTo')}
          >
            <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)] shrink-0 border border-[var(--nova-accent-color, #ff4e18)]/30">
              <Reply className="w-3.5 h-3.5" />
            </div>
            <div className="truncate flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--nova-accent-color, #ff4e18)] font-bold text-[11px] group-hover:underline">
                  Replying to {replyingTo.senderId === 'me' ? 'Yourself' : profile.name}
                </span>
                <span className="text-[10px] text-white/40">· Click to jump</span>
              </div>
              <p className="text-[#868b98] truncate text-[11px] mt-0.5 font-normal">
                {replyingTo.text || (replyingTo.voiceNote ? `Voice note (${replyingTo.voiceNote.duration})` : 'Photo attachment')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setReplyingTo(null);
              triggerPinnedToast('Reply cancelled');
            }}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition flex items-center gap-1 text-[11px] font-semibold cursor-pointer shrink-0 active:scale-95"
            title={t('common.cancel')}
          >
            <X className="w-3.5 h-3.5 text-white/60" />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {/* SCHEDULED MESSAGES QUEUE BANNER */}
      {scheduledMessages.length > 0 && (
        <div className="px-4 py-1.5 bg-[#181926]/95 backdrop-blur-md border-t border-[var(--nova-accent-color, #ff4e18)]/30 flex items-center justify-between text-xs z-20 animate-in fade-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 truncate">
            <Clock className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)] shrink-0 animate-pulse" />
            <span className="text-white/85 truncate text-[11px]">
              <strong className="text-[var(--nova-accent-color, #ff4e18)] font-semibold">
                {scheduledMessages.length}
              </strong>{' '}
              {scheduledMessages.length === 1 ? 'message scheduled' : 'messages scheduled'} (
              {scheduledMessages[0].formattedTime})
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                const item = scheduledMessages[0];
                setScheduledMessages((prev) => prev.slice(1));
                const newMsg: ChatMessage = {
                  id: 'm-' + Date.now(),
                  senderId: 'me',
                  text: item.text,
                  voiceNote: item.voiceNote,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  isRead: true,
                };
                setMessages((msgs) => [...msgs, newMsg]);
                triggerPinnedToast('Sent scheduled message now');
              }}
              className="text-[10px] text-[var(--nova-accent-color, #ff4e18)] hover:text-[#ff6e38] font-semibold hover:underline cursor-pointer"
            >
              Send Now
            </button>
            <button
              onClick={() => {
                setScheduledMessages([]);
                triggerPinnedToast('Scheduled messages cancelled');
              }}
              className="text-white/40 hover:text-white p-0.5 cursor-pointer text-xs"
              title={t('common.cancel')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM INPUT AREA */}
      <div className="p-3 pt-1 relative z-20 shrink-0 space-y-2">
        {/* ATTACHMENT MENU DRAWER */}
        {isAttachmentMenuOpen && (
          <div ref={attachmentMenuRef} className="flex items-center gap-2 p-2 bg-[#141520]/95 backdrop-blur-xl border border-[var(--nova-accent-color, #ff4e18)]/30 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-150 overflow-x-auto scrollbar-x">
            <button
              type="button"
              onClick={() => handleAttachItem('photo')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <Camera className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)]" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('location')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Location</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('document')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Document</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('poll')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('attachment.poll', 'Poll')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('stickers')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <Smile className="w-3.5 h-3.5 text-purple-400" />
              <span>{t('stickers.title', 'Stickers')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('voice')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color, #ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <Mic className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)]" />
              <span>Voice Memo</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAttachmentMenuOpen(false)}
              className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition ml-auto shrink-0"
              title={t('common.close')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* EMOJI QUICK BAR */}
        {isEmojiPickerOpen && (
          <div ref={emojiBarRef} className="flex items-center gap-1.5 p-2 bg-[#141520]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-150 overflow-x-auto no-scrollbar" data-testid="emoji-bar">
            <span className="text-[10px] text-white/40 font-semibold px-1 shrink-0">Insert:</span>
            {['😊', '❤️', '🔥', '👍', '😂', '🎉', '🏖️', '✨', '🙌', '🍹', '😍', '👏'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInputText((prev) => prev + emoji);
                  mainInputRef.current?.focus();
                }}
                className="text-lg p-1 rounded-xl hover:bg-white/10 hover:scale-125 transition active:scale-90 cursor-pointer shrink-0"
                title={`Insert ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsEmojiPickerOpen(false)}
              className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition ml-auto shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* STICKERS / EMOJI / GIF DRAWER */}
        <StickerPickerDrawer
          isOpen={isStickerDrawerOpen}
          onClose={() => setIsStickerDrawerOpen(false)}
          onSelectEmoji={(emoji) => {
            setInputText((prev) => prev + emoji);
            mainInputRef.current?.focus();
          }}
          onSendSticker={handleSendSticker}
          onSendGif={handleSendGif}
        />

        {/* ROW OF SMART REPLY PILL BUTTONS */}
        {shouldShowSmartReplies && (
          <div ref={smartRepliesRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none" data-testid="smart-replies">
            <div className="flex items-center gap-1 text-[11px] text-[var(--nova-accent-color, #ff4e18)] font-semibold shrink-0 pl-1 pr-1">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden sm:inline">Smart:</span>
            </div>

            {smartReplies.map((reply, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(reply, replyingTo ?? lastReceivedMessage)}
                className="rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-[#161723]/95 hover:bg-[var(--nova-accent-color, #ff4e18)] hover:text-white border border-white/10 hover:border-[var(--nova-accent-color, #ff4e18)] text-white/90 shadow-sm backdrop-blur-md transition-all duration-150 active:scale-95 shrink-0 whitespace-nowrap cursor-pointer group flex items-center gap-1.5"
                title={`Tap to send: "${reply}"`}
              >
                <span>{reply}</span>
              </button>
            ))}

            <button
              onClick={() => {
                if (lastReceivedMessage) {
                  setDismissedSmartReplyMsgId(lastReceivedMessage.id);
                }
              }}
              className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 text-white/40 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer ml-0.5"
              title="Dismiss smart replies"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* STAGED ATTACHMENT PREVIEW CHIP */}
        {stagedAttachment && (
          <div className="flex items-center justify-between gap-2.5 p-2 bg-[#171825]/95 backdrop-blur-xl border border-[var(--nova-accent-color, #ff4e18)]/40 rounded-2xl shadow-xl animate-in slide-in-from-bottom-2 duration-150">
            {stagedAttachment.images && stagedAttachment.images.length > 0 && (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex items-center -space-x-2.5 overflow-hidden py-0.5 pl-1 shrink-0">
                  {stagedAttachment.images.slice(0, 3).map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt=""
                      className="w-10 h-10 rounded-xl object-cover border-2 border-[#171825] shadow-md"
                    />
                  ))}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-white truncate">
                    {stagedAttachment.images.length}{' '}
                    {stagedAttachment.images.length === 1 ? 'photo attached' : 'photos attached'}
                  </span>
                  <span className="text-[10.5px] text-[#868b98]">Ready to send with your message</span>
                </div>
              </div>
            )}

            {stagedAttachment.document && (
              <div className="flex items-center gap-2.5 pl-1 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)] shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-white truncate">
                    {stagedAttachment.document.name}
                  </span>
                  <span className="text-[10px] text-[#868b98]">{stagedAttachment.document.size}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setStagedAttachment(null)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition cursor-pointer shrink-0 ml-auto"
              title="Remove attachment"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Paperclip Button opening Simulated File Selection Menu */}
          <button
            type="button"
            onClick={() => {
              setIsFileModalOpen(true);
              setIsEmojiPickerOpen(false);
              setIsAttachmentMenuOpen(false);
            }}
            className={`w-11 h-11 rounded-full border flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0 ${
              isFileModalOpen || stagedAttachment
                ? 'bg-[var(--nova-accent-color, #ff4e18)] text-white border-[var(--nova-accent-color, #ff4e18)] shadow-[var(--nova-accent-color, #ff4e18)]/30'
                : 'bg-[#181920]/95 hover:bg-[#20222a] border-white/10 text-white/70 hover:text-white'
            }`}
            title={t('common.attach')}
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <div className="flex-1 bg-[#181920]/95 border border-white/10 focus-within:border-[var(--nova-accent-color, #ff4e18)]/60 rounded-full pl-4 pr-1.5 py-1.5 flex items-center transition shadow-md min-w-0">
            <input
              ref={mainInputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder={replyingTo ? t('chat.replyingToName', { name: replyingTo.senderId === 'me' ? t('common.you') : profile.name }) : t('chat.typeMessage')}
              className="w-full bg-transparent text-sm text-white placeholder-white/35 focus:outline-none py-1 min-w-0"
            />

            {/* Emoji Picker Button inside input field */}
            <button
              type="button"
              onClick={() => {
                setIsEmojiPickerOpen((prev) => !prev);
                setIsAttachmentMenuOpen(false);
              }}
              className={`p-1.5 rounded-full transition cursor-pointer shrink-0 active:scale-90 ${
                isEmojiPickerOpen
                  ? 'text-[var(--nova-accent-color, #ff4e18)] bg-white/10'
                  : 'text-white/50 hover:text-[var(--nova-accent-color, #ff4e18)] hover:bg-white/10'
              }`}
              title={t('common.react')}
            >
              <Smile className="w-4 h-4" />
            </button>
          </div>

          {inputText.trim() ? (
            <button
              type="button"
              onPointerDown={handleSendPointerDown}
              onPointerUp={handleSendPointerUp}
              onPointerLeave={handleSendPointerCancel}
              onPointerCancel={handleSendPointerCancel}
              onClick={(e) => {
                if (e.detail === 0) handleSendMessage();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setIsScheduleModalOpen(true);
              }}
              style={{ touchAction: 'manipulation' }}
              className="w-11 h-11 rounded-full bg-[var(--nova-accent-color, #ff4e18)] hover:bg-[var(--nova-accent-color, #ff5d2b)] active:scale-90 text-white flex items-center justify-center shadow-lg shadow-[var(--nova-accent-color, #ff4e18)]/30 transition cursor-pointer relative group select-none shrink-0"
              title={t('common.send')}
            >
              <Send className="w-4 h-4 ml-0.5" />
              {/* Hold hint badge */}
              <div className="absolute -top-7 right-0 bg-[#1e202a] text-white text-[9px] px-2 py-0.5 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md">
                Hold to schedule 🕒
              </div>
            </button>
          ) : (
            <VoiceMemoInput
              ref={voiceMemoRef}
              onSendVoiceMemo={handleSendVoiceNote}
              onScheduleVoiceMemo={(note) => {
                setRecordedVoiceNote(note);
                setIsScheduleModalOpen(true);
              }}
              disabled={isSearchOpen}
            />
          )}
        </div>
      </div>
        </>
      )}

      {/* Wallpaper Settings Modal */}
      <WallpaperSettingsModal
        isOpen={isWallpaperModalOpen}
        currentWallpaper={wallpaperId}
        intensity={wallpaperIntensity}
        onSelect={handleSelectWallpaper}
        onIntensityChange={handleIntensityChange}
        onCycle={handleCycleWallpaper}
        onClose={() => setIsWallpaperModalOpen(false)}
      />

      {/* SCHEDULE MESSAGE MODAL */}
      <ScheduleMessageModal
        isOpen={isScheduleModalOpen}
        messageText={inputText || (recordedVoiceNote ? `Voice note (${recordedVoiceNote.duration})` : '')}
        onSchedule={handleScheduleMessage}
        onClose={() => setIsScheduleModalOpen(false)}
      />

      {/* SIMULATED FULL-SCREEN VIDEO CALL OVERLAY */}
      <VideoCallOverlay
        isOpen={isVideoCallOpen}
        isMinimized={isVideoCallMinimized}
        onEndCall={handleEndVideoCall}
        onMinimize={() => setIsVideoCallMinimized(true)}
        onMaximize={() => setIsVideoCallMinimized(false)}
        contactName={profile.name}
        contactAvatar={profile.avatar}
      />

      {/* SIMULATED FILE & MEDIA SELECTION MODAL */}
      <FileSelectionModal
        isOpen={isFileModalOpen}
        onClose={() => setIsFileModalOpen(false)}
        onSendAttachment={handleSendAttachmentFromModal}
        onStageAttachment={(payload) => {
          setStagedAttachment(payload);
          triggerPinnedToast(
            payload.images
              ? `${payload.images.length} photo(s) attached`
              : payload.document
              ? `${payload.document.name} attached`
              : 'Attachment added'
          );
        }}
      />

      {/* POLL CREATE MODAL */}
      <PollCreateModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        onCreatePoll={handleCreatePoll}
      />

      {/* LOCATION PICKER MODAL */}
      <LocationPickerModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        onSendLocation={handleSendLocation}
      />

      {/* FORWARD RECIPIENT MODAL */}
      {isForwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsForwardModalOpen(false)}>
          <div
            className="w-full max-w-sm mx-4 bg-[#151621]/98 border border-white/15 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">Forward to</h3>
              <button
                onClick={() => setIsForwardModalOpen(false)}
                className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {MOCK_CHATS.filter((c) => c.id !== chatId && c.type !== 'channel').map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleForwardToChat(chat.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition cursor-pointer"
                >
                  <img
                    src={chat.avatar}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10"
                  />
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{chat.name}</p>
                    <p className="text-[11px] text-[#868b98]">
                      {chat.type === 'group' ? 'Group' : 'Direct'}
                    </p>
                  </div>
                  <Forward className="w-4 h-4 text-[var(--nova-accent-color, #ff4e18)] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
