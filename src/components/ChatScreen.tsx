import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useWheelScroll } from '../lib/ui/useWheelScroll';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
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
  Lock,
  X,
  MoreHorizontal,
  Palette,
  Search,
  Clock,
  Video,
  Phone,
  Image as ImageIcon,
  Smile,
  Heart,
  Sparkles,
  MapPin,
  FileText,
  Camera,
  Download,
  Forward,
  Eye,
  BarChart2,
  Pencil,
  Trash2,
  Users,
  UserMinus,
  ShieldCheck,
  VolumeX,
  RefreshCw,
  Bell,
  ShieldAlert,
  Flag,
  Bot,
} from 'lucide-react';
import {
  CONVERSATION_HISTORIES,
  appendConversationHistory,
  CONTACT_PROFILES,
  KATIE_SHARED_MEDIA,
  MOCK_CHATS,
  loadCreatedGroups,
  registerCreatedGroups,
  saveCreatedGroups,
} from '../data/mockMessengerData';
import { ChatMessage, VoiceNoteData, DocumentAttachment, PollData, StickerData, LocationData } from '../types/messenger';
import type { BotCommand } from '../lib/bots/types';
import { BotSession } from '../lib/bots/session';
import type { MessageSink } from '../lib/bots/runtime';
import { HttpMessageSink } from '../lib/bots/httpSink';
import { BOT_REPORT_REASONS, recordBotReport, type BotReportReason } from '../lib/bots/reports';
import { DoodleBackground } from './DoodleBackground';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { VirtualizedList } from './VirtualizedList';
import { LazyMedia } from './LazyMedia';
import { VoiceMemoInput, VoiceMemoInputHandle } from './VoiceMemoInput';
import { WallpaperSettingsModal } from './WallpaperSettingsModal';
import { ScheduleMessageModal } from './ScheduleMessageModal';
import { VideoCallOverlay } from './VideoCallOverlay';
import { SharedMediaSection } from './SharedMediaSection';
import { FileSelectionModal } from './FileSelectionModal';
import { PollCreateModal } from './PollCreateModal';
import { MessageInlineKeyboard } from './MessageInlineKeyboard';
import { MiniAppIframe } from './MiniAppIframe';
import { CommandMenu } from './chat/CommandMenu';
import {
  isNotificationsEnabled,
  setNotificationsEnabledForChannel,
} from '../lib/social/channelSubscriptions';
import { renderMarkdown } from '../lib/markdown';
import { NovaIconButton, NovaMenu, NovaTooltip } from '../lib/ui';
import { PollBubble } from './chat/PollBubble';
import { LocationPickerModal } from './LocationPickerModal';
import { LocationBubble } from './chat/LocationBubble';
import { ACCENT_COLORS, applyAccentColor } from '../lib/ui/appearance';
import { NovaAvatar } from '../lib/ui/NovaAvatar';
import { useAccount } from '../hooks/useAccount';
import { StickerPickerDrawer } from './chat/StickerPickerDrawer';
import { StickerMedia } from './chat/StickerMedia';
import {
  MEDIA_PREFERENCES_EVENT,
  loadMediaPreferences,
  resolveStickerSize,
  type MediaPreferences,
} from '../lib/ui/mediaPreferences';
import { secureWipeMessage } from '../lib/security/secureWipe';
import { getDraft, setDraft, clearDraft } from '../lib/messaging/drafts';
import { dbInstance } from '../lib/storage/db';
import {
  WALLPAPER_OPTIONS,
  WALLPAPER_STORAGE_KEY,
  WALLPAPER_INTENSITY_KEY,
  WallpaperId,
} from '../data/wallpapers';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { usePremium } from '../hooks/usePremium';
import { P2PMediaCall, MediaCallMode, MediaCallStatus } from '../lib/p2p/mediaCall';
import { loadPrivacyPrefs } from '../lib/network/privacyMode';
import { GroupChatManager, type GroupPayload } from '../lib/p2p/groupManager';
import { RoomDataChannel, isRoomChannelSupported } from '../lib/p2p/roomChannel';
import type { FileTransferMessage } from '../lib/p2p/fileTransfer';
import { getOrCreateGroupInvite, regenerateGroupInviteToken, buildGroupInviteLink } from '../lib/social/groupInvites';
import {
  getGroupMembership,
  loadJoinRequests,
  setGroupMembership,
  setJoinRequestStatus,
  upsertJoinRequest,
  type GroupJoinRequest,
  type GroupMembership,
} from '../lib/social/groupJoinRequests';
import {
  ensureGroupRoles,
  getMemberRole,
  isGroupAdmin,
  loadGroupRoles,
  mergeGroupRoles,
  removeMemberRole,
  setMemberRole,
  type GroupRoles,
} from '../lib/social/groupRoles';
import { FileTransferManager } from '../lib/p2p/fileTransfer';
import { ReceiptManager, type ReceiptSignal } from '../lib/p2p/receipts';
import { enqueueJoinPayload, JOIN_REQUESTS_CHANGED_EVENT } from '../lib/social/joinRequestRelay';
import { getThreadMessages } from '../lib/messaging/threads';
import { editMessage } from '../lib/messaging/messageLifecycle';
import { markChatRead } from '../lib/messaging/unread';
import { playSound, vibrate } from '../lib/notifications/sounds';
import type { PeerKeyChange } from '../lib/security/peerKeyJournal';

const DEMO_PEER_BUNDLE_PREFIX = 'nova_demo_peer_bundle_';

