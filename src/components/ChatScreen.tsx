import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Paperclip,
  Send,
  Mic,
  Check,
  CheckCheck,
  Copy,
  Reply,
  Trash2,
  Square,
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
  Calendar,
  Video,
  Sparkles,
  Image as ImageIcon,
  Smile,
  MapPin,
  FileText,
  Camera,
} from 'lucide-react';
import { INITIAL_KATIE_MESSAGES, KATIE_PROFILE, KATIE_SHARED_MEDIA } from '../data/mockMessengerData';
import { ChatMessage, VoiceNoteData } from '../types/messenger';
import { DoodleBackground } from './DoodleBackground';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { VoiceMemoInput, VoiceMemoInputHandle } from './VoiceMemoInput';
import { WallpaperSettingsModal } from './WallpaperSettingsModal';
import { ScheduleMessageModal } from './ScheduleMessageModal';
import { VideoCallOverlay } from './VideoCallOverlay';
import { SharedMediaSection } from './SharedMediaSection';
import {
  WALLPAPER_OPTIONS,
  WALLPAPER_STORAGE_KEY,
  WALLPAPER_INTENSITY_KEY,
  WallpaperId,
} from '../data/wallpapers';

interface ChatScreenProps {
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

export const ChatScreen: React.FC<ChatScreenProps> = ({ onBack, onOpenProfile }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return INITIAL_KATIE_MESSAGES.map((msg, idx) => {
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
  const [isTyping, setIsTyping] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

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
    } catch {}
    return 'neon-nebula';
  });
  const [wallpaperIntensity, setWallpaperIntensity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(WALLPAPER_INTENSITY_KEY);
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 20 && val <= 100) return val;
      }
    } catch {}
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
  const [dismissedSmartReplyMsgId, setDismissedSmartReplyMsgId] = useState<string | null>(null);
  const [activeHeaderTab, setActiveHeaderTab] = useState<'chat' | 'gallery'>('chat');
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  // Scheduled Messages State
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessageItem[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const sendLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSendLongPressTriggeredRef = useRef(false);

  // Voice recording & waveform staging states
  const voiceMemoRef = useRef<VoiceMemoInputHandle>(null);
  const [isVoiceMemoActive, setIsVoiceMemoActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [liveWaveform, setLiveWaveform] = useState<number[]>([25, 45, 70, 55, 30, 40, 80, 60, 35, 50, 75, 40]);
  const [recordedVoiceNote, setRecordedVoiceNote] = useState<VoiceNoteData | null>(null);

  // Swipe-to-reply gesture states
  const [swipingMsgId, setSwipingMsgId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const swipeTriggeredRef = useRef(false);
  const isDraggingRef = useRef(false);
  const mainInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressFiredRef = useRef(false);
  const pointerStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const waveformTimerRef = useRef<NodeJS.Timeout | null>(null);

  const pinnedMessages = messages.filter((m) => m.isPinned);

  const scrollToBottom = () => {
    if (!searchQuery.trim()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isRecording, recordedVoiceNote, isVoiceMemoActive]);

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
          }, 1800);

          // Simulate Katie's reply
          setTimeout(() => {
            setIsTyping(true);
          }, 1200);

          setTimeout(() => {
            setIsTyping(false);
            setMessages((msgs) => [
              ...msgs,
              {
                id: 'm-' + (Date.now() + 1),
                senderId: 'other',
                text: "Got your message! Perfect timing, talk to you soon 🙌",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
          }, 2800);
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
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (sendLongPressTimerRef.current) clearTimeout(sendLongPressTimerRef.current);
    };
  }, []);

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
              : 'bg-[#ff4e18]/35 text-white font-semibold rounded px-1 py-0.5 border border-[#ff4e18]/40'
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
    } catch {}
    const item = WALLPAPER_OPTIONS.find((o) => o.id === id);
    triggerPinnedToast(`Wallpaper: ${item?.name || id}`);
  };

  const handleIntensityChange = (intensity: number) => {
    setWallpaperIntensity(intensity);
    try {
      localStorage.setItem(WALLPAPER_INTENSITY_KEY, intensity.toString());
    } catch {}
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
    triggerPinnedToast(`Starting video call with ${KATIE_PROFILE.name}...`);
  };

  const handleEndVideoCall = (durationFormatted: string) => {
    setIsVideoCallOpen(false);
    setIsVideoCallMinimized(false);
    triggerPinnedToast(`Video call ended • ${durationFormatted}`);

    // Add a record to chat history
    const callRecordMsg: ChatMessage = {
      id: 'call-' + Date.now(),
      senderId: 'me',
      text: `📹 Video call with ${KATIE_PROFILE.name.split(' ')[0]} • Duration: ${durationFormatted}`,
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
  const handleSendPointerDown = () => {
    isSendLongPressTriggeredRef.current = false;
    sendLongPressTimerRef.current = setTimeout(() => {
      isSendLongPressTriggeredRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      setIsScheduleModalOpen(true);
    }, 450);
  };

  const handleSendPointerUp = () => {
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
  const startVoiceRecording = () => {
    setIsRecording(true);
    setRecordingDuration(0);
    setRecordedVoiceNote(null);
    setLiveWaveform([25, 40, 65, 80, 45, 30, 55, 75, 90, 60, 40, 50]);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }

    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);

    waveformTimerRef.current = setInterval(() => {
      setLiveWaveform((prev) => {
        const randomHeight = Math.floor(Math.random() * 70) + 25;
        const updated = [...prev.slice(1), randomHeight];
        return updated.length < 20 ? [...updated, randomHeight] : updated;
      });
    }, 100);
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    setRecordedVoiceNote(null);
  };

  const stopAndPreviewVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    setIsRecording(false);

    const durationSecs = Math.max(1, recordingDuration);
    const m = Math.floor(durationSecs / 60);
    const s = durationSecs % 60;
    const formattedDuration = `${m}:${s < 10 ? '0' : ''}${s}`;

    const barsCount = 26;
    const generatedWaveform: number[] = Array.from({ length: barsCount }, (_, idx) => {
      const wave = Math.sin((idx / barsCount) * Math.PI) * 55;
      const jitter = Math.floor(Math.random() * 40) + 15;
      return Math.min(100, Math.max(20, Math.floor(wave + jitter)));
    });

    setRecordedVoiceNote({
      duration: formattedDuration,
      durationSeconds: durationSecs,
      waveform: generatedWaveform,
    });
  };

  const handleSendVoiceNote = (customNote?: VoiceNoteData) => {
    const noteToSend = customNote || recordedVoiceNote;
    if (!noteToSend) return;

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    setIsRecording(false);

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
            senderName: replyingTo.senderId === 'me' ? 'You' : KATIE_PROFILE.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    setRecordedVoiceNote(null);
    setRecordingDuration(0);
    setReplyingTo(null);

    // Transition read status after 1.8s
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 1800);

    setTimeout(() => {
      setIsTyping(true);
    }, 1200);

    setTimeout(() => {
      setIsTyping(false);
      const shouldVoiceReply = Math.random() > 0.4;
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

  const handleDirectSendRecording = () => {
    const durationSecs = Math.max(1, recordingDuration);
    const m = Math.floor(durationSecs / 60);
    const s = durationSecs % 60;
    const formattedDuration = `${m}:${s < 10 ? '0' : ''}${s}`;

    const barsCount = 26;
    const generatedWaveform: number[] = Array.from({ length: barsCount }, (_, idx) => {
      const wave = Math.sin((idx / barsCount) * Math.PI) * 55;
      const jitter = Math.floor(Math.random() * 40) + 15;
      return Math.min(100, Math.max(20, Math.floor(wave + jitter)));
    });

    handleSendVoiceNote({
      duration: formattedDuration,
      durationSeconds: durationSecs,
      waveform: generatedWaveform,
    });
  };

  const handleTriggerIncomingVoiceNote = () => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
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
    }, 1200);
  };

  // Pointer, Swipe-to-Reply & Double-tap Handlers
  const handlePointerDown = (e: React.PointerEvent, msgId: string) => {
    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    swipeTriggeredRef.current = false;
    isDraggingRef.current = false;
    isLongPressFiredRef.current = false;

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

      setSwipingMsgId(msg.id);
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

  const handlePointerUp = (_e: React.PointerEvent, msg: ChatMessage) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isLongPressFiredRef.current) {
      isLongPressFiredRef.current = false;
      return;
    }

    if (isDraggingRef.current && swipingMsgId === msg.id) {
      if (swipeOffset >= 42) {
        handleReplyMessage(msg);
        triggerPinnedToast(`Replying to ${msg.senderId === 'me' ? 'myself' : KATIE_PROFILE.name}`);
        setTimeout(() => {
          mainInputRef.current?.focus();
        }, 80);
      }
      setSwipeOffset(0);
      setTimeout(() => {
        setSwipingMsgId(null);
      }, 250);
      isDraggingRef.current = false;
      return;
    }

    isDraggingRef.current = false;

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
    if (isDraggingRef.current) {
      setSwipeOffset(0);
      setTimeout(() => {
        setSwipingMsgId(null);
      }, 250);
      isDraggingRef.current = false;
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
    setIsVoiceMemoActive(false);
    setIsAttachmentMenuOpen(false);
    setIsEmojiPickerOpen(false);
    const preview = msg.text || (msg.voiceNote ? `Voice message (${msg.voiceNote.duration})` : 'Photo attachment');
    const sender = msg.senderId === 'me' ? 'myself' : KATIE_PROFILE.name;
    triggerPinnedToast(`Replying to ${sender}: "${preview.slice(0, 26)}${preview.length > 26 ? '...' : ''}"`);
    setHighlightedMsgId(msg.id);
    setTimeout(() => {
      mainInputRef.current?.focus();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  const handleAttachItem = (type: 'photo' | 'location' | 'document' | 'voice') => {
    setIsAttachmentMenuOpen(false);
    if (type === 'voice') {
      setIsVoiceMemoActive(true);
      return;
    }

    const messageId = 'm-' + Date.now();
    let newMsg: ChatMessage;

    if (type === 'photo') {
      newMsg = {
        id: messageId,
        senderId: 'me',
        images: [
          'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=800&q=80',
        ],
        text: 'Sharing a quick snapshot from today! 📸✨',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: false,
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
              senderName: replyingTo.senderId === 'me' ? 'You' : KATIE_PROFILE.name,
            }
          : undefined,
      };
      triggerPinnedToast('Photo attachment sent');
    } else if (type === 'location') {
      newMsg = {
        id: messageId,
        senderId: 'me',
        text: "📍 Harry's Bar & Bistro, Kyiv (Live GPS Location)",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: false,
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
              senderName: replyingTo.senderId === 'me' ? 'You' : KATIE_PROFILE.name,
            }
          : undefined,
      };
      triggerPinnedToast('Location shared');
    } else {
      newMsg = {
        id: messageId,
        senderId: 'me',
        text: '📄 Summer_Trip_Schedule.pdf (2.4 MB - Document attached)',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: false,
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
              senderName: replyingTo.senderId === 'me' ? 'You' : KATIE_PROFILE.name,
            }
          : undefined,
      };
      triggerPinnedToast('Document attached');
    }

    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);

    // Transition read status after 1.8s
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 1800);
  };

  const handleSendMessage = (customText?: string) => {
    const text = (customText ?? inputText).trim();
    if (!text) return;

    const messageId = 'm-' + Date.now();
    const newMessage: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? 'Voice message' : 'Photo attachment'),
            senderName: replyingTo.senderId === 'me' ? 'You' : KATIE_PROFILE.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    if (!customText) {
      setInputText('');
    }
    setReplyingTo(null);

    // Transition read status after 1.8s
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 1800);

    setTimeout(() => {
      setIsTyping(true);
    }, 1200);

    setTimeout(() => {
      setIsTyping(false);
      const responses = [
        "Sounds awesome! Let's definitely do that.",
        "Perfect, I'll text John now and let you know what he says!",
        "Can't wait to catch up, it's been way too long! 🎉",
        "Deal! Let's meet at 7pm then.",
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setMessages((prev) => [
        ...prev,
        {
          id: 'm-' + (Date.now() + 1),
          senderId: 'other',
          text: randomResponse,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 2800);
  };

  // Context-aware Smart Reply suggestions based on the last received message content
  const lastReceivedMessage = useMemo(() => {
    return [...messages].reverse().find((m) => m.senderId === 'other');
  }, [messages]);

  const isLastMessageFromOther =
    messages.length > 0 && messages[messages.length - 1].senderId === 'other';

  const smartReplies = useMemo(() => {
    if (!lastReceivedMessage) return [];

    // Voice note
    if (lastReceivedMessage.voiceNote) {
      return [
        "Listening to it now! 🎧",
        "Sounds like a plan! 🙌",
        "I'll send a voice note back 🎙️",
        "Can't wait to catch up! 🔥",
      ];
    }

    const text = (lastReceivedMessage.text || '').toLowerCase();

    // Questions about sunday, open hours, or visiting places
    if (
      text.includes('sunday') ||
      text.includes('open') ||
      text.includes('visit') ||
      text.includes('?')
    ) {
      return [
        "Yes, they're open till 11pm! 🍹",
        "Let's definitely go on Sunday! 🙌",
        "I'll double check the hours 🔍",
        "What time works best for you? ⏰",
      ];
    }

    // Waiting for reply
    if (text.includes('waiting') || text.includes('reply') || text.includes('hear')) {
      return [
        "Sorry for the delay, free now! 🙏",
        "Here now! What's the plan? 😊",
        "Count me in! 🚀",
        "Calling you in 5 mins 📞",
      ];
    }

    // Plans / timing / meetup / 7pm
    if (text.includes('meet') || text.includes('time') || text.includes('7pm') || text.includes('soon')) {
      return [
        "7pm at Harry's works great! 🍻",
        "Perfect, see you there! 👋",
        "I might be 10 mins late ⏳",
        "Can't wait! ✨",
      ];
    }

    // Confirmation / deal / awesome / perfect
    if (
      text.includes('awesome') ||
      text.includes('perfect') ||
      text.includes('deal') ||
      text.includes('great')
    ) {
      return [
        "Deal! See you then 🙌",
        "Can't wait! 🎉",
        "I'll text when I'm on my way 🚗",
        "Sounds great! ✨",
      ];
    }

    // Travel / photos / flight
    if (
      text.includes('flight') ||
      text.includes('trip') ||
      text.includes('photo') ||
      text.includes('hostel')
    ) {
      return [
        "Those photos look unreal! 📸",
        "So excited for the trip! 🌴",
        "Have the best time! 😍",
        "Send more pictures please! 🏝️",
      ];
    }

    // Video call record message
    if (text.includes('video call')) {
      return [
        "Great talking to you! 👋",
        "Let's call again soon! 📹",
        "Send me the link we talked about 🔗",
      ];
    }

    // Default intelligent conversational suggestions
    return [
      "Sounds good to me! 👍",
      "Let's do it! 🚀",
      "Give me just a few minutes ⏳",
      "Haha totally agree! 😂",
    ];
  }, [lastReceivedMessage]);

  const shouldShowSmartReplies =
    !isRecording &&
    !isVoiceMemoActive &&
    !recordedVoiceNote &&
    isLastMessageFromOther &&
    lastReceivedMessage &&
    dismissedSmartReplyMsgId !== lastReceivedMessage.id &&
    smartReplies.length > 0;

  const sharedMediaCount = useMemo(() => {
    const urls = new Set<string>();
    messages.forEach((m) => {
      m.images?.forEach((u) => urls.add(u));
    });
    (KATIE_PROFILE.sharedMedia || KATIE_SHARED_MEDIA).forEach((item) => {
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

  const formatRecordingTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-[#ff4e18]/50 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Clock className="w-3.5 h-3.5 text-[#ff4e18]" />
          <span>{pinnedToast}</span>
        </div>
      )}

      {/* Floating Header Pill */}
      <div className="p-3 shrink-0 relative z-20">
        <div className="bg-[#14151c]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 flex items-center justify-between shadow-xl shadow-black/60 min-h-[52px]">
          {isSearchOpen ? (
            /* ACTIVE SEARCH BAR HEADER WITH WORD STEPPER & CONTROLS */
            <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-200">
              <button
                onClick={handleCloseSearch}
                className="w-8 h-8 rounded-full bg-[#1f2029]/80 hover:bg-[#282a36] border border-white/5 flex items-center justify-center text-white/90 active:scale-95 transition cursor-pointer shrink-0"
                title="Back to conversation"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="flex-1 bg-[#1a1b26] border border-[#ff4e18]/50 focus-within:border-[#ff4e18] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 shadow-inner min-w-0">
                <Search className="w-4 h-4 text-[#ff4e18] shrink-0" />
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
                  placeholder="Find words in chat..."
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
                    title="Clear search query"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Match counter badge */}
                {searchQuery.trim() && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#ff4e18]/20 text-[#ff4e18] shrink-0 border border-[#ff4e18]/30 font-semibold whitespace-nowrap">
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
                    className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-[#ff4e18] transition cursor-pointer active:scale-95"
                    title="Previous match (Shift+Enter / ▲)"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNextMatch}
                    className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-[#ff4e18] transition cursor-pointer active:scale-95"
                    title="Next match (Enter / ▼)"
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
                      ? 'bg-[#ff4e18] text-white shadow-md shadow-[#ff4e18]/30 border border-[#ff4e18]'
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

              <div className="flex flex-col items-center flex-1 mx-1.5 min-w-0">
                <button
                  onClick={onOpenProfile}
                  className="flex flex-col items-center cursor-pointer focus:outline-none group truncate max-w-full"
                >
                  <span className="font-bold text-[14.5px] text-white tracking-tight group-hover:text-[#ff4e18] transition truncate">
                    {KATIE_PROFILE.name}
                  </span>
                  {isTyping ? (
                    <div className="flex items-center gap-1.5 mt-0.5 animate-in fade-in duration-200">
                      <span className="text-[11px] font-semibold text-[#ff4e18] tracking-tight animate-pulse">
                        Katie is typing...
                      </span>
                      <div className="flex items-center gap-0.5 pt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e18] animate-bounce [animation-delay:-0.32s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e18] animate-bounce [animation-delay:-0.16s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e18] animate-bounce" />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-[#868b98] font-normal leading-none mt-0.5 transition-colors">
                      {KATIE_PROFILE.status}
                    </span>
                  )}
                </button>

                {/* Header Menu Tabs: [ Chat | Gallery ] */}
                <div className="flex items-center gap-0.5 mt-1 p-0.5 bg-[#181922] rounded-lg border border-white/5 select-none shrink-0">
                  <button
                    onClick={() => setActiveHeaderTab('chat')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                      activeHeaderTab === 'chat'
                        ? 'bg-[#ff4e18] text-white shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setActiveHeaderTab('gallery')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                      activeHeaderTab === 'gallery'
                        ? 'bg-[#ff4e18] text-white shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <ImageIcon className="w-2.5 h-2.5" />
                    <span>Gallery</span>
                    <span className="text-[9px] opacity-80 font-mono">({sharedMediaCount})</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Shared Media Gallery Button */}
                <button
                  onClick={() => setActiveHeaderTab((curr) => (curr === 'gallery' ? 'chat' : 'gallery'))}
                  className={`relative w-8 h-8 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                    activeHeaderTab === 'gallery'
                      ? 'bg-[#ff4e18] text-white border-[#ff4e18] shadow-md shadow-[#ff4e18]/30'
                      : 'bg-white/5 hover:bg-[#ff4e18]/20 border-white/10 hover:border-[#ff4e18]/40 text-white/70 hover:text-[#ff4e18]'
                  }`}
                  title={`Shared Media Gallery (${sharedMediaCount} items)`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {sharedMediaCount > 0 && (
                    <span
                      className={`absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[8px] font-bold flex items-center justify-center ${
                        activeHeaderTab === 'gallery'
                          ? 'bg-white text-[#ff4e18]'
                          : 'bg-[#ff4e18] text-white shadow-sm'
                      }`}
                    >
                      {sharedMediaCount}
                    </span>
                  )}
                </button>

                {/* Video Call Toggle Button */}
                <button
                  onClick={handleStartVideoCall}
                  className={`w-8 h-8 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                    isVideoCallOpen
                      ? 'bg-[#ff4e18] text-white border-[#ff4e18] shadow-md shadow-[#ff4e18]/30 animate-pulse'
                      : 'bg-white/5 hover:bg-[#ff4e18]/20 border-white/10 hover:border-[#ff4e18]/40 text-white/70 hover:text-[#ff4e18]'
                  }`}
                  title={isVideoCallOpen ? 'Video call in progress (click to view)' : 'Start video call with Katie'}
                >
                  <Video className="w-3.5 h-3.5" />
                </button>

                {/* Search Messages in Chat Button */}
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-[#ff4e18]/20 border border-white/10 hover:border-[#ff4e18]/40 text-white/70 hover:text-[#ff4e18] flex items-center justify-center transition cursor-pointer active:scale-95"
                  title="Search in this chat"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>

                {/* Wallpaper Settings Button */}
                <button
                  onClick={() => setIsWallpaperModalOpen(true)}
                  className={`w-8 h-8 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                    isWallpaperModalOpen
                      ? 'bg-[#ff4e18] text-white border-[#ff4e18] shadow-md shadow-[#ff4e18]/30'
                      : 'bg-white/5 hover:bg-[#ff4e18]/20 border-white/10 hover:border-[#ff4e18]/40 text-white/70 hover:text-[#ff4e18]'
                  }`}
                  title="Change chat background (Abstract Gradients & Geometric Patterns)"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>

                {/* Pinned Messages Header Button */}
                <button
                  onClick={() => setIsPinnedCarouselOpen((prev) => !prev)}
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer active:scale-95 ${
                    isPinnedCarouselOpen
                      ? 'bg-[#ff4e18] text-white shadow-md shadow-[#ff4e18]/30'
                      : pinnedMessages.length > 0
                      ? 'bg-[#ff4e18]/20 border border-[#ff4e18]/50 text-[#ff4e18] hover:bg-[#ff4e18]/30'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
                  }`}
                  title={isPinnedCarouselOpen ? 'Close pinned messages' : 'View pinned messages'}
                >
                  <Pin className={`w-3.5 h-3.5 ${isPinnedCarouselOpen || pinnedMessages.length > 0 ? 'fill-current' : ''}`} />
                  {pinnedMessages.length > 0 && (
                    <span
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                        isPinnedCarouselOpen
                          ? 'bg-white text-[#ff4e18]'
                          : 'bg-[#ff4e18] text-white shadow-sm'
                      }`}
                    >
                      {pinnedMessages.length}
                    </span>
                  )}
                </button>

                {/* Quick Demo: simulate incoming voice note from Katie */}
                <button
                  onClick={handleTriggerIncomingVoiceNote}
                  className="px-2 py-1 rounded-full bg-white/5 hover:bg-[#ff4e18]/20 border border-white/10 hover:border-[#ff4e18]/40 text-[10px] text-white/70 hover:text-[#ff4e18] transition flex items-center gap-1 cursor-pointer"
                  title="Test: Receive voice note from Katie"
                >
                  <Mic className="w-2.5 h-2.5 text-[#ff4e18]" />
                  <span className="hidden sm:inline">Receive</span>
                </button>

                <button
                  onClick={onOpenProfile}
                  className={`w-9 h-9 rounded-full overflow-hidden border transition-all duration-300 cursor-pointer active:scale-95 ${
                    isTyping
                  ? 'border-[#ff4e18] ring-2 ring-[#ff4e18]/50 shadow-[0_0_14px_rgba(255,78,24,0.5)]'
                  : 'border-white/15 ring-2 ring-[#ff4e18]/20'
                  }`}
                  title="View contact info"
                >
                  <img
                    src={KATIE_PROFILE.avatar}
                    alt={KATIE_PROFILE.name}
                    className="w-full h-full object-cover"
                  />
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
          contactName={KATIE_PROFILE.name}
          onClose={() => setActiveHeaderTab('chat')}
          onJumpToMessage={handleJumpFromGallery}
        />
      ) : (
        <>
          {/* QUICK SEARCH KEYWORD CHIPS (when search is open) */}
      {isSearchOpen && (
        <div className="px-3 -mt-1 mb-2 shrink-0 z-20 flex items-center gap-1.5 overflow-x-auto no-scrollbar animate-in slide-in-from-top-1 fade-in">
          <span className="text-[10px] text-[#868b98] shrink-0 font-medium pl-1">Suggested:</span>
          {QUICK_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setSearchQuery(chip)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition cursor-pointer shrink-0 ${
                searchQuery.toLowerCase() === chip.toLowerCase()
                  ? 'bg-[#ff4e18] text-white'
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
                <div className="w-5 h-5 rounded-full bg-[#ff4e18]/20 flex items-center justify-center text-[#ff4e18]">
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
                      title="Previous pinned message"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleNextPin}
                      className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                      title="Next pinned message"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsPinnedCarouselOpen(false)}
                  className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer ml-1"
                  title="Dismiss pinned carousel"
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
                title="Click to jump to this message in chat"
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
                    <div className="w-9 h-9 rounded-lg bg-[#ff4e18]/15 border border-[#ff4e18]/30 flex items-center justify-center text-[#ff4e18] shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-[#252836] border border-white/5 flex items-center justify-center text-xs font-bold text-white/80 shrink-0">
                      {currentPinnedMsg.senderId === 'me' ? 'You' : 'KR'}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[#ff4e18]">
                        {currentPinnedMsg.senderId === 'me' ? 'You' : KATIE_PROFILE.name}
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
                    title="Unpin message"
                  >
                    <PinOff className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-[#ff4e18] font-medium group-hover:underline flex items-center gap-0.5">
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
                        ? 'w-4 h-1 rounded-full bg-[#ff4e18]'
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
              No messages match "{searchQuery}". Try searching for words like "Harry's", "hang out", or "Sunday".
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
                className="px-3.5 py-1.5 rounded-full bg-[#ff4e18]/20 border border-[#ff4e18]/40 text-[#ff4e18] text-xs font-semibold hover:bg-[#ff4e18]/30 transition cursor-pointer"
              >
                Try "Harry's"
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
                  style={{
                    opacity: Math.min(1, currentOffset / 28),
                    transform: `translateY(-50%) scale(${Math.min(1.18, 0.6 + currentOffset / 52)})`,
                  }}
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors pointer-events-none z-0 ${
                    isThresholdReached
                      ? 'bg-[#ff4e18] text-white shadow-lg shadow-[#ff4e18]/50 ring-2 ring-white/20'
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
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e18] absolute -bottom-0.5 left-1/2 -translate-x-1/2 shadow-[0_0_6px_#ff4e18]" />
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
                        className="px-2 py-1 rounded-full bg-[#ff4e18] hover:bg-[#ff5d2b] text-white flex items-center gap-1 text-[11px] font-semibold transition cursor-pointer shadow-md shadow-[#ff4e18]/40 active:scale-95"
                        title="Reply to message"
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
                            ? 'text-[#ff4e18] bg-[#ff4e18]/20 hover:bg-[#ff4e18]/30'
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
                        title="Copy text"
                      >
                        {copiedMsgId === msg.id ? (
                          <CheckCheck className="w-3.5 h-3.5 text-[#ff4e18]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Active Search Match Indicator Badge */}
              {isCurrentSearchMatch && (
                <div
                  className={`flex items-center gap-1 text-[9.5px] font-bold text-[#ff4e18] mb-1 px-1 animate-in fade-in slide-in-from-top-1 ${
                    isMine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span className="bg-[#ff4e18] text-white px-2 py-0.5 rounded-full shadow-md shadow-[#ff4e18]/40 flex items-center gap-1 tracking-tight font-sans">
                    <Search className="w-2.5 h-2.5" />
                    Match {activeMatchIndex + 1} of {matchingMessages.length}
                  </span>
                </div>
              )}

              <div className={`flex items-center gap-2 max-w-full group/row relative ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Quick Action Toolbar (Reply & Reaction) */}
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 shrink-0 select-none pb-2 transition-opacity duration-150 opacity-90 sm:opacity-0 sm:group-hover/row:opacity-100"
                >
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReplyMessage(msg);
                    }}
                    className="w-7 h-7 rounded-full bg-[#1b1c26]/95 hover:bg-[#ff4e18] text-white/80 hover:text-white border border-white/10 hover:border-[#ff4e18]/50 flex items-center justify-center transition cursor-pointer shadow-md active:scale-90"
                    title="Reply to message"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveReactionMsgId(msg.id);
                    }}
                    className="w-7 h-7 rounded-full bg-[#1b1c26]/95 hover:bg-white/20 text-white/80 hover:text-white border border-white/10 flex items-center justify-center transition cursor-pointer shadow-md active:scale-90"
                    title="Add reaction or options"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Message Bubble Container with Touch and Pointer Handlers */}
                <div
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
                    isPickerOpen ? 'scale-[1.02] ring-2 ring-[#ff4e18]/50' : 'active:scale-[0.99]'
                  } ${
                    isCurrentSearchMatch
                      ? 'ring-2 ring-[#ff4e18] shadow-[0_0_24px_rgba(255,78,24,0.6)] rounded-[24px]'
                      : isHighlighted
                      ? 'ring-2 ring-[#ff4e18] shadow-[0_0_22px_rgba(255,78,24,0.6)] rounded-[24px]'
                      : hasWordMatch
                      ? 'ring-1 ring-[#ff4e18]/40 rounded-[24px]'
                      : ''
                  }`}
                >
                  {/* Pinned Message Indicator Badge on the bubble */}
                  {msg.isPinned && (
                    <div
                      className={`flex items-center gap-1 text-[9.5px] font-semibold text-[#ff4e18] mb-1 px-1 ${
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
                    msg.voiceNote ? (
                      <div className="bg-[#1b1c26]/95 border border-[#ff4e18]/45 text-white rounded-[22px] rounded-br-[4px] p-3 max-w-[85%] shadow-lg shadow-black/50">
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-2 pl-2.5 pr-2 py-1 rounded-lg bg-black/25 border-l-2 border-white/80 text-xs cursor-pointer select-none transition hover:bg-black/35"
                            title="Jump to quoted message"
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
                          accentColor="#ff4e18"
                        />
                        <div className="flex items-center justify-end gap-1 text-[10px] text-white/70 mt-1 font-medium select-none">
                          <span>{msg.time}</span>
                          {msg.isRead ? (
                            <span title="Read" className="inline-flex items-center text-[#ff4e18] animate-in zoom-in-75 duration-200">
                              <CheckCheck className="w-3.5 h-3.5 inline-block" />
                            </span>
                          ) : (
                            <span title="Sent" className="inline-flex items-center text-white/50 animate-in fade-in duration-150">
                              <Check className="w-3.5 h-3.5 inline-block" />
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gradient-to-r from-[#ff521a] to-[#ff3b00] text-white rounded-[22px] rounded-br-[4px] px-4 py-2.5 max-w-[82%] shadow-lg shadow-[#ff4e18]/25 text-[14px] leading-relaxed">
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-2 pl-2.5 pr-2 py-1 rounded-lg bg-black/25 border-l-2 border-white/80 text-xs cursor-pointer select-none transition hover:bg-black/35"
                            title="Jump to quoted message"
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
                        <p>{highlightMatchedText(msg.text, searchQuery, isCurrentSearchMatch)}</p>
                        <div className="flex items-center justify-end gap-1 text-[10px] text-white/80 mt-1 font-medium select-none">
                          <span>{msg.time}</span>
                          {msg.isRead ? (
                            <span title="Read" className="inline-flex items-center text-white animate-in zoom-in-75 duration-200">
                              <CheckCheck className="w-3.5 h-3.5 inline-block" />
                            </span>
                          ) : (
                            <span title="Sent" className="inline-flex items-center text-white/65 animate-in fade-in duration-150">
                              <Check className="w-3.5 h-3.5 inline-block" />
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="bg-[#181921]/95 border border-white/[0.06] text-[#e5e7eb] rounded-[22px] rounded-tl-[4px] p-3.5 max-w-[88%] shadow-md shadow-black/40 text-[14px] leading-relaxed">
                      {msg.replyTo && (
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJumpToMessage(msg.replyTo!.id);
                          }}
                          className="mb-2 pl-2.5 pr-2 py-1 rounded-lg bg-white/5 border-l-2 border-[#ff4e18] text-xs cursor-pointer select-none transition hover:bg-white/10"
                          title="Jump to quoted message"
                        >
                          <div className="font-bold text-[10.5px] text-[#ff4e18] flex items-center gap-1">
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
                            accentColor="#ff4e18"
                          />
                        </div>
                      )}

                      {msg.text && <p>{highlightMatchedText(msg.text, searchQuery, isCurrentSearchMatch)}</p>}

                      <div className="text-[10px] text-[#717682] text-right mt-1.5 font-medium select-none">
                        {msg.time}
                      </div>
                    </div>
                  )}

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
                              ? 'bg-[#20151c]/95 border border-[#ff4e18]/70 text-white font-bold ring-1 ring-[#ff4e18]/40 shadow-[#ff4e18]/25'
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
            <div className="bg-[#181921]/95 border border-[#ff4e18]/25 rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-md shadow-black/50">
              <span className="text-xs text-[#ff4e18] font-semibold">Katie is typing</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e18] animate-bounce [animation-delay:-0.32s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e18] animate-bounce [animation-delay:-0.16s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e18] animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* FLOATING IN-CHAT SEARCH MATCH NAVIGATOR */}
      {isSearchOpen && searchQuery.trim() && matchingMessages.length > 0 && (
        <div className="mx-4 mb-2 z-20 flex items-center justify-between bg-[#151622]/95 backdrop-blur-xl border border-[#ff4e18]/40 rounded-2xl px-3.5 py-2 shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-bottom-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[#ff4e18]/20 flex items-center justify-center text-[#ff4e18] shrink-0">
              <Search className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white truncate">
                Word: <span className="text-[#ff4e18]">"{searchQuery}"</span>
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
              title="Previous match (Shift+Enter / ▲)"
            >
              <ChevronUp className="w-3.5 h-3.5 text-[#ff4e18]" />
              <span className="text-[11px] font-semibold">Prev</span>
            </button>
            <button
              onClick={handleNextMatch}
              className="px-2 py-1 rounded-lg bg-[#ff4e18]/20 hover:bg-[#ff4e18]/30 border border-[#ff4e18]/40 text-[#ff4e18] flex items-center gap-1 text-xs font-medium transition cursor-pointer active:scale-95"
              title="Next match (Enter / ▼)"
            >
              <span className="text-[11px] font-semibold">Next</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Reply Preview Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-[#161724]/95 border-t border-b border-[#ff4e18]/40 flex items-center justify-between text-xs z-20 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-150">
          <div
            onClick={() => handleJumpToMessage(replyingTo.id)}
            className="flex items-center gap-2.5 truncate cursor-pointer group flex-1 mr-2"
            title="Click to view message in chat"
          >
            <div className="w-6 h-6 rounded-full bg-[#ff4e18]/20 flex items-center justify-center text-[#ff4e18] shrink-0 border border-[#ff4e18]/30">
              <Reply className="w-3.5 h-3.5" />
            </div>
            <div className="truncate flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[#ff4e18] font-bold text-[11px] group-hover:underline">
                  Replying to {replyingTo.senderId === 'me' ? 'Yourself' : KATIE_PROFILE.name}
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
            title="Cancel reply"
          >
            <X className="w-3.5 h-3.5 text-white/60" />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {/* SCHEDULED MESSAGES QUEUE BANNER */}
      {scheduledMessages.length > 0 && (
        <div className="px-4 py-1.5 bg-[#181926]/95 backdrop-blur-md border-t border-[#ff4e18]/30 flex items-center justify-between text-xs z-20 animate-in fade-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 truncate">
            <Clock className="w-3.5 h-3.5 text-[#ff4e18] shrink-0 animate-pulse" />
            <span className="text-white/85 truncate text-[11px]">
              <strong className="text-[#ff4e18] font-semibold">
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
              className="text-[10px] text-[#ff4e18] hover:text-[#ff6e38] font-semibold hover:underline cursor-pointer"
            >
              Send Now
            </button>
            <button
              onClick={() => {
                setScheduledMessages([]);
                triggerPinnedToast('Scheduled messages cancelled');
              }}
              className="text-white/40 hover:text-white p-0.5 cursor-pointer text-xs"
              title="Cancel all scheduled"
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
          <div className="flex items-center gap-2 p-2 bg-[#141520]/95 backdrop-blur-xl border border-[#ff4e18]/30 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-150 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => handleAttachItem('photo')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[#ff4e18] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <Camera className="w-3.5 h-3.5 text-[#ff4e18]" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('location')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[#ff4e18] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Location</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('document')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[#ff4e18] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Document</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('voice')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[#ff4e18] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <Mic className="w-3.5 h-3.5 text-[#ff4e18]" />
              <span>Voice Memo</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAttachmentMenuOpen(false)}
              className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition ml-auto shrink-0"
              title="Close attachment menu"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* EMOJI QUICK BAR */}
        {isEmojiPickerOpen && (
          <div className="flex items-center gap-1.5 p-2 bg-[#141520]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-150 overflow-x-auto no-scrollbar">
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

        {/* ROW OF SMART REPLY PILL BUTTONS */}
        {shouldShowSmartReplies && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none">
            <div className="flex items-center gap-1 text-[11px] text-[#ff4e18] font-semibold shrink-0 pl-1 pr-1">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden sm:inline">Smart:</span>
            </div>

            {smartReplies.map((reply, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(reply)}
                className="rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-[#161723]/95 hover:bg-[#ff4e18] hover:text-white border border-white/10 hover:border-[#ff4e18] text-white/90 shadow-sm backdrop-blur-md transition-all duration-150 active:scale-95 shrink-0 whitespace-nowrap cursor-pointer group flex items-center gap-1.5"
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
        {isVoiceMemoActive ? (
          <VoiceMemoInput
            ref={voiceMemoRef}
            onSendVoiceMemo={handleSendVoiceNote}
            onScheduleVoiceMemo={(note) => {
              setRecordedVoiceNote(note);
              setIsScheduleModalOpen(true);
            }}
            onActiveChange={setIsVoiceMemoActive}
            disabled={isSearchOpen}
          />
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAttachmentMenuOpen((prev) => !prev);
                setIsEmojiPickerOpen(false);
              }}
              className={`w-11 h-11 rounded-full border flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0 ${
                isAttachmentMenuOpen
                  ? 'bg-[#ff4e18] text-white border-[#ff4e18] shadow-[#ff4e18]/30'
                  : 'bg-[#181920]/95 hover:bg-[#20222c] border-white/10 text-white/70 hover:text-white'
              }`}
              title="Attach photo, location, or document"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <div className="flex-1 bg-[#181920]/95 border border-white/10 focus-within:border-[#ff4e18]/60 rounded-full pl-4 pr-1.5 py-1.5 flex items-center transition shadow-md min-w-0">
              <input
                ref={mainInputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                placeholder={replyingTo ? `Replying to ${replyingTo.senderId === 'me' ? 'yourself' : KATIE_PROFILE.name}...` : 'Write a message...'}
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
                    ? 'text-[#ff4e18] bg-white/10'
                    : 'text-white/50 hover:text-[#ff4e18] hover:bg-white/10'
                }`}
                title="Pick emoji"
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  setIsScheduleModalOpen(true);
                }}
                className="w-11 h-11 rounded-full bg-[#ff4e18] hover:bg-[#ff5d2b] active:scale-90 text-white flex items-center justify-center shadow-lg shadow-[#ff4e18]/30 transition cursor-pointer relative group select-none shrink-0"
                title="Send message (hold to schedule)"
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
                onActiveChange={setIsVoiceMemoActive}
                disabled={isSearchOpen}
              />
            )}
          </div>
        )}
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
      />
    </div>
  );
};