function getDemoPeerFingerprint(chatId: string): string | null {
  try {
    const raw = localStorage.getItem(`${DEMO_PEER_BUNDLE_PREFIX}${chatId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fingerprint?: string };
    return parsed.fingerprint ?? null;
  } catch {
    return null;
  }
}

interface ChatScreenProps {
  chatId: string;
  onBack: () => void;
  onOpenProfile: () => void;
  /**
   * Id of the bot this chat is with, if any. Used to render the bot badge
   * and the slash-command menu (docs/bots-roadmap.md §B2).
   */
  botId?: string;
  /** Commands advertised by the bot in this chat, if any. */
  botCommands?: BotCommand[];
  /** Pending /start payload from a nova://bot/<id>?start=… deep link. */
  pendingBotStart?: { chatId: string; payload: string } | null;
  /** Called once the pending /start payload has been sent. */
  onBotStartSent?: () => void;
  /**
   * Bot callback dispatcher wired by App.tsx (bots Phase B2/B4). Returns
   * true when the update was dispatched to an installed bot runtime.
   */
  onBotCallback?: (botId: string, chatId: string, messageId: string, callbackData: string) => boolean;
  /**
   * Accessor to the app-wide BotSession, so the chat can deliver incoming
   * messages to the bot runtime (docs/bots-roadmap.md §B1/B4).
   */
  getBotSession?: () => BotSession;
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
const isVideoMediaUrl = (url: string) =>
  /^data:video\//i.test(url) || /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(url);

// Premium outgoing bubble themes (additive — default theme keeps the current design untouched)
const PREMIUM_THEMES: Record<string, { label: string; grad: string; shadow: string; border: string }> = {
  default: { label: 'Default', grad: 'from-[var(--nova-accent-color,#ff521a)] to-[var(--nova-accent-color,#ff3b00)]', shadow: 'shadow-[var(--nova-accent-color,#ff4e18)]/25', border: 'border-[var(--nova-accent-color,#ff4e18)]/45' },
  sapphire: { label: 'Sapphire', grad: 'from-[#1E3A8A] to-[#3B82F6]', shadow: 'shadow-[#3B82F6]/25', border: 'border-[#3B82F6]/60' },
  amethyst: { label: 'Amethyst', grad: 'from-[#4C1D95] to-[#8B5CF6]', shadow: 'shadow-[#8B5CF6]/25', border: 'border-[#8B5CF6]/60' },
  emerald: { label: 'Emerald', grad: 'from-[#064E3B] to-[#10B981]', shadow: 'shadow-[#10B981]/25', border: 'border-[#10B981]/60' },
};
const CHAT_THEME_KEY = 'nova_chat_theme';

/** Wire format for everything that travels over the chat's DataChannel. */
type RoomEnvelope =
  | { v: 1; kind: 'group'; payload: GroupPayload }
  | { v: 1; kind: 'file'; message: FileTransferMessage };

export const ChatScreen: React.FC<ChatScreenProps> = ({
  chatId,
  onBack,
  onOpenProfile,
  botId,
  botCommands,
  pendingBotStart,
  onBotStartSent,
  onBotCallback,
  getBotSession,
}) => {
  const { t } = useLanguage();
  const { encryptAndSendMessage, checkPeerKey, identity, isDemoPeer, p2pManager, setPeerFingerprint } = useSecurity();
  const { checkout, canUse } = usePremium();
  const { account } = useAccount();
  const chatItem = MOCK_CHATS.find((item) => item.id === chatId);
  const isGroupChat = chatItem?.type === 'group';
  const localFingerprint = identity?.fingerprint ?? 'nova_pk_local_group';

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
  const [botTyping, setBotTyping] = useState(false);

  // Wire the bot session's MessageSink into this chat so bot outgoing
  // messages are rendered in the transcript (docs/bots-roadmap.md §B4).
  // Local (L1) bots use a local sink that renders into the transcript.
  // L2/L3 bots (manifest.gatewayUrl set via NovaFather /setgateway) use an
  // HttpMessageSink that forwards send/edit/del/answerCallback to the bot's
  // gateway over HTTP.
  useEffect(() => {
    if (!getBotSession || !botId) return;
    const session = getBotSession();
    const bot = session.listBots().find((b) => b.manifest.id === botId);
    const gatewayUrl = bot?.manifest.gatewayUrl;
    const sink: MessageSink = gatewayUrl
      ? new HttpMessageSink({ gatewayUrl })
      : {
          send: async (msg) => {
            if (msg.chat.id !== chatId) return;
            setMessages((prev) => [
              ...prev,
              {
                id: msg.messageId,
                senderId: 'other',
                text: msg.text,
                time: new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                createdAt: msg.timestamp,
                isRead: true,
                botId,
                system: false,
              } as ChatMessage,
            ]);
            playSound('incoming');
            vibrate();
            // Bot has responded: stop the typing indicator after a brief
            // pause so the "typing" bubble is visible to the user.
            setTimeout(() => setBotTyping(false), 800);
          },
          sendTyping: async (_chatId, isTyping) => {
            setBotTyping(isTyping);
          },
          edit: async (edit) => {
            let applied = false;
            setMessages((prev) => {
              applied = prev.some((m) => m.id === edit.messageId && m.botId === botId);
              return prev.map((m) =>
                m.id === edit.messageId && m.botId === botId
                  ? { ...m, text: edit.text, editedAt: Date.now() }
                  : m
              );
            });
            return applied;
          },
          del: async (_chatId, messageId) => {
            let applied = false;
            setMessages((prev) => {
              applied = prev.some((m) => m.id === messageId && m.botId === botId);
              return prev.map((m) =>
                m.id === messageId && m.botId === botId
                  ? { ...m, deleted: true, deletedForEveryone: true }
                  : m
              );
            });
            return applied;
          },
          answerCallback: async () => {},
        };
    session.setMessageSink(sink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBotSession, chatId, botId]);
  const [fileTransfer, setFileTransfer] = useState<{
    id: string;
    fileName: string;
    bytes: number;
    total: number;
    direction: 'send' | 'receive';
  } | null>(null);
  const completedTransfersRef = useRef<Set<string>>(new Set());
  const expiredCleanupRef = useRef<WeakSet<ChatMessage>>(new WeakSet());
  const [isGroupMembersOpen, setIsGroupMembersOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<string[]>(
    chatItem?.type === 'group' ? chatItem.members ?? [] : [],
  );
  const [newMemberFingerprint, setNewMemberFingerprint] = useState('');
  const [groupInvite, setGroupInvite] = useState<{ token: string; link: string } | null>(null);
  const [groupRoles, setGroupRoles] = useState<GroupRoles>({});
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>(() =>
    chatItem?.type === 'group' ? loadJoinRequests(chatId) : [],
  );
  const [membershipStatus, setMembershipStatus] = useState<GroupMembership | null>(() =>
    chatItem?.type === 'group' ? getGroupMembership(chatId) : null,
  );
  const [pinnedToast, setPinnedToast] = useState<string | null>(null);
  const joinRequestSentRef = useRef<string | null>(null);
  const triggerPinnedToast = useCallback((text: string) => {
    setPinnedToast(text);
    setTimeout(() => setPinnedToast(null), 2200);
  }, []);
  const pendingJoinRequests = joinRequests.filter((request) => request.status === 'pending');
  const updateMembership = (status: GroupMembership) => {
    setGroupMembership(chatId, status);
    setMembershipStatus(status);
  };
  const currentUserIsGroupAdmin = isGroupAdmin(groupRoles, localFingerprint);
  const roomChannelRef = useRef<RoomDataChannel | null>(null);
  const groupManagerRef = useRef<GroupChatManager | null>(null);
  const fileManagerRef = useRef<FileTransferManager | null>(null);
  const fingerprintSetRef = useRef<Set<string>>(new Set());
  const [roomPeerCount, setRoomPeerCount] = useState(0);
  const messagesRef = useRef(messages);
  const [peerKeyChanges, setPeerKeyChanges] = useState<PeerKeyChange[]>([]);
  const [peerFingerprint, setLocalPeerFingerprint] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState<boolean | null>(() => {
    if (!identity || chatItem?.type !== 'direct') return null;
    return isDemoPeer(chatId);
  });
  const [loadedMessagesChatId, setLoadedMessagesChatId] = useState(chatId);

  /** Mini App currently opened from a `web_app` button (Phase B7). */
  const [openMiniApp, setOpenMiniApp] = useState<{ botId: string; webAppUrl: string } | null>(null);

  /** Open a bot's Mini App from an inline `web_app` button. */
  const handleOpenWebApp = useCallback((bId: string, webAppUrl: string) => {
    setOpenMiniApp({ botId: bId, webAppUrl });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const appendSystemMessage = (text: string) => {
    const message = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: 'other' as const,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      system: true,
    };
    setMessages((prev) => [...prev, message]);
    appendConversationHistory(chatId, [message]);
  };

  const sendEnvelope = useCallback((envelope: RoomEnvelope): boolean => {
    const channel = roomChannelRef.current;
    if (!channel?.isConnected()) return false;
    return channel.send(JSON.stringify(envelope)) > 0;
  }, []);

  const groupManager = useMemo(
    () =>
      new GroupChatManager({
        groupId: chatId,
        localFingerprint,
        members: chatItem?.type === 'group' ? chatItem.members ?? [] : [],
        sendToPeer: async (_peer, payload) => {
          if (sendEnvelope({ v: 1, kind: 'group', payload })) return;
          // Join traffic must survive a closed group: park it in the on-device
          // outbox so the session relay delivers it once a peer is around.
          if (enqueueJoinPayload(payload)) return;
          // No DataChannel peer yet: keep the local pipeline exercised.
          await groupManagerRef.current?.handleIncoming(localFingerprint, payload);
        },
        onMessage: (sender, text) => {
          // Skip the local echo: the UI appends our own messages immediately.
          if (sender === localFingerprint) return;
          playSound('incoming');
          vibrate();
          setMessages((prev) => [
            ...prev,
            {
              id: 'm-' + Date.now(),
              senderId: 'other',
              text,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isRead: true,
            },
          ]);
          // Deliver the incoming message to the bot runtime, if this is a bot chat.
          if (botId && getBotSession) {
            void getBotSession().deliverMessage(botId, {
              type: 'message',
              payload: {
                messageId: 'm-' + Date.now(),
                chat: { id: chatId, kind: 'direct' },
                text,
                isCommand: text.startsWith('/'),
                command: text.startsWith('/') ? text.slice(1).split(' ')[0] : undefined,
                mentionsBot: false,
                from: 'other',
                timestamp: Date.now(),
              },
            });
          }
        },
        onRoles: (_sender, roles) => {
          setGroupRoles((current) => mergeGroupRoles(chatId, current, roles));
        },
        onJoinRequest: (_sender, request) => {
          if (request.fingerprint === localFingerprint) return;
          setJoinRequests(upsertJoinRequest(chatId, request));
          const who = request.name || request.fingerprint;
          appendSystemMessage(t('chat.systemJoinRequested', { member: who }));
          triggerPinnedToast(t('chat.joinRequestReceived', { member: who }));
        },
        onJoinResponse: (_sender, response) => {
          if (response.fingerprint !== localFingerprint) return;
          if (response.approved) {
            updateMembership('member');
            setGroupRoles(setMemberRole(chatId, localFingerprint, 'member'));
            setJoinRequests(setJoinRequestStatus(chatId, localFingerprint, 'approved'));
            appendSystemMessage(t('chat.systemJoinApprovedMe'));
            triggerPinnedToast(t('chat.joinRequestApproved'));
            return;
          }
          updateMembership('rejected');
          setJoinRequests(setJoinRequestStatus(chatId, localFingerprint, 'rejected'));
          appendSystemMessage(t('chat.systemJoinRejectedMe'));
          triggerPinnedToast(t('chat.joinRequestDeclined'));
        },
        onError: (error) => {
          triggerPinnedToast(`${t('chat.groupMessageFailed')}: ${error.message}`);
        },
      }),
    [chatId, chatItem, localFingerprint, sendEnvelope, t],
  );
  groupManagerRef.current = groupManager;

  // The demo shell has no remote transport, so files travel through a local
  // loopback that still runs the real chunking, acknowledgement and SHA-256
  // verification pipeline. Progress and completion feed the chat UI.
  const fileTransferManager = useMemo(() => {
    const manager: FileTransferManager = new FileTransferManager({
      sendToPeer: async (peerFingerprint, message) => {
        if (!p2pManager) {
          // Нет P2P-менеджера: локальный loopback (тестовое окружение / офлайн).
          await manager.handleIncoming('nova_local_delivery', message);
          return;
        }
        try {
          // Реальная P2P-доставка чанков файла (шифруется как ratchet-сообщение).
          await p2pManager.sendMessage(peerFingerprint, JSON.stringify(message));
        } catch {
          // P2P недоступен: локальный loopback как fallback.
          await manager.handleIncoming('nova_local_delivery', message);
        }
      },
      onProgress: (progress) => {
        setFileTransfer({
          id: progress.transferId,
          fileName: progress.fileName,
          bytes: progress.bytesTransferred,
          total: progress.totalBytes,
          direction: manager.getOutgoing(progress.transferId) ? 'send' : 'receive',
        });
      },
      onComplete: (result) => {
        if (completedTransfersRef.current.has(result.transferId)) return;
        completedTransfersRef.current.add(result.transferId);
        setFileTransfer((current) =>
          current?.id === result.transferId ? null : current,
        );
        triggerPinnedToast(`${t('chat.fileVerified')} · ${result.fileName}`);
      },
      onError: (error, transferId) => {
        setFileTransfer((current) =>
          !transferId || current?.id === transferId ? null : current,
        );
        triggerPinnedToast(`${t('chat.fileTransferFailed')}: ${error.message}`);
      },
    });
    return manager;
  }, [sendEnvelope, p2pManager, t]);
  fileManagerRef.current = fileTransferManager;

  useEffect(() => {
    if (!isRoomChannelSupported()) return;

    const channel = new RoomDataChannel({
      room: `chat_${chatId}`,
      selfId: `${localFingerprint}:${crypto.randomUUID()}`,
      onMessage: (peerId, data) => {
        if (typeof data !== 'string') return;
        try {
          const envelope = JSON.parse(data) as RoomEnvelope;
          if (envelope?.v !== 1) return;
          if (envelope.kind === 'file') {
            void fileManagerRef.current?.handleIncoming(peerId, envelope.message);
          } else if (envelope.kind === 'group') {
            void groupManagerRef.current?.handleIncoming(peerId, envelope.payload);
          }
        } catch {
          /* malformed peer payload: ignore */
        }
      },
      onPeerCountChange: setRoomPeerCount,
    });

    roomChannelRef.current = channel;
    channel.start();

    return () => {
      channel.dispose();
      if (roomChannelRef.current === channel) roomChannelRef.current = null;
      setRoomPeerCount(0);
    };
  }, [chatId, localFingerprint]);
  useEffect(() => {
    const item = MOCK_CHATS.find((chat) => chat.id === chatId);
    setGroupMembers(item?.type === 'group' ? item.members ?? [] : []);
    setIsGroupMembersOpen(false);
    setGroupInvite(item?.type === 'group' ? getOrCreateGroupInvite(chatId) : null);
    setJoinRequests(item?.type === 'group' ? loadJoinRequests(chatId) : []);
    if (item?.type !== 'group') {
      setGroupRoles({});
      return;
    }
    const stored = loadGroupRoles(chatId);
    if (stored[localFingerprint]) {
      // Already a known member on this device: whatever the invite flow thought, the roster wins.
      setGroupMembership(chatId, 'member');
      setMembershipStatus('member');
      setGroupRoles(stored);
      return;
    }
    // A device that arrived through an invite link has no role until an admin approves it:
    // never seed it as admin, or every invitee could edit the roster.
    setMembershipStatus(getGroupMembership(chatId));
    setGroupRoles(getGroupMembership(chatId) ? stored : ensureGroupRoles(chatId, localFingerprint));
  }, [chatId, localFingerprint]);

  // Ask the admins for membership. With a peer in the room the request rides
  // the DataChannel; otherwise it waits in the relay outbox, so closing the
  // group right after accepting the invite does not lose the request.
  useEffect(() => {
    if (chatItem?.type !== 'group') return;
    if (membershipStatus !== 'pending') return;
    if (joinRequestSentRef.current === chatId) return;
    joinRequestSentRef.current = chatId;
    setJoinRequests(upsertJoinRequest(chatId, { fingerprint: localFingerprint }));
    void groupManager.requestToJoin();
    appendSystemMessage(t('chat.joinRequestWaiting'));
    triggerPinnedToast(t('chat.joinRequestSent'));
  }, [appendSystemMessage, chatId, chatItem, groupManager, localFingerprint, membershipStatus, roomPeerCount, t]);

  // Relay traffic applied while this chat was closed (or in another tab) can
  // land here too: keep the request book and membership in sync.
  useEffect(() => {
    if (chatItem?.type !== 'group') return;
    const onJoinTraffic = (event: Event) => {
      const detail = (event as CustomEvent<{ groupId?: string }>).detail;
      if (detail?.groupId && detail.groupId !== chatId) return;
      setJoinRequests(loadJoinRequests(chatId));
      const membership = getGroupMembership(chatId);
      if (!membership) return;
      setMembershipStatus(membership);
      if (membership === 'member') {
        setGroupRoles(setMemberRole(chatId, localFingerprint, 'member'));
      }
    };
    window.addEventListener(JOIN_REQUESTS_CHANGED_EVENT, onJoinTraffic);
    return () => window.removeEventListener(JOIN_REQUESTS_CHANGED_EVENT, onJoinTraffic);
  }, [chatId, chatItem, localFingerprint]);

  const handleAskToJoinAgain = () => {
    updateMembership('pending');
    setJoinRequests(upsertJoinRequest(chatId, { fingerprint: localFingerprint }));
    joinRequestSentRef.current = null;
  };

  const handleCopyGroupInvite = async () => {
    if (!groupInvite) return;
    try {
      await navigator.clipboard?.writeText(groupInvite.link);
      triggerPinnedToast(t('chat.inviteCopied'));
    } catch {
      triggerPinnedToast(t('chat.inviteCopyFailed'));
    }
  };

  const handleRegenerateGroupInvite = () => {
    if (!currentUserIsGroupAdmin) {
      triggerPinnedToast(t('chat.adminOnly'));
      return;
    }
    const token = regenerateGroupInviteToken(chatId);
    setGroupInvite({ token, link: buildGroupInviteLink(chatId, token) });
    triggerPinnedToast(t('chat.inviteRegenerated'));
  };

  const persistGroupMembers = (members: string[]) => {
    const item = MOCK_CHATS.find((chat) => chat.id === chatId);
    if (item?.type === 'group') item.members = members;

    const created = loadCreatedGroups();
    if (created.some((group) => group.id === chatId)) {
      saveCreatedGroups(
        created.map((group) => (group.id === chatId ? { ...group, members } : group)),
      );
    }
  };

  const handleAddGroupMember = async () => {
    if (!currentUserIsGroupAdmin) {
      triggerPinnedToast(t('chat.adminOnly'));
      return;
    }
    const member = newMemberFingerprint.trim();
    if (!member || groupMembers.includes(member)) return;
    await groupManager.addMember(member);
    const nextRoles = setMemberRole(chatId, member, 'member');
    setGroupRoles(nextRoles);
    void groupManager.broadcastRoles(nextRoles);
    appendSystemMessage(t('chat.systemMemberAdded', { member }));
    const members = groupManager.getMembers();
    setGroupMembers(members);
    persistGroupMembers(members);
    setNewMemberFingerprint('');
    triggerPinnedToast(t('chat.memberAdded'));
  };

  const handleApproveJoinRequest = async (member: string) => {
    if (!currentUserIsGroupAdmin) {
      triggerPinnedToast(t('chat.adminOnly'));
      return;
    }
    await groupManager.addMember(member);
    const nextRoles = setMemberRole(chatId, member, 'member');
    setGroupRoles(nextRoles);
    void groupManager.broadcastRoles(nextRoles);
    void groupManager.respondToJoin(member, true);
    setJoinRequests(setJoinRequestStatus(chatId, member, 'approved'));
    appendSystemMessage(t('chat.systemJoinApproved', { member }));
    const members = groupManager.getMembers();
    setGroupMembers(members);
    persistGroupMembers(members);
    triggerPinnedToast(t('chat.joinRequestApproved'));
  };

  const handleRejectJoinRequest = (member: string) => {
    if (!currentUserIsGroupAdmin) {
      triggerPinnedToast(t('chat.adminOnly'));
      return;
    }
    void groupManager.respondToJoin(member, false);
    setJoinRequests(setJoinRequestStatus(chatId, member, 'rejected'));
    appendSystemMessage(t('chat.systemJoinRejected', { member }));
  };

  const handleRemoveGroupMember = async (member: string) => {
    if (!currentUserIsGroupAdmin) {
      triggerPinnedToast(t('chat.adminOnly'));
      return;
    }
    await groupManager.removeMember(member);
    const members = groupManager.getMembers();
    setGroupMembers(members);
    persistGroupMembers(members);
    const nextRoles = removeMemberRole(chatId, member);
    setGroupRoles(nextRoles);
    void groupManager.broadcastRoles(nextRoles);
    appendSystemMessage(t('chat.systemMemberRemoved', { member }));
  };

  const handleToggleGroupRole = (member: string) => {
    if (!currentUserIsGroupAdmin || member === localFingerprint) return;
    const currentRole = getMemberRole(groupRoles, member);
    const nextRole = currentRole === 'admin' ? 'member' : 'admin';
    if (nextRole === 'member' && Object.values(groupRoles).filter((role) => role === 'admin').length <= 1) {
      triggerPinnedToast(t('chat.lastAdmin'));
      return;
    }
    const nextRoles = setMemberRole(chatId, member, nextRole);
    setGroupRoles(nextRoles);
    void groupManager.broadcastRoles(nextRoles);
    appendSystemMessage(
      t(nextRole === 'admin' ? 'chat.systemMemberPromoted' : 'chat.systemMemberDemoted', {
        member,
      }),
    );
    triggerPinnedToast(t(nextRole === 'admin' ? 'chat.memberPromoted' : 'chat.memberDemoted'));
  };

  const receiptManager = useMemo(
    () =>
      new ReceiptManager({
        localFingerprint: identity?.fingerprint ?? 'nova_pk_local',
        sendToPeer: async (peerFingerprint, signal) => {
          if (!p2pManager) return;
          try {
            // Реальная P2P-доставка квитанции (шифруется как ratchet-сообщение).
            await p2pManager.sendMessage(peerFingerprint, JSON.stringify(signal));
          } catch {
            /* квитанции fire-and-forget: ошибка доставки не критична */
          }
        },
        onSignal: (signal) => {
          if (signal.type === 'typing') {
            setIsTyping(true);
          } else if (signal.type === 'typing_stop') {
            setIsTyping(false);
          } else if (signal.type === 'read' && signal.messageId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === signal.messageId ? { ...m, isRead: true } : m)),
            );
          }
        },
      }),
    [identity, p2pManager],
  );
  const botManifest = botId
    ? getBotSession?.()
        .listBots()
        .find((entry) => entry.manifest.id === botId)?.manifest
    : null;
  const profile =
    CONTACT_PROFILES[chatId] ||
    (chatItem?.type === 'group'
      ? {
          name: chatItem.name,
          avatar: chatItem.avatar,
          status: 'Group',
          phone: '—',
          nickname: '',
          mediaCount: 0,
          filesCount: 0,
          linksCount: 0,
          voiceCount: 0,
          mediaItems: [],
        }
      : botManifest
        ? {
            name: botManifest.name,
            avatar: '',
            status: 'Bot',
            phone: '—',
            nickname: botManifest.username,
            mediaCount: 0,
            filesCount: 0,
            linksCount: 0,
            voiceCount: 0,
            mediaItems: [],
          }
        : CONTACT_PROFILES['katie']);
  const isProfileOnline = /^online$/i.test((profile.status ?? '').trim());

  useEffect(() => {
    registerCreatedGroups();
    setPeerKeyChanges([]);
    setLocalPeerFingerprint(null);
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
    setLoadedMessagesChatId(chatId);
  }, [chatId]);

  const keyChangedLabel = t('chat.e2eeKeyChanged');
  useEffect(() => {
    if (!identity || chatItem?.type !== 'direct') return;

    let active = true;
    void checkPeerKey(chatId)
      .then(({ peerFingerprint: fingerprint, history, isDemoPeer: isDemoResult }) => {
        if (!active) return;

        setIsDemo(isDemoResult);
        setLocalPeerFingerprint((current) => (current === fingerprint ? current : fingerprint));
        // Регистрируем отпечаток собеседника в глобальной карте, чтобы
        // checkPeerKey использовал реальный бандл вместо демо-ключа (F1.1).
        if (!isDemoResult && fingerprint && !fingerprintSetRef.current.has(chatId)) {
          setPeerFingerprint?.(chatId, fingerprint);
          fingerprintSetRef.current.add(chatId);
        }
        setPeerKeyChanges((current) =>
          current.length === history.length &&
          current.every((change, index) => change.id === history[index]?.id)
            ? current
            : history,
        );

        const securityMessages: ChatMessage[] = history.map((change) => {
          const signingKeyChanged =
            change.previousSigningKeyId !== change.currentSigningKeyId;
          const previousKey = signingKeyChanged
            ? change.previousSigningKeyId
            : change.previousIdentityKeyId;
          const currentKey = signingKeyChanged
            ? change.currentSigningKeyId
            : change.currentIdentityKeyId;

          return {
            id: change.id,
            senderId: 'other',
            text: `${keyChangedLabel}: ${previousKey.slice(-8)} → ${currentKey.slice(-8)}`,
            time: new Date(change.changedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            createdAt: change.changedAt,
            system: true,
          };
        });
        const existingIds = new Set(
          (CONVERSATION_HISTORIES[chatId] ?? []).map((message) => message.id),
        );
        const missingMessages = securityMessages.filter((message) => !existingIds.has(message.id));
        if (missingMessages.length === 0) return;

        appendConversationHistory(chatId, missingMessages);
        setMessages((current) => {
          const currentIds = new Set(current.map((message) => message.id));
          return [
            ...current,
            ...missingMessages.filter((message) => !currentIds.has(message.id)),
          ];
        });
      })
      .catch((error: unknown) => {
        if (active) {
          triggerPinnedToast(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      active = false;
    };
  }, [
    chatId,
    chatItem?.type,
    checkPeerKey,
    identity,
    keyChangedLabel,
    setPeerFingerprint,
    triggerPinnedToast,
  ]);

  // Входящие P2P-сообщения из App.tsx (реальная доставка, без фейковой симуляции).
  useEffect(() => {
    if (!identity || chatItem?.type !== 'direct') return;

    const onMessage = (event: CustomEvent<{ chatId: string; fromFingerprint: string; text: string }>) => {
      if (event.detail.chatId !== chatId) return;
      const { text } = event.detail;
      const messageId = 'p2p-' + Date.now();
      playSound('incoming');
      vibrate();
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          senderId: 'other',
          text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdAt: Date.now(),
          isRead: false,
        },
      ]);
      appendConversationHistory(chatId, [
        {
          id: messageId,
          senderId: 'other',
          text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdAt: Date.now(),
          isRead: false,
        },
      ]);
      // Доставить ботам, если это чат с ботом.
      if (botId && getBotSession) {
        void getBotSession().deliverMessage(botId, {
          type: 'message',
          payload: {
            messageId,
            chat: { id: chatId, kind: 'direct' },
            text,
            isCommand: text.startsWith('/'),
            command: text.startsWith('/') ? text.slice(1).split(' ')[0] : undefined,
            mentionsBot: false,
            from: 'other',
            timestamp: Date.now(),
          },
        });
      }
    };

    const onReceipt = (event: CustomEvent<{ signal: ReceiptSignal }>) => {
      void receiptManager.handleIncoming(event.detail.signal);
    };

    const onFile = (event: CustomEvent<{ peerFingerprint: string; message: FileTransferMessage }>) => {
      void fileManagerRef.current?.handleIncoming(event.detail.peerFingerprint, event.detail.message);
    };

    window.addEventListener('nova:p2p:message', onMessage as EventListener);
    window.addEventListener('nova:p2p:receipt', onReceipt as EventListener);
    window.addEventListener('nova:p2p:file', onFile as EventListener);

    return () => {
      window.removeEventListener('nova:p2p:message', onMessage as EventListener);
      window.removeEventListener('nova:p2p:receipt', onReceipt as EventListener);
      window.removeEventListener('nova:p2p:file', onFile as EventListener);
    };
  }, [chatId, chatItem?.type, identity, botId, getBotSession, receiptManager]);

  useEffect(() => {
    if (loadedMessagesChatId !== chatId) return;
    const unreadIds = messages
      .filter((message) => message.senderId === 'other' && !message.isRead)
      .map((message) => message.id);
    if (unreadIds.length === 0) return;

    markChatRead(chatId);
    const unreadIdSet = new Set(unreadIds);
    setMessages((current) =>
      current.map((message) =>
        unreadIdSet.has(message.id) ? { ...message, isRead: true } : message,
      ),
    );
  }, [chatId, loadedMessagesChatId, messages]);

  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      const now = Date.now();
      const expired = messagesRef.current.filter(
        (message) => message.expiresAt !== undefined && message.expiresAt <= now,
      );
      if (expired.length === 0) return;

      const expiredIds = new Set(expired.map((message) => message.id));
      expired.forEach((message) => {
        if (expiredCleanupRef.current.has(message)) return;
        expiredCleanupRef.current.add(message);
        secureWipeMessage(message);
        if (dbInstance.isReady()) {
          void dbInstance.deleteEncryptedMessage(message.id).catch((error: unknown) => {
            console.error('Failed to remove expired encrypted message:', error);
            if (active) {
              triggerPinnedToast(
                `Expired message storage cleanup failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          });
        }
      });
      CONVERSATION_HISTORIES[chatId] = (CONVERSATION_HISTORIES[chatId] ?? []).filter(
        (message) => !expiredIds.has(message.id),
      );
      setMessages((current) => current.filter((message) => !expiredIds.has(message.id)));
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [chatId, triggerPinnedToast]);

  const [inputText, setInputText] = useState(() => getDraft(chatId));

  useEffect(() => {
    setInputText(getDraft(chatId));
  }, [chatId]);

  // One-handed Edge Swipe-to-Back gesture states
  const [edgeSwipeOffset, setEdgeSwipeOffset] = useState(0);
  const [isEdgeSwiping, setIsEdgeSwiping] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isEligibleEdgeSwipeRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    // Edge zone: touches starting within 44px of the left screen edge
    if (touch.clientX <= 44) {
      isEligibleEdgeSwipeRef.current = true;
    } else {
      isEligibleEdgeSwipeRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isEligibleEdgeSwipeRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartXRef.current;
    const dy = Math.abs(touch.clientY - touchStartYRef.current);

    if (dy > dx && dx < 24) {
      isEligibleEdgeSwipeRef.current = false;
      setIsEdgeSwiping(false);
      setEdgeSwipeOffset(0);
      return;
    }

    if (dx > 0) {
      setIsEdgeSwiping(true);
      setEdgeSwipeOffset(Math.min(dx, 160));
    }
  };

  const handleTouchEnd = () => {
    if (isEligibleEdgeSwipeRef.current && edgeSwipeOffset > 75) {
      onBack();
    }
    isEligibleEdgeSwipeRef.current = false;
    setIsEdgeSwiping(false);
    setEdgeSwipeOffset(0);
  };
  const [formatState, _setFormatState] = useState<{ bold: boolean; italic: boolean; code: boolean; strike: boolean }>({
    bold: false,
    italic: false,
    code: false,
    strike: false,
  });
  const [isTyping, setIsTyping] = useState(false);
  const [typingActivity, setTypingActivity] = useState<'typing' | 'recording'>('typing');
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [pickerPosition, setPickerPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  // Online/offline state for offline indicator
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Position the reaction picker so it never overflows the viewport edges.
  // Measures the trigger element on first open and clamps to screen bounds.
  useLayoutEffect(() => {
    if (!activeReactionMsgId || !pickerTriggerRef.current) {
      setPickerPosition(null);
      return;
    }
    const rect = pickerTriggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const pickerWidth = 260;
    const viewportHeight = window.innerHeight;

    let left = rect.left + rect.width / 2 - pickerWidth / 2;
    left = Math.min(Math.max(left, 8), viewportWidth - pickerWidth - 8);

    const openUpwards = rect.bottom + 10 > viewportHeight - 8;
    setPickerPosition(openUpwards
      ? { bottom: viewportHeight - rect.top + 6, left }
      : { top: rect.bottom + 6, left });
  }, [activeReactionMsgId]);

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
    applyAccentColor(ACCENT_COLORS[chatTheme]);
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
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isReportBotOpen, setIsReportBotOpen] = useState(false);
  const [isBlockBotConfirm, setIsBlockBotConfirm] = useState(false);
  const [botBlocked, setBotBlocked] = useState(false);

  // Reflect the persisted block state so the menu offers Unblock and the
  // header can say the bot is blocked (Phase B8).
  useEffect(() => {
    if (!getBotSession || !botId) {
      setBotBlocked(false);
      return;
    }
    setBotBlocked(getBotSession().isBlocked(botId));
  }, [getBotSession, botId]);
  const [_toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState<boolean>(() =>
    isNotificationsEnabled(chatId),
  );

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2200);
  };

  const toggleChatNotifications = () => {
    const next = !chatNotificationsEnabled;
    setChatNotificationsEnabled(next);
    setNotificationsEnabledForChannel(chatId, next);
    void triggerPinnedToast(next ? t('chat.notificationsEnabled') : t('chat.notificationsDisabled'));
  };
  const moreMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [mediaLightbox, setMediaLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const mediaLightboxRef = useFocusTrap<HTMLDivElement>(Boolean(mediaLightbox), () =>
    setMediaLightbox(null),
  );
  const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
  const [isVideoCallMinimized, setIsVideoCallMinimized] = useState(false);
  const [callMode, setCallMode] = useState<MediaCallMode>('video');
  const [isCallMicOn, setIsCallMicOn] = useState(true);
  const [isCallCameraOn, setIsCallCameraOn] = useState(true);
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(null);
  const [callConnectionStatus, setCallConnectionStatus] = useState<
    'connecting' | 'connected' | 'failed' | undefined
  >(undefined);
  const mediaCallRef = useRef<P2PMediaCall | null>(null);

  // Pinned Messages Carousel State
  const [isPinnedCarouselOpen, setIsPinnedCarouselOpen] = useState(false);
  const [isProtectionOpen, setIsProtectionOpen] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesListWrapperRef = useRef<HTMLDivElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [currentPinIndex, setCurrentPinIndex] = useState(0);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [deletedUndo, setDeletedUndo] = useState<{ message: ChatMessage; index: number } | null>(null);
  const undoDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeHeaderTab, setActiveHeaderTab] = useState<'chat' | 'gallery'>('chat');
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [disappearAfter, setDisappearAfter] = useState(0);

  const [viewOnceMode, setViewOnceMode] = useState(false);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const groupMembersRef = useFocusTrap<HTMLDivElement>(isGroupMembersOpen, () =>
    setIsGroupMembersOpen(false),
  );
  const threadRef = useFocusTrap<HTMLDivElement>(Boolean(threadRootId), () =>
    setThreadRootId(null),
  );
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isStickerDrawerOpen, setIsStickerDrawerOpen] = useState(false);
  // Sticker view settings live on the device: keep them in sync with the picker
  // so bubbles and channel posts follow what the user chose.
  const [mediaPreferences, setMediaPreferences] = useState(loadMediaPreferences);
  const stickerPx = resolveStickerSize(mediaPreferences.stickerSize);
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

  // Message deletion animation: the id of the bubble currently collapsing.
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);

  // Scheduled Messages State
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessageItem[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const sendLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSendLongPressTriggeredRef = useRef(false);
  const [isSendOptionsOpen, setIsSendOptionsOpen] = useState(false);
  const sendOptionsAnchorRef = useRef<HTMLElement | null>(null);
  const [sendOptionsPosition, setSendOptionsPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const sendOptionsPanelRef = useRef<HTMLDivElement | null>(null);
  const openSendOptions = (anchor: HTMLElement | null) => {
    sendOptionsAnchorRef.current = anchor;
    setIsSendOptionsOpen(true);
  };
  const [sendSilently, setSendSilently] = useState(false);

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

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressFiredRef = useRef(false);
  const pointerStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const quickSearchChipsRef = useWheelScroll();
  const attachmentMenuRef = useWheelScroll();
  const emojiBarRef = useWheelScroll();
  const smartRepliesRef = useWheelScroll();



  const pinnedMessages = messages.filter((m) => m.isPinned);

  // Pixel height of the messages scroll viewport, used to size the virtualized
  // list window. Measured from the list wrapper so it follows resizes.
  const [messagesViewportHeight, setMessagesViewportHeight] = useState(600);
  useEffect(() => {
    const node = messagesListWrapperRef.current;
    if (!node) return;
    setMessagesViewportHeight(node.clientHeight || 600);
    const ro = new ResizeObserver(() => {
      setMessagesViewportHeight(node.clientHeight || 600);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const scrollToBottom = () => {
    if (!searchQuery.trim()) {
      const node = messagesScrollRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    }
  };

  // Auto-scroll fires only when the *list shape* changes (a message is added
  // or removed). Reaction/edit/read tweaks mutate messages in place, and they
  // must NOT yank the viewport to the bottom of the conversation.
  const messageListSignature = useMemo(
    () => messages.map((m) => m.id).join('|'),
    [messages],
  );
  const lastScrollSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastScrollSignatureRef.current === messageListSignature) return;
    lastScrollSignatureRef.current = messageListSignature;
    scrollToBottom();
  }, [messageListSignature, isTyping, recordedVoiceNote]);

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
            expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
          };

          setMessages((msgs) => [...msgs, newMsg]);
          triggerPinnedToast(
            `Scheduled message sent: "${item.text?.slice(0, 24) || 'Voice note'}"`
          );
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

  // Sticker size changes in the picker apply to the bubbles immediately, and
  // to any other open screen that listens for the same event.
  useEffect(() => {
    const onPreferences = (event: Event) => {
      const detail = (event as CustomEvent<MediaPreferences>).detail;
      if (detail) setMediaPreferences(detail);
    };
    window.addEventListener(MEDIA_PREFERENCES_EVENT, onPreferences);
    return () => window.removeEventListener(MEDIA_PREFERENCES_EVENT, onPreferences);
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

  useEffect(() => {
    if (!mediaLightbox) return;
    const handleMediaKeys = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setMediaLightbox((current) =>
          current
            ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length }
            : current,
        );
      } else if (event.key === 'ArrowRight') {
        setMediaLightbox((current) =>
          current
            ? { ...current, index: (current.index + 1) % current.urls.length }
            : current,
        );
      }
    };
    window.addEventListener('keydown', handleMediaKeys);
    return () => window.removeEventListener('keydown', handleMediaKeys);
  }, [mediaLightbox]);

  useLayoutEffect(() => {
    if (!isMoreMenuOpen) {
      setMoreMenuPosition(null);
      return;
    }
    const anchor = moreMenuAnchorRef.current;
    if (!anchor) return;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const panelWidth = moreMenuPanelRef.current?.offsetWidth ?? 256;
      const panelHeight = moreMenuPanelRef.current?.offsetHeight ?? 320;
      const left = Math.min(
        Math.max(rect.right - panelWidth, 8),
        Math.max(8, window.innerWidth - panelWidth - 8),
      );
      const top =
        rect.bottom + panelHeight + 8 > window.innerHeight
          ? Math.max(8, rect.top - panelHeight - 8)
          : rect.bottom + 8;
      setMoreMenuPosition({ top, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isMoreMenuOpen]);

  // The send-options sheet belongs next to the button that opened it, not to
  // the whole composer block, so anchor it to the trigger box.
  useLayoutEffect(() => {
    if (!isSendOptionsOpen) {
      setSendOptionsPosition(null);
      return;
    }
    const anchor = sendOptionsAnchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelWidth = sendOptionsPanelRef.current?.offsetWidth ?? 256;
    const panelHeight = sendOptionsPanelRef.current?.offsetHeight ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const left = Math.min(
      Math.max(rect.right - panelWidth, 8),
      Math.max(8, viewportWidth - panelWidth - 8),
    );
    const openDownwards = rect.top - panelHeight - 8 < 8;
    const next = openDownwards
      ? { top: rect.bottom + 8, left }
      : { bottom: viewportHeight - rect.top + 8, left };
    setSendOptionsPosition((current) =>
      current &&
      current.left === next.left &&
      current.top === next.top &&
      current.bottom === next.bottom
        ? current
        : next,
    );
  }, [isSendOptionsOpen, sendOptionsPosition?.left, sendOptionsPosition?.top, sendOptionsPosition?.bottom]);

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

  // Groups consecutive messages from the same sender into visual blocks and
  // inserts day separators ("Today", "Yesterday", DD.MM.YYYY). In search
  // mode grouping is disabled so every match keeps its full context.
  type ChatRenderItem =
    | { type: 'message'; msg: ChatMessage; groupStart: boolean }
    | { type: 'date'; label: string }
    | { type: 'unread'; label: string };

  // First message the contact sent that hasn't been read yet. Everything from
  // that point on (inclusive) is "new" for this session and gets an unread
  // divider so the user can see where they left off.
  const firstUnreadId = useMemo(() => {
    const unread = messages.find((m) => m.senderId === 'other' && !m.isRead);
    return unread ? unread.id : null;
  }, [messages]);

  const unreadCount = useMemo(
    () => messages.filter((m) => m.senderId === 'other' && !m.isRead).length,
    [messages],
  );

  const formatDateSeparator = (ts: number): string => {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const toDateKey = (date: Date) =>
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (toDateKey(d) === toDateKey(today)) return t('chat.dateToday');
    if (toDateKey(d) === toDateKey(yesterday)) return t('chat.dateYesterday');
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Displayed messages: in 'filtered' mode, only matches are shown. In 'context' mode, the full timeline is shown.
  const displayedMessages =
    isSearchOpen && searchQuery.trim() && searchFilterMode === 'filtered'
      ? matchingMessages
      : messages;

  const renderedMessages = useMemo<ChatRenderItem[]>(() => {
    const list = displayedMessages;
    const items: ChatRenderItem[] = [];
    let prevSender: string | null = null;
    let prevDateKey: string | null = null;
    let unreadDividerShown = !firstUnreadId;

    for (const msg of list) {
      const ts = msg.createdAt ?? Date.parse(msg.time);
      const dateKey = Number.isFinite(ts) ? `${new Date(ts).getFullYear()}-${new Date(ts).getMonth()}-${new Date(ts).getDate()}` : null;

      if (dateKey && dateKey !== prevDateKey) {
        items.push({ type: 'date', label: formatDateSeparator(ts) });
        prevDateKey = dateKey;
      }

      if (firstUnreadId && !unreadDividerShown && msg.id === firstUnreadId) {
        items.push({ type: 'unread', label: t('common.unread') });
        unreadDividerShown = true;
      }

      const groupStart = prevSender !== msg.senderId;
      items.push({ type: 'message', msg, groupStart });
      prevSender = msg.senderId;
    }

    return items;
  }, [displayedMessages, t, firstUnreadId]);

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
              : 'bg-[var(--nova-accent-color,#ff4e18)]/35 text-white font-semibold rounded px-1 py-0.5 border border-[var(--nova-accent-color,#ff4e18)]/40'
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

  // Media Call Handlers (WebRTC audio/video, simulated fallback when no peer)
  const stopActiveMediaCall = () => {
    mediaCallRef.current?.end();
    mediaCallRef.current = null;
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setCallConnectionStatus(undefined);
  };

  const handleStartCall = (mode: MediaCallMode) => {
    stopActiveMediaCall();
    setCallMode(mode);
    setIsVideoCallOpen(true);
    setIsVideoCallMinimized(false);
    setIsCallMicOn(true);
    setIsCallCameraOn(mode === 'video');
    setCallConnectionStatus(undefined);
    triggerPinnedToast(`Starting ${mode} call with ${profile.name}...`);

    const peerFingerprint = getDemoPeerFingerprint(chatId);
    const localFingerprint = identity?.fingerprint;
    const canUseRealMedia =
      Boolean(peerFingerprint && localFingerprint) &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia);

    if (!canUseRealMedia || !peerFingerprint || !localFingerprint) {
      return;
    }

    const privacyPrefs = loadPrivacyPrefs();
    const call = new P2PMediaCall({
      localFingerprint,
      peerFingerprint,
      mode,
      // Relay-only ICE hides the local IP from the peer; the user opts in via
      // Settings → Privacy (WebRTC IP privacy) and needs a TURN server.
      icePolicy: privacyPrefs.webrtcRelayOnly ? 'relay-only' : 'direct',
      iceServers: privacyPrefs.turnServers.length > 0 ? privacyPrefs.turnServers : undefined,
    });
    mediaCallRef.current = call;
    setCallConnectionStatus('connecting');

    call.onLocalStream((stream) => setLocalCallStream(stream));
    call.onRemoteStream((stream) => setRemoteCallStream(stream));
    call.onStatus((status: MediaCallStatus) => {
      if (status === 'connecting' || status === 'connected' || status === 'failed') {
        setCallConnectionStatus(status);
      }
      if (status === 'connected') {
        triggerPinnedToast(`${mode === 'voice' ? 'Voice' : 'Video'} call connected`);
      }
    });
    call.onError(() => setCallConnectionStatus('failed'));

    void call.start();
  };

  const handleStartVideoCall = () => handleStartCall('video');
  const handleStartVoiceCall = () => handleStartCall('voice');

  const handleEndVideoCall = (durationFormatted: string) => {
    const mode = callMode;
    stopActiveMediaCall();
    setIsVideoCallOpen(false);
    setIsVideoCallMinimized(false);
    triggerPinnedToast(`${mode === 'voice' ? 'Voice' : 'Video'} call ended • ${durationFormatted}`);

    // Add a record to chat history
    const callRecordMsg: ChatMessage = {
      id: 'call-' + Date.now(),
      senderId: 'me',
      text: `${mode === 'voice' ? '📞 Voice' : '📹 Video'} call with ${profile.name.split(' ')[0]} • Duration: ${durationFormatted}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: true,
    };
    setMessages((prev) => [...prev, callRecordMsg]);
  };

  useEffect(() => {
    return () => {
      mediaCallRef.current?.end();
      mediaCallRef.current = null;
    };
  }, [chatId]);

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

  // Send Button Long Press for Send Options
  const handleSendPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isSendLongPressTriggeredRef.current = false;
    sendLongPressTimerRef.current = setTimeout(() => {
      isSendLongPressTriggeredRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      setIsSendOptionsOpen(true);
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
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? t('chat.voiceMessage') : t('chat.photoAttachment')),
            senderName: replyingTo.senderId === 'me' ? t('common.you') : profile.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    setRecordedVoiceNote(null);
    setReplyingTo(null);

    appendConversationHistory(chatId, [newMessage]);
  };

  const handleCycleChatTheme = () => {
    const isPremiumTheme = chatTheme !== 'default';
    if (isPremiumTheme && !canUse('chat_themes')) {
      checkout();
      return;
    }
    const next =
      chatTheme === 'emerald'
        ? 'default'
        : Object.keys(PREMIUM_THEMES).includes(chatTheme)
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

  /**
   * Inline-button press: emits a callback_query update to the bot runtime
   * (docs/bots-roadmap.md §B2). The bot's answerCallbackQuery surfaces as a
   * toast. Bot dispatch goes through the session bot runtime (B1); without
   * one installed, the press is a no-op with a hint toast.
   */
  const handleBotCallback = (botId: string, messageId: string, callbackData: string) => {
    const dispatched = onBotCallback?.(botId, chatId, messageId, callbackData);
    if (!dispatched) {
      triggerPinnedToast(t('chat.callbackToast', { text: callbackData }));
    }
  };

  const handleCopyMessage = (msg: ChatMessage) => {
    if (msg.text) {
      void navigator.clipboard
        ?.writeText(msg.text)
        .then(() => triggerPinnedToast(t('common.copied')))
        .catch(() => triggerPinnedToast(t('common.copyFailed', 'Could not copy')));
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
    const preview = msg.text || (msg.voiceNote ? t('voiceMessage', { duration: msg.voiceNote.duration }) : t('chat.photoAttachment'));
    const sender = msg.senderId === 'me' ? 'myself' : profile.name;
    triggerPinnedToast(`Replying to ${sender}: "${preview.slice(0, 26)}${preview.length > 26 ? '...' : ''}"`);
    setHighlightedMsgId(msg.id);
    setTimeout(() => {
      mainInputRef.current?.focus();
      const node = messagesScrollRef.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    }, 60);
  };

  // Forward handlers
  const handleStartForward = (msgId: string) => {
    setActiveReactionMsgId(null);
    setIsForwardSelecting(true);
    setForwardSelectedIds(new Set([msgId]));
    triggerPinnedToast('Selecting messages to forward');
  };

  // Edit / delete handlers
  const handleStartEdit = (msg: ChatMessage) => {
    setActiveReactionMsgId(null);
    setEditingMsgId(msg.id);
    setEditingText(msg.text || '');
  };

  const handleCancelEdit = () => {
    setEditingMsgId(null);
    setEditingText('');
  };

  const handleSaveEdit = () => {
    if (!editingMsgId) return;
    const text = editingText.trim();
    if (!text) return;
    setMessages((prev) => editMessage(prev, editingMsgId, text, Date.now()));
    setEditingMsgId(null);
    setEditingText('');
  };

  const handlePinMessage = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, isPinned: !m.isPinned } : m))
    );
  };

  // Duration of the bubble-collapse animation (must match .msg-deleting in
  // index.css). The bubble stays in the DOM for this long, then is removed
  // from state so nothing — not even the "deleted" placeholder — remains.
  const DELETE_ANIMATION_MS = 300;
  const DELETE_UNDO_MS = 5000;

  const handleDeleteMessage = (msgId: string, forEveryone: boolean = true) => {
    if (editingMsgId === msgId) handleCancelEdit();

    // Keep a copy so the Undo toast can put the message back where it was.
    // The clone is taken before the secure wipe, which mutates the object.
    const index = messages.findIndex((m) => m.id === msgId);
    const removed = index >= 0 ? { ...messages[index] } : undefined;
    if (forEveryone && dbInstance.isReady()) {
      void dbInstance.deleteEncryptedMessage(msgId).catch((error: unknown) => {
        console.error('Failed to remove deleted encrypted message:', error);
        triggerPinnedToast(
          `Deleted message storage cleanup failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }

    // Start the collapse animation on the original bubble (it keeps its
    // content while it fades). The message is wiped and physically removed
    // from state once the animation finishes, so no "deleted" placeholder
    // is left behind afterwards.
    setDeletingMsgId(msgId);
    window.setTimeout(() => {
      // "Delete for everyone" scrubs the secure payload; the undo snapshot is
      // a separate object, so the restored row still carries its text.
      setMessages((prev) =>
        prev.filter((m) => {
          if (m.id !== msgId) return true;
          if (forEveryone) {
            secureWipeMessage(m as unknown as Parameters<typeof secureWipeMessage>[0]);
          }
          return false;
        }),
      );
      setDeletingMsgId((cur) => (cur === msgId ? null : cur));
      if (removed) {
        setDeletedUndo({ message: removed, index });
        if (undoDeleteTimer.current) clearTimeout(undoDeleteTimer.current);
        undoDeleteTimer.current = setTimeout(() => setDeletedUndo(null), DELETE_UNDO_MS);
      }
    }, DELETE_ANIMATION_MS);
  };

  const handleUndoDelete = () => {
    const pending = deletedUndo;
    if (undoDeleteTimer.current) {
      clearTimeout(undoDeleteTimer.current);
      undoDeleteTimer.current = null;
    }
    setDeletedUndo(null);
    if (!pending) return;
    setMessages((prev) => {
      const next = [...prev];
      next.splice(Math.min(pending.index, next.length), 0, pending.message);
      return next;
    });
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
  };  const handleForwardToChat = (targetChatId: string) => {
    const selectedMsgs = messages.filter((m) => forwardSelectedIds.has(m.id) && !m.deleted);

    if (selectedMsgs.length === 0) {
      setIsForwardModalOpen(false);
      setIsForwardSelecting(false);
      setForwardSelectedIds(new Set());
      triggerPinnedToast('No messages to forward');
      return;
    }

    const newMsgs: ChatMessage[] = selectedMsgs.map((m) => ({
      ...m,
      id: 'fwd-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      senderId: 'me' as const,
      forwardedFrom: m.senderId === 'me' ? t('common.you') : profile.name,
      text: m.deleted ? undefined : m.text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: undefined,
      editedAt: undefined,
    }));

    const targetName = MOCK_CHATS.find((c) => c.id === targetChatId)?.name || 'contact';

    // Persist into the target chat history so forwarded messages are there when opened.
    appendConversationHistory(targetChatId, newMsgs);

    // If forwarding back into the currently open chat, update local state too.
    if (targetChatId === chatId) {
      setMessages((prev) => [...prev, ...newMsgs]);
    }

    triggerPinnedToast(`Forwarded ${newMsgs.length} message${newMsgs.length > 1 ? 's' : ''} to ${targetName}`);

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
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? t('chat.voiceMessage') : t('chat.photoAttachment')),
            senderName: replyingTo.senderId === 'me' ? t('common.you') : profile.name,
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

    // Квитанция о прочтении приходит по реальному P2P-каналу (через receiptManager),
    // а не симулируется через setTimeout.
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
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? t('chat.voiceMessage') : t('chat.photoAttachment')),
            senderName: replyingTo.senderId === 'me' ? t('common.you') : profile.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);
    triggerPinnedToast(t('poll.pollCreated', 'Poll created!'));

    if (isGroupChat) {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
        );
      }, 600);
      appendConversationHistory(chatId, [newMsg]);
      return;
    }

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 600);

    // Голоса в опросе приходят по реальному P2P-каналу, а не симулируются.
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

  /**
   * "Insert, don't send" mode: drop the sticker into the composer so it can be
   * sent together with text. The picker closes and the keyboard comes back.
   */
  const handleInsertStickerText = (sticker: StickerData) => {
    const snippet = `${sticker.emoji} ${sticker.name}`;
    setInputText((prev) => (prev.trim() ? `${prev} ${snippet}` : snippet));
    setIsStickerDrawerOpen(false);
    setIsEmojiPickerOpen(false);
    mainInputRef.current?.focus();
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
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? t('chat.voiceMessage') : t('chat.photoAttachment')),
            senderName: replyingTo.senderId === 'me' ? t('common.you') : profile.name,
          }
        : undefined,
    };
    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);

    if (isGroupChat) {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
        );
      }, 600);
      appendConversationHistory(chatId, [newMsg]);
      return;
    }

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
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? t('chat.voiceMessage') : t('chat.photoAttachment')),
            senderName: replyingTo.senderId === 'me' ? t('common.you') : profile.name,
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
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? t('chat.voiceMessage') : t('chat.photoAttachment')),
            senderName: replyingTo.senderId === 'me' ? t('common.you') : profile.name,
          }
        : undefined,
    };
    setMessages((prev) => [...prev, newMsg]);
    setReplyingTo(null);
    triggerPinnedToast(location.isLive ? 'Live location shared' : 'Location sent');

    if (isGroupChat) {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
        );
      }, 600);
      appendConversationHistory(chatId, [newMsg]);
      return;
    }

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
      );
    }, 600);
  };

  const startLocalFileTransfer = (fileName: string, data: Uint8Array) => {
    void fileTransferManager.startTransfer(chatId, fileName, data).catch((error: unknown) => {
      triggerPinnedToast(
        `${t('chat.fileTransferFailed')}: ${error instanceof Error ? error.message : fileName}`,
      );
    });
  };

  const handleDownloadDocument = (docName: string) => {
    startLocalFileTransfer(
      docName,
      new TextEncoder().encode(`P2P File Transfer Payload for ${docName}`),
    );
  };

  const handleSendAttachmentFromModal = (payload: {
    text?: string;
    images?: string[];
    document?: DocumentAttachment;
  }) => {
    if (payload.document) {
      startLocalFileTransfer(
        payload.document.name,
        new TextEncoder().encode(`P2P File Transfer Payload for ${payload.document.name}`),
      );
    }
    const messageId = 'm-' + Date.now();
    const newMessage: ChatMessage = {
      id: messageId,
      senderId: 'me',
      text: payload.text,
      images: payload.images,
      document: payload.document,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.voiceNote ? t('chat.voiceMessage') : t('chat.photoAttachment')),
            senderName: replyingTo.senderId === 'me' ? t('common.you') : profile.name,
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

    if (isGroupChat) {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m))
        );
      }, 500);
      appendConversationHistory(chatId, [newMessage]);
      return;
    }

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

    // Ответы собеседника приходят по реальному P2P-каналу (nova:p2p:message),
    // а не симулируются через setTimeout.
  };

  const wrapSelection = (open: string, close: string) => {
    setInputText((prev) => {
      const el = mainInputRef.current;
      if (el && typeof el.selectionStart === 'number') {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const before = prev.slice(0, start);
        const selected = prev.slice(start, end);
        const after = prev.slice(end);
        return before + open + selected + close + after;
      }
      return prev ? `${open}${prev}${close}` : prev;
    });
    mainInputRef.current?.focus();
  };

  const handleSendMessage = (customText?: string, forcedReplyTo?: ChatMessage | null) => {
    const text = (customText ?? inputText).trim();

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
      createdAt: Date.now(),
      isRead: false,
      deliveryStatus: 'queued',
      expiresAt: disappearAfter ? Date.now() + disappearAfter * 1000 : viewOnceMode ? Date.now() + 5000 : undefined,
            viewOnce: viewOnceMode || undefined,
      replyTo: activeReply
        ? {
            id: activeReply.id,
            text: activeReply.text || (activeReply.voiceNote ? t('chat.voiceMessage') : t('chat.photoAttachment')),
            senderName: activeReply.senderId === 'me' ? t('common.you') : profile.name,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    playSound('outgoing');
    // Deliver the user's message to the bot runtime, if this is a bot chat.
    if (botId && text && getBotSession) {
      // Show "bot typing" while the bot processes the message.
      setBotTyping(true);
      void getBotSession().deliverMessage(botId, {
        type: 'message',
        payload: {
          messageId: newMessage.id,
          chat: { id: chatId, kind: 'direct' },
          text,
          isCommand: text.startsWith('/'),
          command: text.startsWith('/') ? text.slice(1).split(' ')[0] : undefined,
          mentionsBot: false,
          from: 'me',
          timestamp: Date.now(),
        },
      });
    }
    if (text) {
      const promise = isGroupChat
        ? groupManager.sendText(text)
        : encryptAndSendMessage(chatId, text, {
            messageId,
            expiresAt: newMessage.expiresAt,
          });
      void promise.then(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, deliveryStatus: 'sent' as const } : m
          )
        );
      }).catch((err) => {
        console.warn('Message send failed:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, deliveryStatus: 'error' as const } : m
          )
        );
      });
    }
    if (currentAttachment?.document) {
      startLocalFileTransfer(
        currentAttachment.document.name,
        new TextEncoder().encode(`P2P File Transfer Payload for ${currentAttachment.document.name}`),
      );
    }
    // Bot typing indicator: when chatting with a bot, show "typing" briefly
    // to simulate the bot composing a reply (receipts path reused per B2).
    if (botId) {
      setBotTyping(true);
      setTimeout(() => setBotTyping(false), 1800);
    }
    void receiptManager.sendReceipt(chatId, chatId, 'typing_stop');
    clearDraft(chatId);
    if (!customText) {
      setInputText('');
    }
    setReplyingTo(null);
    setStagedAttachment(null);

    if (sendSilently) {
      appendConversationHistory(chatId, [newMessage]);
      return;
    }
  };

  /** Send /start <payload> once when arriving from a nova://bot/<id>?start=… link. */
  useEffect(() => {
    if (!pendingBotStart || pendingBotStart.chatId !== chatId) return;
    if (!pendingBotStart.payload) {
      void onBotStartSent?.();
      return;
    }
    const cmd = `/start ${pendingBotStart.payload.trim()}`;
    handleSendMessage(cmd);
    setInputText('');
    void onBotStartSent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, pendingBotStart]);

  const handleRetrySend = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    const reply = msg.replyTo ? msg : null;
    handleSendMessage(msg.text ?? undefined, reply);
    // Remove the failed duplicate after the optimistic re-send is queued.
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  // Context-aware Smart Reply suggestions based on the last received message content.
  // They only make sense right after an incoming message: suggesting "For sure!"
  // under your own message replies to nothing.
  const lastReceivedMessage = useMemo(() => {
    // Roster and role changes render as system rows; they are not a message
    // to reply to, so the last real bubble decides.
    const lastMessage = [...messages].reverse().find((m) => !m.system);
    if (!lastMessage || lastMessage.senderId !== 'other') return undefined;
    return lastMessage;
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

  // Renders the delivery/status icon for an outgoing message bubble based on
  // deliveryStatus (queued → sent → delivered → read, or error with retry).
  const renderMessageStatus = (msg: ChatMessage) => {
    const status = msg.deliveryStatus ?? (msg.isRead ? 'read' : 'sent');
    const isError = status === 'error';
    const isSending = status === 'queued';
    const isDelivered = status === 'delivered';
    const isRead = status === 'read';
    return (
      <span
        className="flex items-center gap-1.5 text-[10px] font-mono select-none"
        title={
          isError
            ? t('common.failed')
            : isSending
            ? t('common.sending')
            : isRead || isDelivered
            ? t('common.read')
            : t('common.sent')
        }
      >
        {isError ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRetrySend(msg.id);
            }}
            className="flex items-center gap-1 text-[var(--nova-accent-color,#ff4e18)] hover:text-[var(--nova-accent-color,#ff5d2b)] transition cursor-pointer"
            title={t('common.retry')}
            aria-label={`${t('common.retry')}: ${msg.text ?? ''}`}
          >
            <RefreshCw className="w-3 h-3" />
            <span className="text-[9px]">{t('common.retry')}</span>
          </button>
        ) : isSending ? (
          <span className="inline-flex items-center text-[#8c919d] animate-in fade-in duration-150">
            <Clock className="w-3 h-3 animate-pulse" />
            <span className="text-[9px] pl-0.5">{t('common.sending')}</span>
          </span>
        ) : (
          <>
            {isRead || isDelivered ? (
              <span className={`inline-flex items-center animate-in zoom-in-75 duration-200 font-bold ${isRead ? 'text-sky-400/90' : 'text-white/60'}`}>
                <CheckCheck className="w-3.5 h-3.5 inline-block stroke-[2.5]" />
              </span>
            ) : (
              <span className="inline-flex items-center text-white/60 animate-in fade-in duration-150">
                <Check className="w-3.5 h-3.5 inline-block stroke-[2]" />
              </span>
            )}
          </>
        )}
      </span>
    );
  };

  const renderMessageMedia = (msg: ChatMessage) => {
    const urls = msg.images;
    if (!urls?.length) return null;
    return (
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        {urls.map((url, index) => {
          const isVideo = isVideoMediaUrl(url);
          return (
            <button
              key={`${msg.id}-${index}`}
              type="button"
              data-testid={`chat-media-${msg.id}-${index}`}
              aria-label={`Open media ${index + 1}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setMediaLightbox({ urls, index });
              }}
              className="relative h-36 overflow-hidden rounded-[16px] border border-white/10 bg-[#232530] p-0 text-left cursor-zoom-in"
            >
              {isVideo ? (
                <>
                  <video src={url} muted preload="metadata" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                    <Video className="h-7 w-7 drop-shadow" />
                  </span>
                </>
              ) : (
                <LazyMedia
                  src={url}
                  alt=""
                  className="h-full w-full object-cover transition duration-300 hover:scale-105"
                />
              )}
            </button>
          );
        })}
      </div>
    );
  };

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
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        transform: edgeSwipeOffset > 0 ? `translateX(${edgeSwipeOffset}px)` : undefined,
        transition: isEdgeSwiping ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
      className="nova-chat-surface flex flex-col h-full bg-[#0b0c10] text-white relative overflow-hidden"
    >
      {/* Edge Swipe Back Gesture Indicator for One-Handed Operation */}
      {edgeSwipeOffset > 10 && (
        <div
          style={{ opacity: Math.min(1, edgeSwipeOffset / 50) }}
          className="fixed left-3 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-2xl flex items-center justify-center pointer-events-none transition-opacity"
        >
          <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
        </div>
      )}
      {/* Dynamic Background Wallpaper with session persistence */}
      <DoodleBackground wallpaperId={wallpaperId} intensity={wallpaperIntensity} />

      {/* Toast Notification */}
      {pinnedToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-[var(--nova-accent-color,#ff4e18)]/50 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Clock className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
          <span>{pinnedToast}</span>
        </div>
      )}

      {/* Offline Indicator */}
      {!isOnline && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-white/10 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Clock className="w-3.5 h-3.5 text-[#717682]" />
          <span>You appear to be offline — messages will send when reconnected</span>
        </div>
      )}

      {/* Undo toast for a deleted message. Deletion is immediate, so an
          accidental tap is recoverable for five seconds without a dialog. */}
      {deletedUndo && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-white/10 bg-[#1e202a]/95 px-3.5 py-2 text-xs text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
        >
          <span>{t('chat.messageDeletedToast')}</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--nova-accent-color,#ff4e18)] hover:bg-white/[0.08] cursor-pointer"
          >
            {t('common.undo')}
          </button>
        </div>
      )}

      {/* Floating Header Pill */}
      <div className="p-2 shrink-0 relative z-20">
        <div className="@container bg-[#14151c]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-2.5 py-1.5 flex items-center justify-between shadow-xl shadow-black/60 min-h-[44px]">
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

              <div className="flex-1 bg-[#1a1b26] border border-[var(--nova-accent-color,#ff4e18)]/50 focus-within:border-[var(--nova-accent-color,#ff4e18)] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 shadow-inner min-w-0">
                <Search className="w-4 h-4 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
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
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 text-[var(--nova-accent-color,#ff4e18)] shrink-0 border border-[var(--nova-accent-color,#ff4e18)]/30 font-semibold whitespace-nowrap">
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
                    className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-[var(--nova-accent-color,#ff4e18)] transition cursor-pointer active:scale-95"
                    title={t('common.previous')}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNextMatch}
                    className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-[var(--nova-accent-color,#ff4e18)] transition cursor-pointer active:scale-95"
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
                      ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 border border-[var(--nova-accent-color,#ff4e18)]'
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
                  className="flex items-center gap-2.5 min-w-0 cursor-pointer focus:outline-none group"
                  aria-label={t('common.profile')}
                >
                  <span className="relative w-10 h-10 rounded-full overflow-hidden border border-white/10 ring-2 ring-[var(--nova-accent-color,#ff4e18)]/20 shrink-0">
                      <LazyMedia
                        src={profile.avatar}
                        alt={profile.name}
                        className="w-full h-full object-cover"
                      />
                    {isProfileOnline && !isTyping && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#12131b] shadow-sm shadow-emerald-500/50" />
                    )}
                  </span>
                  <span className="flex flex-col items-start min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="max-w-full font-bold text-[14.5px] text-white tracking-tight group-hover:text-[var(--nova-accent-color,#ff4e18)] transition truncate">
                        {profile.name}
                      </span>
                      {botId && (
                        <span
                          className="px-1.5 py-px rounded-full bg-[var(--nova-accent-color,#ff4e18)]/15 border border-[var(--nova-accent-color,#ff4e18)]/30 text-[9px] font-semibold text-[var(--nova-accent-color,#ff4e18)] shrink-0"
                          title={t('bot.badge', { defaultValue: 'Bot' })}
                        >
                          {t('bot.badge', { defaultValue: 'Bot' })}
                        </span>
                      )}
                      {isDemo === true && (
                        <span
                          className="px-1.5 py-px rounded-full bg-[#6b7280]/15 border border-[#6b7280]/30 text-[9px] font-semibold text-[#9ca3af] shrink-0 ml-1"
                          title={t('chat.e2eeDemo', { defaultValue: 'Demo' })}
                        >
                          {t('chat.e2eeDemo', { defaultValue: 'Demo' })}
                        </span>
                      )}
                    </div>
                    {(isTyping || botTyping) ? (
                      <div className="flex items-center gap-1 mt-0.5 px-1.5 py-px rounded-full bg-[var(--nova-accent-color,#ff4e18)]/15 border border-[var(--nova-accent-color,#ff4e18)]/30 animate-in fade-in zoom-in-95 duration-200 shadow-sm shadow-[var(--nova-accent-color,#ff4e18)]/20 select-none">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--nova-accent-color,#ff4e18)] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--nova-accent-color,#ff4e18)]"></span>
                        </span>
                        {typingActivity === 'recording' ? (
                          <>
                            <Mic className="w-2 h-2 text-[var(--nova-accent-color,#ff4e18)] animate-pulse" />
                            <span className="text-[10px] font-semibold text-[var(--nova-accent-color,#ff4e18)] tracking-tight">recording</span>
                            <div className="flex items-center gap-0.5 h-1.5">
                              <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-0.5" />
                              <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.2s] h-1" />
                              <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.4s] h-1" />
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-semibold text-[var(--nova-accent-color,#ff4e18)] tracking-tight">typing</span>
                            <div className="flex items-center gap-0.5 pt-px">
                              <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce [animation-delay:-0.32s]" />
                              <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce [animation-delay:-0.16s]" />
                              <span className="w-1 h-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce" />
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-0.5 select-none">
                        {isProfileOnline && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                        )}
                        <span className="max-w-[140px] truncate whitespace-nowrap text-[10px] text-[#868b98] font-normal leading-none">
                          {profile.status}
                        </span>
                      </div>
                    )}
                  </span>
                </button>

                {/* Header Menu Tabs: [ Chat | Gallery ] */}
                <div className="hidden @min-[440px]:flex items-center gap-0.5 p-0.5 bg-[#181922] rounded-lg border border-white/5 select-none shrink-0">
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
                {roomPeerCount > 0 && (
                  <span
                    data-testid="p2p-peer-count"
                    title={`P2P · ${roomPeerCount}`}
                    className="hidden @min-[400px]:inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30"
                  >
                    P2P · {roomPeerCount}
                  </span>
                )}

                {/* Group members live in the "..." menu; the pending-request
                    badge rides on that button instead of a second icon. */}

                {/* Bot Start button: sends /start to the bot (docs/bots-roadmap.md §B2) */}
                {botId && (
                  <button
                    type="button"
                    onClick={() => handleSendMessage('/start')}
                    className="w-7 h-7 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/10 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border border-[var(--nova-accent-color,#ff4e18)]/30 text-[var(--nova-accent-color,#ff4e18)] flex items-center justify-center transition cursor-pointer active:scale-95"
                    title={t('bot.start')}
                    aria-label={t('bot.start')}
                  >
                    <span className="text-[10px] font-bold">{t('bot.start')}</span>
                  </button>
                )}

                {/* Search Messages in Chat Button */}
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color,#ff4e18)] flex items-center justify-center transition cursor-pointer active:scale-95"
                  title={t('common.search')}
                  aria-label={t('common.search')}
                >
                  <Search className="w-3 h-3" />
                </button>

                {/* End-to-End Encryption / Protection of this chat */}
                <button
                  onClick={() => setIsProtectionOpen(true)}
                  data-testid="e2ee-badge"
                  className="hidden @min-[380px]:flex w-7 h-7 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 items-center justify-center transition cursor-pointer active:scale-95"
                  title={t('chat.e2eeBadgeTitle')}
                  aria-label={t('chat.e2eeCardTitle')}
                >
                  <ShieldCheck className="w-3 h-3" />
                </button>

                {/* Hide call buttons when no real peer (demo peer = no WebRTC connection possible) */}
                {!isDemoPeer(chatId) && (
                  <>
                    {/* Voice Call Toggle Button */}
                    <button
                      onClick={handleStartVoiceCall}
                      className={`w-7 h-7 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                        isVideoCallOpen && callMode === 'voice'
                          ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 animate-pulse'
                          : 'bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color,#ff4e18)]'
                      }`}
                      title={
                        isVideoCallOpen && callMode === 'voice'
                          ? 'Voice call in progress (click to view)'
                          : `Start voice call with ${profile.name}`
                      }
                    >
                      <Phone className="w-3 h-3" />
                    </button>

                    {/* Video Call Toggle Button */}
                    <button
                      onClick={handleStartVideoCall}
                      className={`w-7 h-7 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                        isVideoCallOpen && callMode === 'video'
                          ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 animate-pulse'
                          : 'bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color,#ff4e18)]'
                      }`}
                      title={
                        isVideoCallOpen && callMode === 'video'
                          ? 'Video call in progress (click to view)'
                          : `Start video call with ${profile.name}`
                      }
                    >
                      <Video className="w-3 h-3" />
                    </button>
                  </>
                )}

                {/* Pinned Messages Header Button (only when pinned exist) */}
                {pinnedMessages.length > 0 && (
                  <button
                    onClick={() => setIsPinnedCarouselOpen((prev) => !prev)}
                    className={`relative w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer active:scale-95 ${
                      isPinnedCarouselOpen
                        ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30'
                        : 'bg-[var(--nova-accent-color,#ff4e18)]/20 border border-[var(--nova-accent-color,#ff4e18)]/50 text-[var(--nova-accent-color,#ff4e18)] hover:bg-[var(--nova-accent-color,#ff4e18)]/30'
                    }`}
                    title={isPinnedCarouselOpen ? 'Close pinned messages' : 'View pinned messages'}
                    aria-label={isPinnedCarouselOpen ? 'Close pinned messages' : 'View pinned messages'}
                  >
                    <Pin className={`w-3 h-3 ${isPinnedCarouselOpen ? 'fill-current' : ''}`} />
                    <span
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                        isPinnedCarouselOpen
                          ? 'bg-white text-[var(--nova-accent-color,#ff4e18)]'
                          : 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-sm'
                      }`}
                    >
                      {pinnedMessages.length}
                    </span>
                  </button>
                )}

                {/* More menu */}
                <div className="relative">
                  <button
                    ref={moreMenuAnchorRef}
                    onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={isMoreMenuOpen}
                    aria-label={t('chat.chatActions')}
                    title={t('chat.chatActions')}
                    data-pending-requests={pendingJoinRequests.length || undefined}
                    className={`w-7 h-7 rounded-full border transition cursor-pointer active:scale-95 flex items-center justify-center ${
                      isMoreMenuOpen
                        ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30'
                        : 'bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color,#ff4e18)]'
                    }`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    {isGroupChat && currentUserIsGroupAdmin && pendingJoinRequests.length > 0 && (
                      <span
                        data-testid="join-request-badge"
                        className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] text-white text-[8px] font-bold flex items-center justify-center"
                      >
                        {pendingJoinRequests.length}
                      </span>
                    )}
                  </button>

                </div>
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
                  ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white'
                  : 'bg-[#181922] text-[#8e93a0] hover:text-white border border-white/5'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* DISMISSIBLE PINNED MESSAGES CAROUSEL */}
      {isProtectionOpen && (
        <div
          data-testid="protection-card"
          className="fixed inset-0 z-40 flex items-end justify-center sm:items-center px-0 sm:px-4 pb-0 sm:pb-0"
          role="dialog"
          aria-label={t('chat.e2eeCardTitle')}
          onClick={() => setIsProtectionOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-[#151622]/95 backdrop-blur-xl border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl shadow-black/70 animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-300">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-white tracking-tight">
                  {t('chat.e2eeCardTitle')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsProtectionOpen(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                title={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* End-to-end encryption status */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-300 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">
                  {t('chat.e2eeEncrypted')}
                </p>
                <p className="text-[11px] text-[#8c919d] mt-0.5">
                  {t('chat.e2eeEncryptedDesc', { name: profile.name })}
                </p>
              </div>
            </div>

            {/* Contact verification */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--nova-accent-color,#ff4e18)]/15 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="flex items-center gap-2"
                  data-testid="safety-number-row"
                  data-demo-peer={isDemoPeer(chatId) ? 'true' : 'false'}
                >
                  <p className="text-xs font-semibold text-white">
                    {t('chat.e2eeVerification')}
                  </p>
                  {isDemoPeer(chatId) && (
                    <span
                      data-testid="demo-peer-badge"
                      title={t('chat.demoPeerTitle')}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/20"
                    >
                      {t('chat.demoPeer')}
                    </span>
                  )}
                  <span
                    data-testid="protection-verified"
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-[var(--nova-warning-text)] border border-amber-500/30"
                  >
                    {t('chat.e2eeUnverified')}
                  </span>
                </div>
                <p className="text-[11px] text-[#8c919d] mt-0.5">
                  {t('chat.e2eeVerifyDesc')}
                </p>
                <p className="text-[10px] font-mono text-[#8c919d] mt-1 break-all">
                  {peerFingerprint ?? '—'}
                </p>
              </div>
            </div>

            {peerKeyChanges.length > 0 && (
              <div
                data-testid="peer-key-change-history"
                className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 mb-2"
              >
                <p className="text-xs font-semibold text-[var(--nova-warning-text)] mb-2">
                  {keyChangedLabel}
                </p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {[...peerKeyChanges].reverse().map((change) => (
                    <div
                      key={change.id}
                      data-testid="peer-key-change-entry"
                      className="text-[10px] text-[var(--nova-text-secondary)]"
                    >
                      <p>{new Date(change.changedAt).toLocaleString()}</p>
                      <p className="font-mono break-all">
                        {change.previousFingerprint} → {change.currentFingerprint}
                      </p>
                      {change.previousSigningKeyId !== change.currentSigningKeyId && (
                        <p className="font-mono break-all text-[var(--nova-text-muted)]">
                          {change.previousSigningKeyId} → {change.currentSigningKeyId}
                        </p>
                      )}
                      {change.previousIdentityKeyId !== change.currentIdentityKeyId && (
                        <p className="font-mono break-all text-[var(--nova-text-muted)]">
                          {change.previousIdentityKeyId} → {change.currentIdentityKeyId}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disappearing messages / key status */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white">
                    {t('chat.e2eeDisappearing')}
                  </p>
                  <span
                    data-testid="protection-disappearing"
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/70"
                  >
                    {disappearAfter > 0
                      ? t('chat.sendOptions.seconds', { count: disappearAfter })
                      : t('chat.e2eeDisappearingOff')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPinnedCarouselOpen && (
        <div className="px-3 -mt-1 mb-2 shrink-0 relative z-30 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="bg-[#151622]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 shadow-2xl shadow-black/70">
            {/* Header row of carousel */}
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5 px-1">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)]">
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
                      <LazyMedia
                        src={currentPinnedMsg.images[0]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : currentPinnedMsg.voiceNote ? (
                    <div className="w-9 h-9 rounded-lg bg-[var(--nova-accent-color,#ff4e18)]/15 border border-[var(--nova-accent-color,#ff4e18)]/30 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-[#252836] border border-white/5 flex items-center justify-center text-xs font-bold text-white/80 shrink-0">
                      {currentPinnedMsg.senderId === 'me' ? t('common.you') : profile.name}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[var(--nova-accent-color,#ff4e18)]">
                        {currentPinnedMsg.senderId === 'me' ? t('common.you') : profile.name}
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
                        ? t('voiceMessage', { duration: currentPinnedMsg.voiceNote.duration })
                        : currentPinnedMsg.text || t('chat.photoAttachment')}
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
                  <span className="text-[10px] text-[var(--nova-accent-color,#ff4e18)] font-medium group-hover:underline flex items-center gap-0.5">
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
                        ? 'w-4 h-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)]'
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
      <div className="sticky top-0 z-20 flex justify-center my-1 shrink-0 bg-[#0b0c10]/70 backdrop-blur-sm py-1">
        <span className="text-[11px] font-medium text-[#737887] bg-[#14151c]/80 backdrop-blur-md px-3.5 py-1 rounded-full border border-white/5 shadow-inner">
          Today, 24 June
        </span>
      </div>

      {/* Banners above the (virtualized) message list */}
      <div className="shrink-0 space-y-2 px-4 pt-2 relative z-10">
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
                className="px-3.5 py-1.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 border border-[var(--nova-accent-color,#ff4e18)]/40 text-[var(--nova-accent-color,#ff4e18)] text-xs font-semibold hover:bg-[var(--nova-accent-color,#ff4e18)]/30 transition cursor-pointer"
              >
                Try &quot;Harry&apos;s&quot;
              </button>
            </div>
          </div>
        )}

        {messages.some((m) => m.isPinned) && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-[var(--nova-accent-color,#ff4e18)]/10 border border-[var(--nova-accent-color,#ff4e18)]/30 text-xs text-white/90 flex items-center gap-2">
            <Pin className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
            <span className="truncate flex-1">
              {messages.find((m) => m.isPinned)?.text || t('chat.messageDeleted', 'Pinned message')}
            </span>
            <button
              type="button"
              onClick={() => {
                const pinned = messages.find((m) => m.isPinned);
                if (pinned) {
                  const el = document.getElementById(`msg-${pinned.id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
            >
              {t('chat.messageActions.pin')}
            </button>
          </div>
        )}

        {isGroupChat && membershipStatus === 'pending' && (
          <div
            data-testid="join-request-status"
            className="mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-2"
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{t('chat.joinRequestWaiting')}</span>
          </div>
        )}
        {isGroupChat && membershipStatus === 'rejected' && (
          <div
            data-testid="join-request-status"
            className="mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-[11px] text-red-200 flex items-center gap-2"
          >
            <span className="flex-1">{t('chat.joinRequestDeclined')}</span>
            <button
              type="button"
              onClick={handleAskToJoinAgain}
              aria-label={t('chat.joinRequestRetry')}
              className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-semibold transition cursor-pointer shrink-0"
            >
              {t('chat.joinRequestRetry')}
            </button>
          </div>
        )}
      </div>

      {/* Messages Scroll Area (virtualized) */}
      <div ref={messagesListWrapperRef} className="flex-1 flex flex-col min-h-0 relative z-10">
        <VirtualizedList
          items={renderedMessages}
          itemHeight={72}
          height={messagesViewportHeight}
          containerRef={messagesScrollRef}
          onScroll={(event) => {
            const node = event.currentTarget;
            const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
            setShowScrollToBottom(distanceFromBottom > 120);
          }}
          onClick={() => setActiveReactionMsgId(null)}
          className="flex-1 px-4 py-2 space-y-3 no-scrollbar"
          getItemKey={(it) =>
            it.type === 'date'
              ? `date-${it.label}`
              : it.type === 'unread'
                ? 'unread'
                : `msg-${it.msg.id}`
          }
          renderItem={(item, _idx) => {
          if (item.type === 'date') {
            return (
              <div
                key={`date-${item.label}`}
                className="flex justify-center my-3"
              >
                <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold text-[#8c919d]">
                  {item.label}
                </span>
              </div>
            );
          }

          if (item.type === 'unread') {
            return (
              <div
                key="unread-divider"
                data-testid="unread-divider"
                className="flex items-center gap-3 my-2"
              >
                <div className="flex-1 h-px bg-[var(--nova-accent-color,#ff4e18)]/50" />
                <span className="text-[10px] font-semibold text-[var(--nova-accent-color,#ff4e18)] tracking-wide uppercase">
                  {item.label}
                </span>
                <div className="flex-1 h-px bg-[var(--nova-accent-color,#ff4e18)]/50" />
              </div>
            );
          }

          const msg = item.msg;
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
          const isDeleting = deletingMsgId === msg.id;

          if (msg.system) {
            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                data-testid="system-message"
                className={`flex justify-center my-1 ${isDeleting ? 'msg-deleting' : ''}`}
              >
                <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10.5px] text-white/50 text-center max-w-[85%]">
                  {msg.text}
                </span>
              </div>
            );
          }

          if (msg.deleted) {
            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`flex flex-col relative transition-all duration-300 ${
                  isMine ? 'items-end' : 'items-start'
                } ${isDeleting ? 'msg-deleting' : ''}`}
              >
                <div className="px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 text-white/45 italic text-[13px] max-w-[80%]">
                  {t('chat.messageDeleted', 'This message was deleted')}
                  <span className="ml-2 text-[10px] not-italic text-white/30">{msg.time}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`flex flex-col relative transition-all duration-300 ${item.groupStart ? 'mt-2' : 'mt-0'} ${
                isMine ? 'items-end' : 'items-start'
              } ${isDeleting ? 'msg-deleting' : ''}`}
            >
              {/* Sender avatar at the start of a message group, so the other
                  person's picture is visible in the conversation itself. */}
              {item.groupStart && (
                <div className={`mb-1 flex items-center ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <NovaAvatar
                    name={isMine ? account.displayName : profile.name}
                    src={isMine ? account.avatar : profile.avatar}
                    size="sm"
                  />
                </div>
              )}

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
                      ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-lg shadow-[var(--nova-accent-color,#ff4e18)]/50 ring-2 ring-white/20'
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
                    className={`fixed z-40 flex max-w-[calc(100vw-1rem)] flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain rounded-full border border-white/20 bg-[#151621]/98 px-2 py-1.5 no-scrollbar shadow-[0_12px_36px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-in zoom-in-90 fade-in duration-150`}
                    style={pickerPosition ? { ...pickerPosition, touchAction: 'pan-x' } : { touchAction: 'pan-x' }}
                  >
                    {EMOJI_OPTIONS.map((emoji) => {
                      const isSelected = msg.reactions?.some((r) => r.emoji === emoji && r.fromMe);
                      return (
                        <button
                          key={emoji}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSelectReaction(msg.id, emoji)}
                          className={`shrink-0 text-xl p-1 rounded-full hover:scale-135 active:scale-95 transition-transform cursor-pointer relative group ${
                            isSelected ? 'bg-white/20 scale-120' : 'hover:bg-white/10'
                          }`}
                          title={`React with ${emoji}`}
                        >
                          <span className="select-none">{emoji}</span>
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] absolute -bottom-0.5 left-1/2 -translate-x-1/2 shadow-[0_0_6px_var(--nova-accent-color,#ff4e18)]" />
                          )}
                        </button>
                      );
                    })}

                    <div className="mx-0.5 h-4 w-[1px] shrink-0 bg-white/20" />

                    {/* Quick Action Buttons: Reply, Pin, Copy */}
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplyMessage(msg);
                        }}
                        className="px-2 py-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)] hover:bg-[var(--nova-accent-color,#ff5d2b)] text-white flex items-center gap-1 text-[11px] font-semibold transition cursor-pointer shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/40 active:scale-95"
                        title={t('common.reply')}
                      >
                        <Reply className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Reply</span>
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
                            ? 'text-[var(--nova-accent-color,#ff4e18)] bg-[var(--nova-accent-color,#ff4e18)]/20 hover:bg-[var(--nova-accent-color,#ff4e18)]/30'
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
                          <CheckCheck className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
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
                  className={`flex items-center gap-1 text-[9.5px] font-bold text-[var(--nova-accent-color,#ff4e18)] mb-1 px-1 animate-in fade-in slide-in-from-top-1 ${
                    isMine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span className="bg-[var(--nova-accent-color,#ff4e18)] text-white px-2 py-0.5 rounded-full shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/40 flex items-center gap-1 tracking-tight font-sans">
                    <Search className="w-2.5 h-2.5" />
                    Match {activeMatchIndex + 1} of {matchingMessages.length}
                  </span>
                </div>
              )}

              {msg.expiresAt && (
                <div className={`text-[9px] text-amber-400/80 mb-0.5 px-1 ${isMine ? 'text-right' : 'text-left'}`}>
                  ⏱ disappears in {Math.max(0, Math.ceil((msg.expiresAt - Date.now()) / 1000))}s
                </div>
              )}
              {msg.viewOnce && (
                <div className={`text-[9px] text-fuchsia-400/90 mb-0.5 px-1 ${isMine ? 'text-right' : 'text-left'}`}>
                  👁 view once
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
                  className={`relative group touch-manipulation cursor-pointer transition-all duration-150 select-none active:scale-[0.99] ${
                    isCurrentSearchMatch
                      ? 'ring-2 ring-[var(--nova-accent-color,#ff4e18)] shadow-[0_0_24px_rgba(255,78,24,0.6)] rounded-[24px]'
                      : isHighlighted
                      ? 'shadow-[0_0_18px_rgba(255,78,24,0.28)] rounded-[24px]'
                      : hasWordMatch
                      ? 'ring-1 ring-[var(--nova-accent-color,#ff4e18)]/40 rounded-[24px]'
                      : ''
                  }`}
                >
                  {/* Quick Action Pill on hover (Desktop) attached directly to the message bubble */}
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`absolute -top-3.5 ${isMine ? 'left-3' : 'right-3'} z-20 hidden sm:flex items-center gap-1 bg-[#141520]/95 border border-white/20 backdrop-blur-xl rounded-full px-2 py-0.5 shadow-xl shadow-black/80 opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 select-none`}
                  >
                    <NovaTooltip label="Add reaction (emoji popup)">
                      <NovaIconButton
                        ref={pickerTriggerRef}
                        label="Add reaction (emoji popup)"
                        icon={<Heart className="fill-rose-400/50" />}
                        size={32}
                        className="text-rose-400 hover:bg-rose-500/25"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveReactionMsgId((curr) => (curr === msg.id ? null : msg.id));
                        }}
                      />
                    </NovaTooltip>
                    <NovaTooltip label="Reply to message">
                      <NovaIconButton
                        label="Reply to message"
                        icon={<Reply />}
                        size={32}
                        className="text-[var(--nova-accent-color,#ff4e18)]"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplyMessage(msg);
                        }}
                      />
                    </NovaTooltip>
                    <NovaTooltip label="Forward message">
                      <NovaIconButton
                        label="Forward message"
                        icon={<Forward />}
                        size={32}
                        className="text-[var(--nova-accent-color,#ff4e18)]"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartForward(msg.id);
                        }}
                      />
                    </NovaTooltip>
                    <NovaTooltip label={msg.isPinned ? t('chat.messageActions.unpin') : t('chat.messageActions.pin')}>
                      <NovaIconButton
                        label={msg.isPinned ? t('chat.messageActions.unpin') : t('chat.messageActions.pin')}
                        icon={<Pin />}
                        size={32}
                        active={msg.isPinned}
                        className="text-[var(--nova-accent-color,#ff4e18)]"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePinMessage(msg.id);
                        }}
                      />
                    </NovaTooltip>
                    <div className="w-[1px] h-4 bg-white/15" />
                    <NovaMenu
                      label={t('common.more')}
                      trigger={
                        <NovaIconButton
                          label={t('common.more')}
                          icon={<MoreHorizontal />}
                          size={32}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      }
                      items={[
                        ...(msg.text
                          ? [
                              {
                                key: 'copy',
                                label: t('chat.messageActions.copy'),
                                icon: <Copy />,
                                shortcut: 'mod+c',
                                onSelect: () => handleCopyMessage(msg),
                              },
                            ]
                          : []),
                        ...(isMine && msg.text
                          ? [
                              {
                                key: 'edit',
                                label: t('chat.messageActions.edit'),
                                icon: <Pencil />,
                                onSelect: () => handleStartEdit(msg),
                              },
                            ]
                          : []),
                        ...(messages.some((m) => m.replyTo?.id === msg.id)
                          ? [
                              {
                                key: 'thread',
                                label: 'Thread',
                                icon: <Reply />,
                                onSelect: () => setThreadRootId(msg.id),
                              },
                            ]
                          : []),
                        ...(isMine
                          ? [
                              {
                                key: 'delete',
                                label: t('chat.messageActions.delete'),
                                icon: <Trash2 />,
                                danger: true,
                                separatorBefore: true,
                                onSelect: () => handleDeleteMessage(msg.id),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                  {/* Forward Selection Checkmark Overlay */}
                  {isForwardSelecting && (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`absolute top-2 ${isMine ? 'right-2' : 'left-2'} z-30 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 ${
                        forwardSelectedIds.has(msg.id)
                          ? 'bg-[var(--nova-accent-color,#ff4e18)] scale-100'
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
                      className={`flex items-center gap-1 text-[9.5px] font-semibold text-[var(--nova-accent-color,#ff4e18)] mb-1 px-1 ${
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
                        <div style={{ width: stickerPx, height: stickerPx }} className="flex items-center justify-center p-1 transition hover:scale-105 active:scale-95 duration-200">
                          <StickerMedia
                            sticker={msg.sticker}
                            className="w-full h-full object-contain filter drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
                            emojiClassName="text-5xl"
                          />
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
                            <div className="font-bold text-[10.5px] text-white/95 truncate">
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
                        <LocationBubble location={msg.location} />
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
                          <div className="mb-2 flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-lg bg-black/25 border-l-2 border-[var(--nova-accent-color,#ff4e18)]/70 text-[10px] text-white/70">
                            <Forward className="w-2.5 h-2.5 text-[var(--nova-accent-color,#ff4e18)]/70" />
                            <span>{t('chat.forwardedFrom')} {msg.forwardedFrom}</span>
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
                          accentColor="var(--nova-accent-color,#ff4e18)"
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
                              {renderMessageStatus(msg)}
                            </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`bg-gradient-to-r ${theme.grad} text-white rounded-[22px] rounded-br-[4px] px-4 py-2.5 max-w-[82%] shadow-lg ${theme.shadow} text-[14px] leading-relaxed`}>
                        {msg.forwardedFrom && (
                          <div className="mb-2 flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-lg bg-black/25 border-l-2 border-white/60 text-[10px] text-white/70">
                            <Forward className="w-2.5 h-2.5 text-white/70" />
                            <span>{t('chat.forwardedFrom')} {msg.forwardedFrom}</span>
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
                        {renderMessageMedia(msg)}
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
                              onClick={() => handleDownloadDocument(msg.document!.name)}
                              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition cursor-pointer active:scale-95"
                              title="Download document"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {editingMsgId === msg.id ? (
                          <div className="flex w-full min-w-0 max-w-full flex-col gap-2">
                            <textarea
                              rows={Math.min(4, Math.max(1, editingText.split('\n').length))}
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveEdit();
                                }
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              className="w-full min-w-0 resize-none break-words rounded-lg bg-black/25 px-2 py-1.5 text-[14px] leading-relaxed text-white outline-none focus:outline-none focus:ring-0"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveEdit();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold transition active:scale-95"
                              >
                                {t('common.save')}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelEdit();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-[11px] font-semibold transition active:scale-95"
                              >
                                {t('common.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p>
                              {isSearchOpen && searchQuery.trim().length > 0
                                ? highlightMatchedText(msg.text, searchQuery, isCurrentSearchMatch)
                                : renderMarkdown({ text: msg.text })}
                              {msg.editedAt && (
                                <span className="ml-1.5 text-[9px] italic text-white/60">
                                  {t('chat.edited')}
                                </span>
                              )}
                            </p>
                          </>
                        )}
                        <div className="flex items-center justify-between gap-2 text-[10px] text-white/80 mt-1.5 font-medium select-none">
                          <div className="flex items-center gap-1">
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
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(msg);
                              }}
                              className="text-white/70 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 cursor-pointer transition active:scale-90"
                              title={t('chat.messageActions.edit')}
                            >
                              <Pencil className="w-2.5 h-2.5" />
                              <span className="text-[9.5px]">{t('chat.messageActions.edit')}</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-white/85 font-mono">{msg.time}</span>
                            {renderMessageStatus(msg)}
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
                        <div style={{ width: stickerPx, height: stickerPx }} className="flex items-center justify-center p-1 transition hover:scale-105 active:scale-95 duration-200">
                          <StickerMedia
                            sticker={msg.sticker}
                            className="w-full h-full object-contain filter drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
                            emojiClassName="text-5xl"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] text-white/75 mt-1 border border-white/10 shadow-md">
                          <span className="font-mono">{msg.time}</span>
                        </div>
                      </div>
                    ) : msg.poll ? (
                      <div className="bg-[#171824]/95 border border-white/10 text-[color:var(--nova-text-primary)] rounded-[22px] rounded-tl-[4px] p-4 max-w-[92%] sm:max-w-md shadow-xl shadow-black/40">
                        {msg.replyTo && (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToMessage(msg.replyTo!.id);
                            }}
                            className="mb-2.5 pl-2.5 pr-2 py-1 rounded-lg bg-white/5 border-l-2 border-[var(--nova-accent-color)] text-xs cursor-pointer select-none transition hover:bg-white/10"
                          >
                            <div className="font-bold text-[10.5px] text-[var(--nova-accent-color)] truncate">
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
                        />
                        <div className="flex items-center justify-end text-[10px] text-[#717682] mt-2 font-mono">
                          <span>{msg.time}</span>
                        </div>
                      </div>
                    ) : msg.location ? (

                      <div className="bg-[#171824]/95 border border-white/10 text-[color:var(--nova-text-primary)] rounded-[22px] rounded-tl-[4px] p-3 max-w-[88%] sm:max-w-sm shadow-xl shadow-black/40">
                        <LocationBubble location={msg.location} />
                        <div className="flex items-center justify-end text-[10px] text-[#717682] mt-2 font-mono">
                          <span>{msg.time}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#181921]/95 border border-white/5 text-[color:var(--nova-text-primary)] rounded-[22px] rounded-tl-[4px] p-3.5 max-w-[88%] shadow-md shadow-black/40 text-[14px] leading-relaxed">
                      {msg.forwardedFrom && (
                        <div className="mb-2 flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-lg bg-white/5 border-l-2 border-[var(--nova-accent-color,#ff4e18)]/70 text-[10px] text-[#868b98]">
                          <Forward className="w-2.5 h-2.5 text-[var(--nova-accent-color,#ff4e18)]/70" />
                          <span>{t('chat.forwardedFrom')} {msg.forwardedFrom}</span>
                        </div>
                      )}
                      {msg.replyTo && (
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJumpToMessage(msg.replyTo!.id);
                          }}
                          className="mb-2 pl-2.5 pr-2 py-1 rounded-lg bg-white/5 border-l-2 border-[var(--nova-accent-color,#ff4e18)] text-xs cursor-pointer select-none transition hover:bg-white/10"
                          title={t('chat.replyingTo')}
                        >
                          <div className="font-bold text-[10.5px] text-[var(--nova-accent-color,#ff4e18)] flex items-center gap-1">
                            <Reply className="w-2.5 h-2.5" />
                            <span>{msg.replyTo.senderName}</span>
                          </div>
                          <p className="text-[11.5px] truncate text-white/80 mt-0.5 font-normal">
                            {msg.replyTo.text}
                          </p>
                        </div>
                      )}
                      {renderMessageMedia(msg)}

                      {msg.voiceNote && (
                        <div className="mb-1">
                          <AudioWaveformPlayer
                            voiceNote={msg.voiceNote}
                            isMe={false}
                            accentColor="var(--nova-accent-color,#ff4e18)"
                          />
                        </div>
                      )}

                      {msg.document && (
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/10 mb-2">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-[var(--nova-accent-color,#ff4e18)]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate">{msg.document.name}</p>
                            <p className="text-[10.5px] text-[#868b98] mt-0.5">{msg.document.size}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDownloadDocument(msg.document!.name)}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer active:scale-95"
                            title="Download document"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {msg.text && (
                        <p>
                          {isSearchOpen && searchQuery.trim().length > 0
                            ? highlightMatchedText(msg.text, searchQuery, isCurrentSearchMatch)
                            : renderMarkdown({ text: msg.text })}
                          {msg.editedAt && (
                            <span className="ml-1.5 text-[9px] italic text-[#717682]">{t('chat.edited')}</span>
                          )}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-1 text-[10px] text-[#717682] mt-1.5 font-medium select-none">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReplyMessage(msg);
                            }}
                            className="text-[var(--nova-accent-color,#ff4e18)] hover:text-[#ff6e38] flex items-center gap-1 py-0.5 px-1.5 rounded-md hover:bg-white/5 cursor-pointer transition active:scale-90"
                            title="Reply to this message"
                          >
                            <Reply className="w-3 h-3" />
                            <span className="text-[10px] font-semibold">Reply</span>
                          </button>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(event) => event.preventDefault()}
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
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectReaction(msg.id, r.emoji);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs transition-all duration-200 cursor-pointer active:scale-90 shadow-lg ${
                            r.fromMe
                              ? 'bg-[#20151c]/95 border border-[var(--nova-accent-color,#ff4e18)]/70 text-white font-bold ring-1 ring-[var(--nova-accent-color,#ff4e18)]/40 shadow-[var(--nova-accent-color,#ff4e18)]/25'
                              : 'bg-[#181920]/95 border border-white/10 text-white/90 hover:bg-[#20222a]'
                          }`}
                        >
                          <span>{r.emoji}</span>
                          <span className="text-[10px] opacity-75">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Bot inline keyboard (docs/bots-roadmap.md §B2) — rendered from the message itself. */}
                  {msg.botKeyboard && msg.botKeyboard.length > 0 && msg.botId && (
                    <MessageInlineKeyboard
                      keyboard={msg.botKeyboard}
                      botId={msg.botId}
                      messageId={msg.id}
                      onCallback={handleBotCallback}
                      onOpenWebApp={handleOpenWebApp}
                    />
                  )}
                </div>
              </div>
            </div>
          );
          }}
        />

        {isTyping && (
          <div className="flex items-start animate-in fade-in duration-200">
            <div className="bg-[#181921]/95 border border-[var(--nova-accent-color,#ff4e18)]/25 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 shadow-md shadow-black/50">
              {typingActivity === 'recording' ? (
                <>
                  <Mic className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)] animate-pulse" />
                  <span className="text-xs text-[var(--nova-accent-color,#ff4e18)] font-semibold">Katie is recording audio</span>
                  <div className="flex items-center gap-0.5 h-2.5">
                    <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-1" />
                    <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_0.2s_infinite] h-2.5" />
                    <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_0.4s_infinite] h-1.5" />
                    <span className="w-0.5 bg-[var(--nova-accent-color,#ff4e18)] rounded-full animate-[pulse_0.8s_ease-in-out_0.1s_infinite] h-2" />
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs text-[var(--nova-accent-color,#ff4e18)] font-semibold">Katie is typing</span>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce [animation-delay:-0.32s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce [animation-delay:-0.16s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-bounce" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showScrollToBottom && (
        <button
          type="button"
          onClick={() => {
            const node = messagesScrollRef.current;
            if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-20 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-lg shadow-[var(--nova-accent-color,#ff4e18)]/30 transition hover:brightness-110 active:scale-95"
          aria-label={`Scroll to ${unreadCount} new message${unreadCount === 1 ? '' : 's'}`}
          title="Scroll to latest messages"
        >
          <ChevronDown className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              data-testid="scroll-to-bottom-count"
              className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[var(--nova-accent-color,#ff4e18)] text-[10px] font-bold flex items-center justify-center leading-none"
              aria-hidden="true"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* FLOATING IN-CHAT SEARCH MATCH NAVIGATOR */}
      {isSearchOpen && searchQuery.trim() && matchingMessages.length > 0 && (
        <div className="mx-4 mb-2 z-20 flex items-center justify-between bg-[#151622]/95 backdrop-blur-xl border border-[var(--nova-accent-color,#ff4e18)]/40 rounded-2xl px-3.5 py-2 shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-bottom-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0">
              <Search className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white truncate">
                Word: <span className="text-[var(--nova-accent-color,#ff4e18)]">&quot;{searchQuery}&quot;</span>
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
              <ChevronUp className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
              <span className="text-[11px] font-semibold">Prev</span>
            </button>
            <button
              onClick={handleNextMatch}
              className="px-2 py-1 rounded-lg bg-[var(--nova-accent-color,#ff4e18)]/20 hover:bg-[var(--nova-accent-color,#ff4e18)]/30 border border-[var(--nova-accent-color,#ff4e18)]/40 text-[var(--nova-accent-color,#ff4e18)] flex items-center gap-1 text-xs font-medium transition cursor-pointer active:scale-95"
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
        <div className="px-4 py-2.5 bg-[#161724]/95 border-t border-b border-[var(--nova-accent-color,#ff4e18)]/40 flex items-center justify-between z-20 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0 border border-[var(--nova-accent-color,#ff4e18)]/30">
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
              className="px-3 py-1.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] hover:bg-[var(--nova-accent-color,#ff5d2b)] text-white text-xs font-semibold transition cursor-pointer shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 active:scale-95 flex items-center gap-1.5"
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
        <div className="px-4 py-2 bg-[#161724]/95 border-t border-b border-[var(--nova-accent-color,#ff4e18)]/40 flex items-center justify-between text-xs z-20 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-150">
          <div
            onClick={() => handleJumpToMessage(replyingTo.id)}
            className="flex items-center gap-2.5 truncate cursor-pointer group flex-1 mr-2"
            title={t('chat.replyingTo')}
          >
            <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0 border border-[var(--nova-accent-color,#ff4e18)]/30">
              <Reply className="w-3.5 h-3.5" />
            </div>
            <div className="truncate flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--nova-accent-color,#ff4e18)] font-bold text-[11px] group-hover:underline">
                  Replying to {replyingTo.senderId === 'me' ? 'Yourself' : profile.name}
                </span>
                <span className="text-[10px] text-white/40">· Click to jump</span>
              </div>
              <p className="text-[#868b98] truncate text-[11px] mt-0.5 font-normal">
                {replyingTo.text || (replyingTo.voiceNote ? t('voiceMessage', { duration: replyingTo.voiceNote.duration }) : t('chat.photoAttachment'))}
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
        <div className="px-4 py-1.5 bg-[#181926]/95 backdrop-blur-md border-t border-[var(--nova-accent-color,#ff4e18)]/30 flex items-center justify-between text-xs z-20 animate-in fade-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 truncate">
            <Clock className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)] shrink-0 animate-pulse" />
            <span className="text-white/85 truncate text-[11px]">
              <strong className="text-[var(--nova-accent-color,#ff4e18)] font-semibold">
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
              className="text-[10px] text-[var(--nova-accent-color,#ff4e18)] hover:text-[#ff6e38] font-semibold hover:underline cursor-pointer"
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
          <div ref={attachmentMenuRef} className="flex items-center gap-2 p-2 bg-[#141520]/95 backdrop-blur-xl border border-[var(--nova-accent-color,#ff4e18)]/30 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-150 overflow-x-auto scrollbar-x">
            <button
              type="button"
              onClick={() => handleAttachItem('photo')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <Camera className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('location')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Location</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('document')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Document</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('poll')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('common.poll')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('stickers')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <Smile className="w-3.5 h-3.5 text-purple-400" />
              <span>{t('stickers.title', 'Stickers')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttachItem('voice')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
            >
              <Mic className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
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
              aria-label="Close emoji picker"
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
          onSelectStickerText={handleInsertStickerText}
          stickerSize={mediaPreferences.stickerSize}
          insertInsteadOfSend={mediaPreferences.stickerInsertInsteadOfSend}
          onPreferencesChange={(change) =>
            setMediaPreferences((prev) => ({
              ...prev,
              ...(change.stickerSize ? { stickerSize: change.stickerSize } : {}),
              ...(typeof change.insertInsteadOfSend === 'boolean'
                ? { stickerInsertInsteadOfSend: change.insertInsteadOfSend }
                : {}),
            }))
          }
        />

        {/* ROW OF SMART REPLY PILL BUTTONS */}
        {shouldShowSmartReplies && (
          <div ref={smartRepliesRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none" data-testid="smart-replies">
            <div className="flex items-center gap-1 text-[11px] text-[var(--nova-accent-color,#ff4e18)] font-semibold shrink-0 pl-1 pr-1">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden sm:inline">Smart:</span>
            </div>

            {smartReplies.map((reply, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(reply, replyingTo ?? lastReceivedMessage)}
                className="rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-[#161723]/95 hover:bg-[var(--nova-accent-color,#ff4e18)] hover:text-white border border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)] text-white/90 shadow-sm backdrop-blur-md transition-all duration-150 active:scale-95 shrink-0 whitespace-nowrap cursor-pointer group flex items-center gap-1.5"
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
          <div className="flex items-center justify-between gap-2.5 p-2 bg-[#171825]/95 backdrop-blur-xl border border-[var(--nova-accent-color,#ff4e18)]/40 rounded-2xl shadow-xl animate-in slide-in-from-bottom-2 duration-150">
            {stagedAttachment.images && stagedAttachment.images.length > 0 && (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex items-center -space-x-2.5 overflow-hidden py-0.5 pl-1 shrink-0">
                  {stagedAttachment.images.slice(0, 3).map((url, i) => (
                    <LazyMedia
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
                <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0">
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

        <div className="relative flex items-center gap-2">
          {/* The row keeps a single left control: attachments. Disappearing
              messages and view-once live in the send options menu. */}
          <button
            type="button"
            onClick={(event) => openSendOptions(event.currentTarget)}
            className={`relative w-11 h-11 shrink-0 rounded-full border flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md ${
              disappearAfter > 0 || viewOnceMode
                ? 'bg-[var(--nova-accent-color,#ff4e18)]/20 border-[var(--nova-accent-color,#ff4e18)]/50 text-[var(--nova-accent-color,#ff4e18)]'
                : 'bg-[#181920]/95 hover:bg-[#20222a] border-white/10 text-white/70 hover:text-white'
            }`}
            title={t('chat.sendOptions.title')}
            aria-label={t('chat.sendOptions.title')}
            aria-haspopup="menu"
            aria-expanded={isSendOptionsOpen}
          >
            <Clock className="w-4 h-4" />
            {(disappearAfter > 0 || viewOnceMode) && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] shadow" />
            )}
          </button>
          {/* Paperclip Button opening Simulated File Selection Menu */}
          <button
            type="button"
            onClick={() => {
              setIsAttachmentMenuOpen((prev) => !prev);
              setIsEmojiPickerOpen(false);
              setIsFileModalOpen(false);
            }}
            className={`w-11 h-11 rounded-full border flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0 ${
              isFileModalOpen || stagedAttachment
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white border-[var(--nova-accent-color,#ff4e18)] shadow-[var(--nova-accent-color,#ff4e18)]/30'
                : 'bg-[#181920]/95 hover:bg-[#20222a] border-white/10 text-white/70 hover:text-white'
            }`}
            title={t('common.attach')}
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Formatting buttons stay on desktop; on phones they pushed the
              message field down to almost nothing, so the row keeps only the
              controls needed to write and send. */}
          <button
            type="button"
            onClick={() => wrapSelection('**', '**')}
            className={`hidden sm:flex w-7 h-7 rounded-full border items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0 ${
              formatState.bold
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white border-[var(--nova-accent-color,#ff4e18)]'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60 hover:text-white'
            }`}
            title={t('chat.format.bold', 'Bold')}
            aria-label={t('chat.format.bold', 'Bold')}
          >
            <span className="font-bold text-xs">B</span>
          </button>
          <button
            type="button"
            onClick={() => wrapSelection('*', '*')}
            className={`hidden sm:flex w-7 h-7 rounded-full border items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0 ${
              formatState.italic
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white border-[var(--nova-accent-color,#ff4e18)]'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60 hover:text-white'
            }`}
            title={t('chat.format.italic', 'Italic')}
            aria-label={t('chat.format.italic', 'Italic')}
          >
            <span className="italic text-xs">I</span>
          </button>
          <button
            type="button"
            onClick={() => wrapSelection('`', '`')}
            className={`hidden sm:flex w-7 h-7 rounded-full border items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0 ${
              formatState.code
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white border-[var(--nova-accent-color,#ff4e18)]'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60 hover:text-white'
            }`}
            title={t('chat.format.code', 'Code')}
            aria-label={t('chat.format.code', 'Code')}
          >
            <span className="text-xs font-mono">`</span>
          </button>
          <button
            type="button"
            onClick={() => wrapSelection('~~', '~~')}
            className={`hidden sm:flex w-7 h-7 rounded-full border items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0 ${
              formatState.strike
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white border-[var(--nova-accent-color,#ff4e18)]'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60 hover:text-white'
            }`}
            title={t('chat.format.strike', 'Strikethrough')}
            aria-label={t('chat.format.strike', 'Strikethrough')}
          >
            <span className="text-xs line-through">S</span>
          </button>

          <div className="flex-1 bg-[#181920]/95 border border-white/10 focus-within:border-[var(--nova-accent-color,#ff4e18)]/60 rounded-full pl-4 pr-1.5 py-1.5 flex items-center transition shadow-md min-w-0">
            <input
              ref={mainInputRef}
              type="text"
              value={inputText}
              onChange={(e) => {
                const val = e.target.value;
                setInputText(val);
                setDraft(chatId, val);
                if (val) {
                  void receiptManager.sendReceipt(chatId, chatId, 'typing');
                } else {
                  void receiptManager.sendReceipt(chatId, chatId, 'typing_stop');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (commandMenuOpen) {
                    e.preventDefault();
                    return;
                  }
                  handleSendMessage();
                }
                if (e.key === '/' && !inputText && !commandMenuOpen && botId) {
                  e.preventDefault();
                  setCommandMenuOpen(true);
                  return;
                }
                if (e.key === 'Escape' && commandMenuOpen) {
                  e.preventDefault();
                  setCommandMenuOpen(false);
                  return;
                }
                if (commandMenuOpen && e.key === 'ArrowDown') {
                  e.preventDefault();
                }
              }}
              placeholder={replyingTo ? t('chat.replyingToName', { name: replyingTo.senderId === 'me' ? t('common.you') : profile.name }) : t('chat.typeMessage')}
              data-inline-focus
              className="w-full bg-transparent text-sm text-[color:var(--nova-text-primary)] placeholder-[color:var(--nova-text-muted)] focus:outline-none py-1 min-w-0"
            />
            {commandMenuOpen && botCommands?.length && (
              <CommandMenu
                commands={botCommands}
                isOpen={commandMenuOpen}
                onSelect={(command) => {
                  setInputText(`/${command} `);
                  setCommandMenuOpen(false);
                  void mainInputRef.current?.focus();
                }}
                onClose={() => setCommandMenuOpen(false)}
              />
            )}

            {/* Bot commands: makes the slash menu discoverable instead of
                requiring people to guess that typing "/" does something. */}
            {botId && (
              <button
                type="button"
                onClick={() => {
                  if (botCommands?.length) {
                    setCommandMenuOpen((prev) => !prev);
                  } else {
                    setInputText((prev) => (prev.startsWith('/') ? prev : `/${prev}`));
                  }
                  mainInputRef.current?.focus();
                }}
                className={`p-1.5 rounded-full transition cursor-pointer shrink-0 active:scale-90 ${
                  commandMenuOpen
                    ? 'text-[var(--nova-accent-color,#ff4e18)] bg-white/10'
                    : 'text-white/50 hover:text-[var(--nova-accent-color,#ff4e18)] hover:bg-white/10'
                }`}
                title={t('bot.commands', { defaultValue: 'Bot commands' })}
                aria-label={t('bot.commands', { defaultValue: 'Bot commands' })}
              >
                <Bot className="w-4 h-4" />
              </button>
            )}

            {/* Emoji Picker Button inside input field */}
            <button
              type="button"
              onClick={() => {
                setIsEmojiPickerOpen((prev) => !prev);
                setIsAttachmentMenuOpen(false);
              }}
              className={`p-1.5 rounded-full transition cursor-pointer shrink-0 active:scale-90 ${
                isEmojiPickerOpen
                  ? 'text-[var(--nova-accent-color,#ff4e18)] bg-white/10'
                  : 'text-white/50 hover:text-[var(--nova-accent-color,#ff4e18)] hover:bg-white/10'
              }`}
              title={t('common.react')}
            >
              <Smile className="w-4 h-4" />
            </button>
          </div>

          {inputText.trim() ? (
            <div className="relative shrink-0">
              {scheduledMessages.length > 0 && (
                <span
                  className="absolute -top-1.5 -left-1 z-10 w-4 h-4 rounded-full bg-[var(--nova-accent-color,#ff4e18)] text-white text-[9px] font-bold flex items-center justify-center shadow-md"
                  title={`${scheduledMessages.length} scheduled`}
                >
                  {scheduledMessages.length}
                </span>
              )}
              <button
                type="button"
                onPointerDown={handleSendPointerDown}
                onPointerUp={handleSendPointerUp}
                onPointerLeave={handleSendPointerCancel}
                onPointerCancel={handleSendPointerCancel}
                onClick={(e) => {
                  if (e.detail === 0) handleSendMessage();
                  else openSendOptions(e.currentTarget);
                }}
                style={{ touchAction: 'manipulation' }}
                className="w-11 h-11 rounded-full bg-[var(--nova-accent-color,#ff4e18)] hover:bg-[var(--nova-accent-color,#ff5d2b)] active:scale-90 text-white flex items-center justify-center shadow-lg shadow-[var(--nova-accent-color,#ff4e18)]/30 transition cursor-pointer relative group select-none animate-in zoom-in-75 fade-in duration-150"
                title={t('common.send')}
                aria-haspopup="menu"
                aria-expanded={isSendOptionsOpen}
              >
                <Send className="w-4 h-4 ml-0.5" />
                {/* Hold hint badge */}
                <div className="absolute -top-7 right-0 bg-[#1e202a] text-white text-[9px] px-2 py-0.5 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md">
                  {t('chat.sendOptions.hold')}
                </div>
              </button>

            </div>
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

        {/* One send-options sheet for both the clock button and the send
            button, so the composer row only carries the mic/send switch. */}
        {isSendOptionsOpen &&
          createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setIsSendOptionsOpen(false)} />
            <div
              ref={sendOptionsPanelRef}
              role="menu"
              aria-label={t('chat.sendOptions.title')}
              style={{
                top: sendOptionsPosition?.top,
                bottom: sendOptionsPosition?.bottom,
                left: sendOptionsPosition?.left ?? 8,
              }}
              className="fixed z-[75] w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#151621]/98 shadow-2xl shadow-black/80 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-1 duration-150"
            >
              <div className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                {t('chat.sendOptions.title')}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSendSilently((prev) => !prev);
                  triggerPinnedToast(sendSilently ? t('chat.sendOptions.silentOff') : t('chat.sendOptions.silentOn'));
                  setIsSendOptionsOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2.5 px-3 py-2 text-xs text-white/80 transition hover:bg-white/5 cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <VolumeX className="h-3.5 w-3.5 text-[var(--nova-accent-color)]" />
                  <span>{t('chat.sendOptions.silent')}</span>
                </span>
                {sendSilently && <Check className="h-3.5 w-3.5 text-[var(--nova-accent-color)]" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSendOptionsOpen(false);
                  setIsScheduleModalOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/80 transition hover:bg-white/5 cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5 text-[var(--nova-accent-color)]" />
                <span>{t('chat.sendOptions.schedule')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewOnceMode((prev) => !prev);
                  setIsSendOptionsOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2.5 px-3 py-2 text-xs text-white/80 transition hover:bg-white/5 cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Eye className="h-3.5 w-3.5 text-[var(--nova-accent-color)]" />
                  <span>{t('chat.sendOptions.viewOnce')}</span>
                </span>
                {viewOnceMode && <Check className="h-3.5 w-3.5 text-[var(--nova-accent-color)]" />}
              </button>
              <div className="my-1 h-px bg-white/10" role="separator" />
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                {t('chat.sendOptions.disappearing')}
              </div>
              <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 pt-1">
                {[
                  { value: 0, label: t('chat.sendOptions.off') },
                  { value: 5, label: t('chat.sendOptions.seconds', { count: 5 }) },
                  { value: 10, label: t('chat.sendOptions.seconds', { count: 10 }) },
                  { value: 30, label: t('chat.sendOptions.seconds', { count: 30 }) },
                  { value: 60, label: t('chat.sendOptions.minute') },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setDisappearAfter(option.value);
                      setIsSendOptionsOpen(false);
                    }}
                    aria-pressed={disappearAfter === option.value}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      disappearAfter === option.value
                        ? 'bg-[var(--nova-accent-color)] text-white'
                        : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
          )}
      </div>
        </>
      )}

      {/* GROUP MEMBERS DIALOG */}
      {isGroupChat && isGroupMembersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setIsGroupMembersOpen(false)}
        >
          <div
            ref={groupMembersRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('chat.groupMembers')}
            data-testid="group-members-dialog"
            className="w-full max-w-sm mx-4 bg-[#151621]/98 border border-white/15 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden animate-in zoom-in-95 fade-in duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-base text-white">
                {t('chat.groupMembers')}
                <span className="ml-1.5 text-xs font-normal text-[#8c919d]">
                  ({groupMembers.length})
                </span>
              </h3>
              <button
                onClick={() => setIsGroupMembersOpen(false)}
                className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {currentUserIsGroupAdmin && pendingJoinRequests.length > 0 && (
              <div
                data-testid="join-requests"
                className="border-b border-white/10 px-4 py-3 space-y-2"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8c919d]">
                  {t('chat.joinRequests')}
                </span>
                {pendingJoinRequests.map((request) => (
                  <div key={request.fingerprint} className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate text-xs text-white/90 font-mono">
                      {request.name || request.fingerprint}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void handleApproveJoinRequest(request.fingerprint);
                      }}
                      aria-label={`${t('chat.approveJoinRequest')}: ${request.fingerprint}`}
                      className="px-2.5 py-1 rounded-lg bg-[var(--nova-accent-color,#ff4e18)]/20 border border-[var(--nova-accent-color,#ff4e18)]/40 text-[10px] font-semibold text-[var(--nova-accent-color,#ff4e18)] hover:bg-[var(--nova-accent-color,#ff4e18)]/30 transition cursor-pointer shrink-0"
                    >
                      {t('chat.approveJoinRequest')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectJoinRequest(request.fingerprint)}
                      aria-label={`${t('chat.rejectJoinRequest')}: ${request.fingerprint}`}
                      className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-semibold text-white/60 hover:bg-white/10 hover:text-white transition cursor-pointer shrink-0"
                    >
                      {t('chat.rejectJoinRequest')}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="max-h-[260px] overflow-y-auto">
              {groupMembers.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-[#8c919d]">
                  {t('chat.noMembers')}
                </p>
              ) : (
                groupMembers.map((member) => (
                  <div
                    key={member}
                    className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 last:border-0"
                  >
                    <span className="flex-1 min-w-0 truncate text-xs text-white/90 font-mono">
                      {member}
                    </span>
                    <span
                      data-testid={`group-role-${member}`}
                      className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide ${
                        getMemberRole(groupRoles, member) === 'admin'
                          ? 'bg-[var(--nova-accent-color,#ff4e18)]/20 text-[var(--nova-accent-color,#ff4e18)] border border-[var(--nova-accent-color,#ff4e18)]/40'
                          : 'bg-white/5 text-white/50 border border-white/10'
                      }`}
                    >
                      {t(
                        getMemberRole(groupRoles, member) === 'admin'
                          ? 'chat.roleAdmin'
                          : 'chat.roleMember',
                      )}
                    </span>
                    {currentUserIsGroupAdmin && member !== localFingerprint && (
                      <button
                        type="button"
                        onClick={() => handleToggleGroupRole(member)}
                        aria-label={`${t(
                          getMemberRole(groupRoles, member) === 'admin'
                            ? 'chat.makeMember'
                            : 'chat.makeAdmin',
                        )}: ${member}`}
                        className="w-7 h-7 rounded-full text-white/40 hover:text-[var(--nova-accent-color,#ff4e18)] hover:bg-white/10 flex items-center justify-center transition cursor-pointer"
                      >
                        <ShieldCheck
                          className={`w-3.5 h-3.5 ${
                            getMemberRole(groupRoles, member) === 'admin' ? 'text-current' : 'opacity-40'
                          }`}
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void handleRemoveGroupMember(member);
                      }}
                      disabled={!currentUserIsGroupAdmin}
                      aria-label={`${t('chat.removeMember')}: ${member}`}
                      title={currentUserIsGroupAdmin ? undefined : t('chat.adminOnly')}
                      className="w-7 h-7 rounded-full text-white/40 hover:text-red-400 hover:bg-white/10 flex items-center justify-center transition cursor-pointer disabled:opacity-30 disabled:hover:text-white/40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {groupInvite && (
              <div className="px-4 py-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8c919d]">
                    {t('chat.inviteTitle')}
                  </span>
                  <button
                    type="button"
                    onClick={handleRegenerateGroupInvite}
                    disabled={!currentUserIsGroupAdmin}
                    title={currentUserIsGroupAdmin ? undefined : t('chat.adminOnly')}
                    className="text-[10px] font-semibold text-[var(--nova-accent-color,#ff4e18)] hover:underline transition cursor-pointer disabled:text-white/30 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    {t('chat.inviteRegenerate')}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={groupInvite.link}
                    aria-label={t('chat.inviteTitle')}
                    onFocus={(event) => event.currentTarget.select()}
                    className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white/80 font-mono outline-none focus:border-[var(--nova-accent-color,#ff4e18)]/60"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyGroupInvite();
                    }}
                    aria-label={t('chat.inviteCopy')}
                    className="px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/20 transition cursor-pointer shrink-0"
                  >
                    {t('chat.inviteCopy')}
                  </button>
                </div>
                <p className="text-[10px] leading-snug text-[#8c919d]">{t('chat.inviteHint')}</p>
              </div>
            )}

            <div className="p-3 border-t border-white/10 flex items-center gap-2">
              {currentUserIsGroupAdmin ? (
                <>
                  <input
                    value={newMemberFingerprint}
                    onChange={(event) => setNewMemberFingerprint(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleAddGroupMember();
                    }}
                    placeholder={t('chat.memberFingerprint')}
                    aria-label={t('chat.memberFingerprint')}
                    className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-[var(--nova-accent-color,#ff4e18)]/60"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleAddGroupMember();
                    }}
                    disabled={!newMemberFingerprint.trim()}
                    className="px-3 py-2 rounded-xl bg-[var(--nova-accent-color,#ff4e18)] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--nova-accent-color,#ff5d2b)] transition cursor-pointer shrink-0"
                  >
                    {t('chat.addMember')}
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-[#8c919d]">{t('chat.adminOnly')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FILE TRANSFER PROGRESS */}
      {fileTransfer &&
        (() => {
          const percent =
            fileTransfer.total > 0
              ? Math.min(100, Math.round((fileTransfer.bytes / fileTransfer.total) * 100))
              : 0;
          const label =
            fileTransfer.direction === 'send'
              ? t('chat.fileSending')
              : t('chat.fileReceiving');
          return (
            <div
              role="status"
              aria-live="polite"
              data-testid="file-transfer-progress"
              className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,360px)] rounded-2xl border border-white/10 bg-[#151621]/97 backdrop-blur-xl px-3 py-2.5 shadow-2xl shadow-black/60"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] text-white">
                <span className="truncate">{fileTransfer.fileName}</span>
                <span className="tabular-nums text-[#8c919d]">{percent}%</span>
              </div>
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={t('chat.fileTransfer')}
              >
                <div
                  className="h-full rounded-full bg-[var(--nova-accent-color,#ff4e18)] transition-[width] duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[#8c919d]">
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => {
                    void fileTransferManager.cancelTransfer(fileTransfer.id);
                    setFileTransfer(null);
                  }}
                  className="text-[var(--nova-accent-color,#ff4e18)] hover:underline cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          );
        })()}

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
        messageText={inputText || (recordedVoiceNote ? t('voiceMessage', { duration: recordedVoiceNote.duration }) : '')}
        onSchedule={handleScheduleMessage}
        onClose={() => setIsScheduleModalOpen(false)}
      />

      {/* REPORT BOT MODAL */}
      {isReportBotOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">{t('chat.reportBot', { defaultValue: 'Report bot' })}</h3>
              <button
                onClick={() => setIsReportBotOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-[13px] text-white/80">
                {t('chat.reportBotDesc', { defaultValue: 'Report this bot for spam, abuse, or violating terms. Your report will be reviewed.' })}
              </p>
              <div className="space-y-2">
                {BOT_REPORT_REASONS.map((reason: BotReportReason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => {
                      if (botId) recordBotReport(botId, reason);
                      showToast(`${t('chat.reportSubmitted', { defaultValue: 'Report submitted: ' })}${reason}`);
                      setIsReportBotOpen(false);
                    }}
                    className="w-full py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[12px] font-medium text-white/80 hover:bg-white/[0.1] transition cursor-pointer"
                  >
                    {reason.charAt(0).toUpperCase() + reason.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsReportBotOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BLOCK BOT CONFIRM MODAL */}
      {isBlockBotConfirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">{t('chat.blockBot', { defaultValue: 'Block bot' })}</h3>
              <button
                onClick={() => setIsBlockBotConfirm(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-[13px] text-white/80">
                {t('chat.blockBotConfirm', { defaultValue: 'Block this bot? You will no longer receive messages from it.' })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsBlockBotConfirm(false);
                    if (!botId || !getBotSession) return;
                    void getBotSession()
                      .setBlocked(botId, true)
                      .then(() => {
                        setBotBlocked(true);
                        setBotTyping(false);
                        showToast(t('chat.botBlocked', { defaultValue: 'Bot blocked' }));
                      })
                      .catch(() => {
                        showToast(t('chat.botBlockFailed', { defaultValue: 'Could not block bot' }));
                      });
                  }}
                  className="flex-1 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 font-medium hover:bg-red-500/30 transition cursor-pointer"
                >
                  {t('chat.block', { defaultValue: 'Block' })}
                </button>
                <button
                  type="button"
                  onClick={() => setIsBlockBotConfirm(false)}
                  className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN MEDIA CALL OVERLAY */}
      <VideoCallOverlay
        isOpen={isVideoCallOpen}
        isMinimized={isVideoCallMinimized}
        onEndCall={handleEndVideoCall}
        onMinimize={() => setIsVideoCallMinimized(true)}
        onMaximize={() => setIsVideoCallMinimized(false)}
        contactName={profile.name}
        contactAvatar={profile.avatar}
        mode={callMode}
        localStream={localCallStream}
        remoteStream={remoteCallStream}
        connectionStatus={callConnectionStatus}
        hidesIp={loadPrivacyPrefs().webrtcRelayOnly}
        isMicOn={isCallMicOn}
        isCameraOn={isCallCameraOn}
        onToggleMic={() => {
          setIsCallMicOn((prev) => {
            mediaCallRef.current?.setMicrophoneEnabled(!prev);
            return !prev;
          });
        }}
        onToggleCamera={() => {
          setIsCallCameraOn((prev) => {
            mediaCallRef.current?.setCameraEnabled(!prev);
            return !prev;
          });
        }}
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
                aria-label="Close forward dialog"
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
                  <LazyMedia
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
                  <Forward className="w-4 h-4 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {threadRootId && (
        <div
          ref={threadRef}
          role="dialog"
          aria-modal="true"
          aria-label="Thread"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in"
        >
          <div className="bg-[#181922] border border-white/10 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Thread</h3>
              <button
                onClick={() => setThreadRootId(null)}
                className="p-1.5 text-white/50 hover:text-white transition cursor-pointer"
                aria-label="Close thread"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {getThreadMessages(messages, threadRootId).map((m) => (
                  <div key={m.id} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/90">
                    {m.text || (m.deleted ? t('chat.messageDeleted') : '…')}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      {isMoreMenuOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsMoreMenuOpen(false)} />
            <div
              ref={moreMenuPanelRef}
              role="menu"
              aria-label={t('chat.chatActions')}
              style={{ top: moreMenuPosition?.top ?? 8, left: moreMenuPosition?.left ?? 8 }}
              className="fixed z-50 max-h-[calc(100vh-1rem)] w-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#151621]/98 shadow-2xl shadow-black/80 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <div className="px-3 py-2 border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/50">
                {t('chat.chatActions')}
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenProfile();
                  setIsMoreMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:bg-white/5 transition cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
                <span>{t('chat.contactInfo')}</span>
              </button>
              {isGroupChat && (
                <button
                  type="button"
                  onClick={() => {
                    setIsGroupMembersOpen(true);
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:bg-white/5 transition cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
                  <span>{t('chat.groupMembers')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveHeaderTab('gallery');
                  setIsMoreMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:bg-white/5 transition cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
                <span>{t('chat.mediaLinks')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsWallpaperModalOpen(true);
                  setIsMoreMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:bg-white/5 transition cursor-pointer"
              >
                <Palette className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
                <span>{t('chat.appearance')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCycleChatTheme();
                  setIsMoreMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:bg-white/5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
                <span>{t('chat.chatTheme')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleChatNotifications();
                  setIsMoreMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition cursor-pointer ${
                  chatNotificationsEnabled
                    ? 'text-white/80 hover:bg-white/5'
                    : 'text-[#8c919d] hover:bg-white/5'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>
                  {chatNotificationsEnabled
                    ? t('chat.disableNotifications')
                    : t('chat.enableNotifications')}
                </span>
              </button>
              {scheduledMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsScheduleModalOpen(true);
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/80 hover:bg-white/5 transition cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
                  <span>{t('chat.scheduledCount', { count: scheduledMessages.length })}</span>
                </button>
              )}
              {botId && (
                <>
                  <div className="h-px bg-white/10 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setIsReportBotOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{t('chat.reportBot', { defaultValue: 'Report bot' })}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      if (botBlocked) {
                        if (!botId || !getBotSession) return;
                        void getBotSession()
                          .setBlocked(botId, false)
                          .then(() => {
                            setBotBlocked(false);
                            showToast(t('chat.botUnblocked', { defaultValue: 'Bot unblocked' }));
                          })
                          .catch(() => {
                            showToast(t('chat.botUnblockFailed', { defaultValue: 'Could not unblock bot' }));
                          });
                        return;
                      }
                      setIsBlockBotConfirm(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>
                      {botBlocked
                        ? t('chat.unblockBot', { defaultValue: 'Unblock bot' })
                        : t('chat.blockBot', { defaultValue: 'Block bot' })}
                    </span>
                  </button>
                </>
              )}
              <div className="h-px bg-white/10 my-1" />
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/60 hover:bg-white/5 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </>,
          document.body,
        )}
      {mediaLightbox &&
        createPortal(
          <div
            ref={mediaLightboxRef}
            role="dialog"
            aria-modal="true"
            aria-label="Media viewer"
            data-theme-preserve="dark"
            tabIndex={-1}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-4 text-white backdrop-blur-md"
          >
            <button
              type="button"
              aria-label="Close media viewer"
              onClick={() => setMediaLightbox(null)}
              className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="absolute inset-0" onClick={() => setMediaLightbox(null)} />
            <div className="relative z-10 flex max-h-full max-w-full items-center gap-3" onClick={(event) => event.stopPropagation()}>
              {mediaLightbox.urls.length > 1 && (
                <button
                  type="button"
                  aria-label="Previous media"
                  onClick={() =>
                    setMediaLightbox((current) =>
                      current
                        ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length }
                        : current,
                    )
                  }
                  className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/75 cursor-pointer sm:static sm:translate-y-0"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {isVideoMediaUrl(mediaLightbox.urls[mediaLightbox.index]) ? (
                <video
                  src={mediaLightbox.urls[mediaLightbox.index]}
                  controls
                  playsInline
                  aria-label={`Media ${mediaLightbox.index + 1}`}
                  className="max-h-[85vh] max-w-[85vw] rounded-xl bg-black"
                />
              ) : (
                <LazyMedia
                  src={mediaLightbox.urls[mediaLightbox.index]}
                  alt={`Media ${mediaLightbox.index + 1}`}
                  eager
                  className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl"
                />
              )}
              {mediaLightbox.urls.length > 1 && (
                <button
                  type="button"
                  aria-label="Next media"
                  onClick={() =>
                    setMediaLightbox((current) =>
                      current
                        ? { ...current, index: (current.index + 1) % current.urls.length }
                        : current,
                    )
                  }
                  className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/75 cursor-pointer sm:static sm:translate-y-0"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
            {mediaLightbox.urls.length > 1 && (
              <span className="absolute bottom-5 z-20 text-xs text-white/70">
                {mediaLightbox.index + 1} / {mediaLightbox.urls.length}
              </span>
            )}
          </div>,
          document.body,
        )}
        {/* Mini App overlay (Phase B7) — opens on top of the chat when a `web_app` button is pressed. */}
        {openMiniApp && (
          <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0c10]/95 backdrop-blur-sm">
            <MiniAppIframe
              botId={openMiniApp.botId}
              webAppUrl={openMiniApp.webAppUrl}
              userId="me"
              secret={openMiniApp.botId}
              onClose={() => setOpenMiniApp(null)}
              onInlineQuery={(query) => {
                setOpenMiniApp(null);
                // Route inline_query to the bot runtime if a session is wired.
                if (getBotSession) {
                  const session = getBotSession();
                  void session.deliverUpdate(openMiniApp.botId, {
                    type: 'inline_query',
                    payload: {
                      id: `iq_${Date.now()}`,
                      chat: { id: chatId, kind: 'direct' },
                      query,
                      offset: '',
                      from: 'me',
                      timestamp: Date.now(),
                    },
                  });
                }
              }}
              onMainButtonClick={() => {
                appendSystemMessage(`Mini App: ${openMiniApp.botId} main button pressed`);
              }}
            />
          </div>
        )}
    </div>
  );
};
