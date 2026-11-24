import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  MessageSquare,
  Radio,
  BarChart3,
  Settings,
  Folder,
  Users,
  MapPin,
  ArrowLeft,
  Crown,
} from 'lucide-react';
import {
  NovaIconButton,
  NovaTooltip,
  NovaBadge,
} from './lib/ui';
import { ChannelListPanel } from './components/ChannelListPanel';
import { LazyMedia } from './components/LazyMedia';
import { JoinRequestNotice, type JoinRequestNoticeData } from './components/JoinRequestNotice';
import { PinLockScreen } from './components/PinLockScreen';
import { SanctionGate } from './components/SanctionGate';
import { EncryptedBotStorage, NOVA_BOTS } from './lib/bots/runtime';
import { dbInstance } from './lib/storage/db';
import { botSession } from './lib/bots/session';
import { ThreadSidebar } from './components/ThreadSidebar';
import { BottomNav } from './components/BottomNav';

// ChatScreen and ChatsScreen are the two heaviest entry points; load them on
// demand so the initial bundle stays small. MeshMap, Settings, Profile and
// Anonymous are already lazy below.
const ChatScreen = lazy(() =>
  import('./components/ChatScreen').then((m) => ({ default: m.ChatScreen })),
);
const ChatsScreen = lazy(() =>
  import('./components/ChatsScreen').then((m) => ({ default: m.ChatsScreen })),
);
const ChannelScreen = lazy(() =>
  import('./components/ChannelScreen').then((m) => ({ default: m.ChannelScreen })),
);

// Secondary screens and the settings modal are loaded on demand, so their code
// (qr-code rendering, analytics charts, crypto backup UI) stays out of the
// initial bundle.
const ProfileScreen = lazy(() =>
  import('./components/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
);
const AnalyticsScreen = lazy(() =>
  import('./components/AnalyticsScreen').then((m) => ({ default: m.AnalyticsScreen })),
);
const MeshMapScreen = lazy(() =>
  import('./components/MeshMap').then((m) => ({ default: m.MeshMap })),
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);
const AnonymousMessengerScreen = lazy(() =>
  import('./components/AnonymousMessengerScreen').then((m) => ({ default: m.AnonymousMessengerScreen })),
);
const SitesScreen = lazy(() =>
  import('./features/sites/SitesScreen').then((m) => ({ default: m.default })),
);
const CryptoCheckoutModal = lazy(() =>
  import('./components/CryptoCheckoutModal').then((m) => ({ default: m.CryptoCheckoutModal })),
);

const ScreenFallback: React.FC = () => (
      <div className="flex h-full w-full items-center justify-center bg-[var(--bg-app)]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--nova-accent-color)]" />
  </div>
);

/** Keeps a crashing lazy panel from unmounting the whole app. */
class PanelErrorBoundary extends React.Component<
  { name: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.name}]`, error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          data-testid={`${this.props.name}-error`}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6 text-left"
        >
          <pre className="max-h-full max-w-2xl overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--nova-surface)] p-4 text-xs text-red-400">
            {this.props.name}: {this.state.error.message}
            {'\n'}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
import { useLanguage } from './context/LanguageContext';
import { useAccount } from './hooks/useAccount';
import { ACTIVE_ACCOUNT_CHANGED_EVENT } from './lib/account/multiAccount';
import { useSecurity } from './hooks/useSecurity';
import { P2PManager } from './lib/p2p/p2pManager';
import { P2PSignalingClient } from './lib/p2p/signaling';
import { resolveSignalingUrl } from './lib/p2p/signalingConfig';
import { identityPrivateKeys } from './lib/crypto/identity';
import { bufferToBase64 } from './lib/crypto/aes';
import { observePeerKey } from './lib/security/peerKeyJournal';
import { MeshRelay } from './lib/p2p/relay';
import { TransportManager } from './lib/network/TransportManager';
import type { TransportBackend } from './lib/network/TransportManager';
import { isPremium } from './lib/premium';
import { useSocialData } from './hooks/useSocialData';
import { KYIV_CHANNEL_ID } from './lib/social/store';
import {
  ACCENT_COLORS,
  applyAccentColor,
  applyAppTheme,
  applyFontSize,
  readAppTheme,

  readFontSize,
} from './lib/ui/appearance';
import { parseDeepLinkFromHash, parseDeepLink, type DeepLinkTarget } from './lib/network/deepLinks';
import { type SiteHandoff } from './features/sites/HandoffPrompt';
import { subscribeTauriDeepLinks } from './lib/network/tauriDeepLinks';
import { playSound } from './lib/notifications/sounds';
import { buildLiveMeshSnapshot, clearLastGpsFix, GPS_FIX_EVENT } from './lib/p2p/meshMapNodes';
import { heartbeatPresence, fetchPresence, resolvePresenceIds } from './lib/p2p/presence';
import { loadPrivacyPrefs } from './lib/network/privacyMode';
import { flushOfflineQueueViaRelay } from './lib/network/offlineRelay';
import { markJoinPending } from './lib/social/groupJoinRequests';
import { applyContactOverrides } from './lib/contacts/contactOverrides';
import { isGroupAdmin, loadGroupRoles } from './lib/social/groupRoles';
import {
  JOIN_RETRY_MAX_MS,
  JoinRequestRelay,
  nextJoinOutboxDelay,
} from './lib/social/joinRequestRelay';
import { MOCK_CHATS, CONTACT_PROFILES } from './data/mockMessengerData';
import { isOnboardingComplete } from './lib/onboarding';
import { useFocusTrap } from './lib/ui/useFocusTrap';
import {
  screenForBottomTab,
  type BottomTab,
  type ScreenId,
} from './types/navigation';

const OnboardingWizard = lazy(() =>
  import('./components/OnboardingWizard').then((m) => ({ default: m.OnboardingWizard })),
);

export default function App() {
  const { t, language } = useLanguage();
  const { account } = useAccount();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const { isLocked, pinHash, unlock, identity, isInitialized, setP2PManager, peerFingerprintsByChat } = useSecurity();
  const premium = isPremium();

  // Bots track (docs/bots-roadmap.md §B2): one session per app lifetime.
  // With VITE_NOVA_BOTS=false the UI never receives a session, so the feature
  // is absent rather than merely inert.
  const botsEnabled = NOVA_BOTS;
  const botSessionRef = useRef<typeof botSession | null>(null);
  const getBotSession = useCallback(() => {
    if (!botSessionRef.current) botSessionRef.current = botSession;
    return botSessionRef.current;
  }, []);
  // Keep the latest fingerprint→chatId map so P2PManager.onMessage can route
  // incoming messages to the right bot or chat UI without recreating the transport.
  const peerFingerprintsRef = useRef(peerFingerprintsByChat);
  const relayRef = useRef<MeshRelay | null>(null);
  useEffect(() => {
    peerFingerprintsRef.current = peerFingerprintsByChat;
  }, [peerFingerprintsByChat]);

  // Wire the real P2P transport once the local identity is available. The
  // signaling client uses the configured WebSocket endpoint when available;
  // without one it falls back to the in-page BroadcastChannel bus (same
  // browser/tabs only), which is not a remote transport.
  useEffect(() => {
    if (!identity || !setP2PManager) return;
    let manager: P2PManager | null = null;
    let signaling: P2PSignalingClient | null = null;
    let relay: MeshRelay | null = null;
    let transportManager: TransportManager | null = null;
    let unsubscribeCallInvite: (() => void) | null = null;
    const start = async () => {
      signaling = new P2PSignalingClient({
        url: resolveSignalingUrl(),
        registerFingerprint: identity.fingerprint,
        signingPrivateKey: identity.privateKeyRaw ? bufferToBase64(identityPrivateKeys(identity).ed25519Secret) : undefined,
        signingPublicKey: identity.signingPublicKey,
      });
      setCallSignaling(signaling);
      unsubscribeCallInvite = signaling.onMessage((message) => {
        if (message.targetFingerprint !== identity.fingerprint) return;
        if (message.type !== 'call_invite') return;
        const payload = (message.payload ?? {}) as { callId?: unknown; mode?: unknown };
        const callId = typeof payload.callId === 'string' ? payload.callId : null;
        const mode = payload.mode === 'voice' || payload.mode === 'video' ? payload.mode : null;
        if (!callId || !mode) return;
        const chatId = Object.entries(peerFingerprintsRef.current)
          .find(([, fp]) => fp === message.senderFingerprint)?.[0];
        if (!chatId) return;
        setPendingIncomingCall({ chatId, callId, mode, from: message.senderFingerprint });
        if (viewRef.current.chatId !== chatId || viewRef.current.screen !== 'chat') {
          navigate('chat', { chatId });
        }
      });
      relay = new MeshRelay(identity.fingerprint);
      relayRef.current = relay;

      // Multi-backend transport manager: WebRTC DataChannel is handled per-peer
      // directly by P2PManager (channel.sendData). TransportManager provides the
      // fallback mesh relay (BroadcastChannel) plus auto-probing, latency
      // tracking and failover, and is extensible to WebSocket/TOR backends.
      const meshBackend: TransportBackend = {
        id: 'mesh',
        name: 'Mesh Relay',
        priority: 1,
        isAvailable: true,
        isBlocked: false,
        latency: 0,
        lastProbe: null,
        async connect() { /* mesh relay is connectionless */ },
        async disconnect() { /* no-op */ },
        async send(data: Uint8Array) {
          const payload = JSON.parse(new TextDecoder().decode(data));
          if (!relay!.send(identity.fingerprint, payload)) {
            throw new Error('Mesh relay send failed');
          }
        },
      };

      const transportManager = new TransportManager({
        backends: [meshBackend],
        autoProbeInterval: 30_000,
        probeTimeout: 5_000,
        failoverThreshold: 3,
      });
      await transportManager.connect();

      manager = new P2PManager({ 
        identity, 
        signaling, 
        relay,
        transportManager,
        // B4: every bundle the transport accepts (including a bot's) goes
        // through the key-change journal, so a rotated bot key is recorded the
        // same way a contact's is.
        onPeerBundle: (fingerprint, bundle) => {
          const chatId = Object.entries(peerFingerprintsRef.current)
            .find(([, fp]) => fp === fingerprint)?.[0] ?? fingerprint;
          void observePeerKey(chatId, {
            fingerprint: bundle.fingerprint,
            signingKey: bundle.signingKey,
            identityKey: bundle.identityKey,
          }).catch(() => undefined);
        },
        // B4 (L2 gateway transport): route incoming P2P/relay messages.
        // Encrypted ratchet payloads arrive here already decrypted as plain
        // text. They are either: (a) receipt signals (type: delivered/read/typing/…),
        // (b) file-transfer chunks (type: file_meta/…), or (c) plain chat text.
        // Non-bot chat text is forwarded to the active chat UI via a ref so
        // ChatScreen can render it without remounting this effect.
        onMessage: (fromFingerprint, text) => {
          const chatId = Object.entries(peerFingerprintsRef.current)
            .find(([, fp]) => fp === fromFingerprint)?.[0];
          if (!chatId) return;

          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = null;
          }

          const signal = parsed as { type?: string; [key: string]: unknown } | null;
          const isReceipt = signal && typeof signal.type === 'string'
            && /^(delivered|read|typing|typing_stop)$/.test(signal.type);
          const isFile = signal && typeof signal.type === 'string'
            && /^(file_meta|file_chunk|file_ack|file_resume|file_complete|file_abort)$/.test(signal.type);

          if (isReceipt && signal) {
            window.dispatchEvent(new CustomEvent('nova:p2p:receipt', { detail: { signal } }));
            return;
          }
          if (isFile && signal) {
            window.dispatchEvent(new CustomEvent('nova:p2p:file', { detail: { peerFingerprint: fromFingerprint, message: signal } }));
            return;
          }

          if (!botsEnabled) return;
          const session = getBotSession();
          if (session.isBot(chatId)) {
            void session.deliverMessage(chatId, {
              type: 'message',
              payload: {
                messageId: 'p2p_' + Date.now(),
                chat: { id: chatId, kind: 'direct' },
                text,
                isCommand: text.startsWith('/'),
                command: text.startsWith('/') ? text.slice(1).split(' ')[0] : undefined,
                mentionsBot: false,
                from: 'other',
                timestamp: Date.now(),
                language,
              },
            });
            return;
          }

          // Regular chat message for a human contact: broadcast to chat UI.
          window.dispatchEvent(new CustomEvent('nova:p2p:message', {
            detail: { chatId, fromFingerprint, text },
          }));
        },
      });
      await manager.initialize();
      setP2PManager(manager);
    };
    void start();
    return () => {
      manager?.close();
      transportManager?.disconnect();
      unsubscribeCallInvite();
      signaling?.close();
      setCallSignaling(null);
      relay?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, setP2PManager]);

  // Auto-flush the offline message queue when connectivity returns or on a
  // periodic tick, so messages sent while offline are delivered without the
  // user having to open Settings → Join Outbox → Retry.
  useEffect(() => {
    const flush = async () => {
      const relay = relayRef.current;
      if (!relay) return;
      try {
        await flushOfflineQueueViaRelay(relay);
      } catch {
        /* relay flush failures are retried on the next tick */
      }
    };

    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);

    const interval = window.setInterval(flush, 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
    };
  }, []);
  const {
    stories,
    channels,
    posts,
    now,
    createStory,
    deleteStory,
    viewStory,
    toggleStoryReaction,
    createChannel,
    deleteChannel,
    setChannelSound,
    createChannelPost,
    voteChannelPoll,
    deleteChannelPost,
    editChannelPost,
    addChannelComment,
    togglePostReaction,
    pinChannelPost,
    unpinChannelPost,
    addChannelAdmin,
    removeChannelAdmin,
    toggleChannelAdmin,
    setChannelDiscussionGroup,
    toggleChannelPopular,
    toggleChannelSubscriberPrivacy,
  } = useSocialData();
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('chats');
  // Navigation history: each entry is the screen state we came from, so the
  // back button restores the previous view instead of jumping to a fixed menu.
  const [, setNavHistory] = useState<
    Array<{ screen: ScreenId; chatId: string; profileId: string; channelId: string }>
  >([]);
  const [activeChatId, setActiveChatId] = useState<string>('katie');
  const [callSignaling, setCallSignaling] = useState<P2PSignalingClient | null>(null);
  const [pendingIncomingCall, setPendingIncomingCall] = useState<{
    chatId: string;
    callId: string;
    mode: 'voice' | 'video';
    from: string;
  } | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string>('katie');
  const [activeChannelId, setActiveChannelId] = useState<string>(KYIV_CHANNEL_ID);
  // Mobile has a single pane, so the Channels tab needs its own level: the
  // channel list is shown first, and a channel feed only after one is picked.
  const [mobileChannelListOpen, setMobileChannelListOpen] = useState(true);
  // Set when a link points at one post's comments; cleared once the channel
  // screen has opened the sheet.
  const [pendingCommentsPostId, setPendingCommentsPostId] = useState<string | null>(null);
  // Bottom navigation active tab for mobile
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('chats');
  // One-handed FAB side, persisted across reloads.


  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(() => isOnboardingComplete());
  const [pendingInvite, setPendingInvite] = useState<{ chatId: string; groupName: string } | null>(
    null,
  );
  const [pendingContactInvite, setPendingContactInvite] = useState<string | null>(null);
  const [pendingSiteHandoff, setPendingSiteHandoff] = useState<SiteHandoff | null>(null);
  const [pendingBotStart, setPendingBotStart] = useState<{ chatId: string; payload: string } | null>(null);
  const [pendingBotInstall, setPendingBotInstall] = useState<{ id: string; startPayload?: string } | null>(null);
  const [activeThreadRootId, setActiveThreadRootId] = useState<string | null>(null);

  useEffect(() => {
    if (!botsEnabled) return;
    void getBotSession().ensureReady();
  }, [botsEnabled, getBotSession]);

  // Switch bot registry to the encrypted vault once it is ready (SecurityContext
  // initializes dbInstance with the user's master key). Until then the registry
  // lives in memory and is lost on reload — acceptable for dev fixtures; real
  // bots installed via Phase B3 UI will persist once the vault is up.
  useEffect(() => {
    if (!botsEnabled) return;
    let cancelled = false;
    const waitForVault = async () => {
      while (!dbInstance.isReady() && !cancelled) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (cancelled) return;
      await getBotSession().ensureReady();
      getBotSession().switchStorage(new EncryptedBotStorage(dbInstance));
    };
    void waitForVault();
    return () => { cancelled = true; };
  }, [botsEnabled, getBotSession]);
  const handleBotCallback = useCallback(
    (botId: string, chatId: string, messageId: string, callbackData: string) => {
      if (!botsEnabled) return false;
      return getBotSession().dispatchCallback(botId, chatId, messageId, callbackData);
    },
    [botsEnabled, getBotSession],
  );
  const pendingInviteRef = useFocusTrap<HTMLDivElement>(
    Boolean(pendingInvite),
    () => setPendingInvite(null),
  );

  const foldersRef = useRef<{ openFolderModal: () => void } | null>(null);
  const handledDeepLinkRef = useRef<string | null>(null);

  const [joinNotice, setJoinNotice] = useState<JoinRequestNoticeData | null>(null);
  // The relay effect outlives screen switches, so it reads the current view
  // from a ref instead of restarting on every navigation.
  const viewRef = useRef({ screen: currentScreen, chatId: activeChatId });
  useEffect(() => {
    viewRef.current = { screen: currentScreen, chatId: activeChatId };
  }, [currentScreen, activeChatId]);

  useEffect(() => {
    if (!joinNotice) return;
    const timer = window.setTimeout(() => setJoinNotice(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [joinNotice]);

  // A new GPS fix changes where the local node belongs, so recompute the
  // snapshot when one lands (the map writes it, we only listen).
  const [meshTick, setMeshTick] = useState(0);
  useEffect(() => {
    const onFix = () => setMeshTick((tick) => tick + 1);
    window.addEventListener(GPS_FIX_EVENT, onFix);
    return () => window.removeEventListener(GPS_FIX_EVENT, onFix);
  }, []);
  useEffect(() => {
    if (currentScreen !== 'mesh-map') clearLastGpsFix();
  }, [currentScreen]);

  // Relay presence (strictly opt-in): announce ourselves and refresh the list
  // of online peers so the mesh map reflects who is actually reachable right
  // now. With presence sharing off, nothing is sent and nothing is fetched.
  const [presencePeers, setPresencePeers] = useState<string[]>([]);
  const presencePrefs = loadPrivacyPrefs();
  const knownFingerprints = useMemo(() => {
    const known = new Set<string>();
    for (const chat of MOCK_CHATS) {
      if (chat.id && chat.id !== 'me') known.add(chat.id);
    }
    return [...known];
  }, []);
  useEffect(() => {
    const fingerprint = identity?.fingerprint;
    if (!fingerprint || !presencePrefs.presenceSharing) return;
    const beat = () => heartbeatPresence(fingerprint).catch(() => void 0);
    beat();
    const interval = window.setInterval(beat, 60_000);
    return () => {
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.fingerprint, presencePrefs.presenceSharing, presencePrefs.presenceHashing, presencePrefs.presenceTtl]);
  useEffect(() => {
    if (currentScreen !== 'mesh-map' || !presencePrefs.presenceSharing) {
      setPresencePeers([]);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const ids = await fetchPresence();
      const peers = await resolvePresenceIds(ids, knownFingerprints, presencePrefs.presenceHashing);
      if (!cancelled) setPresencePeers(peers);
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen, presencePrefs.presenceSharing, presencePrefs.presenceHashing, knownFingerprints]);

  // Real mesh map points: computed whenever the mesh-map screen mounts.
  // useMemo keyed on the screen keeps the GPS fix read out of other renders.
  const liveMesh = useMemo(
    () =>
      currentScreen === 'mesh-map'
        ? buildLiveMeshSnapshot({
            localFingerprint: identity?.fingerprint,
            onlinePeers: presencePeers,
          })
        : { nodes: [], links: [] },
    [currentScreen, identity?.fingerprint, meshTick, presencePeers],
  );


  // Join requests and admin decisions travel through a session-wide mesh relay,
  // so a request survives closing the group (or the app) before an admin sees it.
  useEffect(() => {
    const fingerprint = identity?.fingerprint;
    if (!fingerprint) return;
    const relay = new JoinRequestRelay({
      localFingerprint: fingerprint,
      // Only admins of a group record incoming requests for it.
      isAdminOf: (groupId) => isGroupAdmin(loadGroupRoles(groupId), fingerprint),
      onApplied: (applied) => {
        if (applied.kind !== 'request') return;
        const view = viewRef.current;
        // Inside that very group the chat itself already shows the request.
        if (view.screen === 'chat' && view.chatId === applied.groupId) return;
        playSound('notification');
        setJoinNotice({
          groupId: applied.groupId,
          groupName:
            MOCK_CHATS.find((chat) => chat.id === applied.groupId)?.name ?? applied.groupId,
          who: applied.name || applied.fingerprint,
        });
      },
    });
    relay.start();

    // Wake up when the earliest queued job is due (its backoff expiry), not on
    // a fixed tick; an idle outbox is only polled occasionally for new work.
    let timer: number | undefined;
    let stopped = false;
    const schedule = () => {
      if (stopped) return;
      const delay = nextJoinOutboxDelay();
      const wait = delay === null ? 15_000 : Math.min(Math.max(delay, 1_000), JOIN_RETRY_MAX_MS);
      timer = window.setTimeout(() => {
        relay.flush();
        schedule();
      }, wait);
    };
    schedule();

    const flush = () => relay.flush();
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
      relay.stop();
    };
  }, [identity?.fingerprint]);

  useEffect(() => {
    applyAppTheme(readAppTheme());
    applyFontSize(readFontSize());
    try {
      const saved = localStorage.getItem('nova_accent_color') || ACCENT_COLORS.default;
      applyAccentColor(saved);
    } catch {
      applyAccentColor(ACCENT_COLORS.default);
    }
    applyContactOverrides();
  }, []);

  // Follow a switch to another local account. The active profile (history,
  // drafts, encryption journal, folders) is read from localStorage on read, so
  // dropping the in-memory caches leaves no room for one account's state to
  // leak into another's; a reload then rebuilds everything from the new id.
  useEffect(() => {
    const onAccountChanged = () => {
      // A full reload is the only way to guarantee no in-memory state (P2P
      // manager, bot session, caches) survives into the other account.
      window.location.reload();
    };
    window.addEventListener(ACTIVE_ACCOUNT_CHANGED_EVENT, onAccountChanged);
    return () => window.removeEventListener(ACTIVE_ACCOUNT_CHANGED_EVENT, onAccountChanged);
  }, []);

  const openProfile = (profileId: string) => {
    navigate('profile', { profileId });
  };

  const openAnalytics = () => {
    setIsSettingsOpen(false);
    navigate('analytics');
  };

  const openSites = () => {
    setIsSettingsOpen(false);
    navigate('sites');
  };

  const openChannel = (channelId?: string) => {
    if (typeof channelId === 'string' && channelId) {
      setActiveChannelId(channelId);
      setMobileChannelListOpen(false);
    } else {
      // The Channels tab opens the list; picking a channel opens its feed.
      setMobileChannelListOpen(true);
    }
    setPendingCommentsPostId(null);
    navigate('channel');
  };

  // Central navigation: push the current view onto the history stack, then
  // switch to the requested screen (updating the relevant active ids).
  const navigate = useCallback(
    (screen: ScreenId, opts?: { chatId?: string; profileId?: string; channelId?: string }) => {
      setNavHistory((h) => [
        ...h,
        { screen: currentScreen, chatId: activeChatId, profileId: activeProfileId, channelId: activeChannelId },
      ]);
      if (opts?.chatId) setActiveChatId(opts.chatId);
      if (opts?.profileId) setActiveProfileId(opts.profileId);
      if (opts?.channelId) setActiveChannelId(opts.channelId);
      setCurrentScreen(screen);

      // Update bottom nav tab for mobile when navigating to main tabs
      if (screen === 'chats' || screen === 'chat') setActiveBottomTab('chats');
      else if (screen === 'channel') setActiveBottomTab('channels');
      else if (screen === 'anonymous') setActiveBottomTab('contacts');
      else if (screen === 'profile') setActiveBottomTab('profile');
      else if (screen === 'premium') setActiveBottomTab('premium');
      else if (screen === 'sites' || screen === 'analytics' || screen === 'mesh-map') {
        // These open as modals/full screens, keep current tab
      }
    },
    [currentScreen, activeChatId, activeProfileId, activeChannelId],
  );

  const goBack = useCallback(() => {
    setNavHistory((h) => {
      if (h.length === 0) {
        // No previous view recorded (e.g. top-level tab or deep link):
        // fall back to the chats list instead of doing nothing.
        setCurrentScreen('chats');
        return h;
      }
      const prev = h[h.length - 1];
      setActiveChatId(prev.chatId);
      setActiveProfileId(prev.profileId);
      setActiveChannelId(prev.channelId);
      setCurrentScreen(prev.screen);
      return h.slice(0, -1);
    });
  }, []);

  // Deep links are handled locally; contact invites carry one-time payloads
  // in the fragment, never in the request path or query.
  const handleTarget = useCallback(
    (target: DeepLinkTarget, link: string) => {
      if (!target || target.type === 'device-link') return;

      if (target.type === 'site-handoff') {
        setPendingSiteHandoff({ token: target.token, key: target.key });
        navigate('sites');
        return;
      }

      if (target.type === 'contact-invite') {
        setPendingContactInvite(target.code);
        navigate('anonymous');
        return;
      }

      if (target.type === 'chat') {
        // An invite link asks first: joining a group is never silent.
        if (/(?:\?|&)invite=([a-f0-9]+)/i.test(link)) {
          const groupName =
            MOCK_CHATS.find((chat) => chat.id === target.id)?.name ?? target.id;
          setPendingInvite({ chatId: target.id, groupName });
          return;
        }
        navigate('chat', { chatId: target.id });
        return;
      }
      if (target.type === 'profile') {
        navigate('profile', { profileId: target.id });
        return;
      }
      if (target.type === 'bot') {
        if (!botsEnabled) return;
        // Check if bot is installed
        const session = getBotSession();
        const bot = session.listBots().find((b) => b.manifest.id === target.id);
        
        if (bot) {
          // Bot is installed - open chat and send /start if payload provided
          setPendingBotStart(target.startPayload ? { chatId: target.id, payload: target.startPayload } : null);
          navigate('chat', { chatId: target.id });
        } else {
          // Bot not installed - open Settings → Bots with install prompt
          setPendingBotInstall({ id: target.id, startPayload: target.startPayload });
          setIsSettingsOpen(true);
        }
        return;
      }
      if (
        target.type === 'channel' &&
        channels.some((channel) => channel.id === target.id)
      ) {
        setActiveChannelId(target.id);
        setMobileChannelListOpen(false);
        setPendingCommentsPostId(
          target.postId && target.comments ? target.postId : null,
        );
        navigate('channel', { channelId: target.id });
      }
    },
    [botsEnabled, channels, getBotSession, navigate],
  );

  // Deep links (`#nova://chat/<id>`, `#nova://channel/<id>`, universal links)
  // stay offline: they carry an id, not an account lookup.
  useEffect(() => {
    const applyDeepLink = () => {
      const hash = window.location.hash;
      const locationKey = window.location.pathname + hash;
      // `/c/<token>#<key>` handoff links carry the key in the fragment only.
      const pathMatch = /^\/c\/([A-Za-z0-9_-]{16,256})/.exec(window.location.pathname);
      const target =
        parseDeepLinkFromHash(hash) ??
        (pathMatch
          ? parseDeepLink(`nova://site-handoff/${pathMatch[1]}#${hash.replace(/^#/, '')}`)
          : null);
      if (!target || locationKey === handledDeepLinkRef.current) return;
      handledDeepLinkRef.current = locationKey;
      handleTarget(target, locationKey);
    };

    applyDeepLink();
    window.addEventListener('hashchange', applyDeepLink);
    return () => window.removeEventListener('hashchange', applyDeepLink);
  }, [handleTarget]);

  // The Tauri shells hand links to the webview instead of using a hash.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let lastLink: string | null = null;
    void subscribeTauriDeepLinks((target, link) => {
      if (link === lastLink) return;
      lastLink = link;
      handleTarget(target, link);
    }).then((fn) => {
      if (cancelled) fn();
      else unsubscribe = fn;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [handleTarget]);

  const handleDeleteChannel = (channelId: string) => {
    deleteChannel(channelId);
    if (channelId === activeChannelId) {
      setActiveChannelId(KYIV_CHANNEL_ID);
    }
  };

  const handleDeleteChannels = (channelIds: string[]) => {
    channelIds.forEach((channelId) => deleteChannel(channelId));
    if (channelIds.includes(activeChannelId)) {
      setActiveChannelId(KYIV_CHANNEL_ID);
    }
  };

  const handleCreateChannel = (draft: Parameters<typeof createChannel>[0]) => {
    const channel = createChannel(draft);
    setActiveChannelId(channel.id);
    return channel;
  };

  const handleToggleChannelPopular = (channelId: string) => {
    toggleChannelPopular(channelId);
  };

  const channelScreenProps = {
    channelId: activeChannelId,
    channels,
    posts,
    now,
    onCreateChannel: handleCreateChannel,
    onSelectChannel: setActiveChannelId,
    onDeleteChannel: handleDeleteChannel,
    onDeleteChannels: handleDeleteChannels,
    onCreatePost: createChannelPost,
    onVotePoll: voteChannelPoll,
    onDeletePost: deleteChannelPost,
    onEditPost: editChannelPost,
    onAddComment: addChannelComment,
    onToggleReaction: togglePostReaction,
    onPinPost: pinChannelPost,
    onUnpinPost: unpinChannelPost,
    onManageAdmins: () => {}, // Just opens the panel
    onAddAdmin: (adminId: string, isOwner = false) => addChannelAdmin(activeChannelId, adminId, isOwner),
    onRemoveAdmin: (adminId: string) => removeChannelAdmin(activeChannelId, adminId),
    onToggleAdmin: (memberId: string, makeAdmin: boolean) => toggleChannelAdmin(activeChannelId, memberId, makeAdmin),
    onSetDiscussionGroup: (discussionGroupId: string | undefined) => setChannelDiscussionGroup(activeChannelId, discussionGroupId),
    onToggleSound: setChannelSound,
    onToggleSubscriberPrivacy: toggleChannelSubscriberPrivacy,
    initialCommentsPostId: pendingCommentsPostId,
    onInitialCommentsHandled: () => setPendingCommentsPostId(null),
  };

  // Desktop Main Panel renderer
  const renderDesktopMainScreen = () => {
    switch (currentScreen) {
      case 'channel':
        return (
          <ChannelScreen
            key={`${activeChannelId}:${pendingCommentsPostId ?? ''}`}
            {...channelScreenProps}
            onBack={goBack}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            profileId={activeProfileId}
            onBack={goBack}
            onOpenChat={() => navigate('chat')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        );
      case 'analytics':
        return <AnalyticsScreen onBack={goBack} />;
      case 'sites':
        return <SitesScreen onBack={goBack} />;
      case 'mesh-map':
        return (
          <div className="w-full h-full p-4 flex-col gap-2">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--nova-border-color)] shrink-0">
              <NovaIconButton
                label={t('common.back')}
                icon={<ArrowLeft />}
                size={32}
                variant="subtle"
                onClick={goBack}
              />
              <MapPin className="w-5 h-5 shrink-0 text-[var(--nova-accent-color)]" />
            </div>
            <MeshMapScreen
              nodes={liveMesh.nodes}
              links={liveMesh.links}
            />
          </div>
        );
      case 'anonymous':
        return (
          <AnonymousMessengerScreen
            onBack={goBack}
            initialInvite={pendingContactInvite}
            onInviteConsumed={() => setPendingContactInvite(null)}
          />
        );
      case 'chat':
      case 'chats':
      default: {
        const botId = botsEnabled && getBotSession().isBot(activeChatId) ? activeChatId : undefined;
        const botCommands = botId
          ? getBotSession().listBots().find((b) => b.manifest.id === botId)?.manifest.commands ?? []
          : [];
        return (
          <ChatScreen
            chatId={activeChatId}
            onBack={goBack}
            onOpenProfile={() => openProfile(activeChatId)}
            botId={botId}
            botCommands={botCommands}
            getBotSession={botsEnabled ? getBotSession : undefined}
            pendingBotStart={pendingBotStart}
            onBotStartSent={() => setPendingBotStart(null)}
            onBotCallback={handleBotCallback}
            sharedCallSignaling={callSignaling}
            pendingIncomingCall={pendingIncomingCall}
            onPendingIncomingCallConsumed={() => setPendingIncomingCall(null)}
            threadRootId={activeThreadRootId}
            onThreadRootChange={setActiveThreadRootId}
            onScrollToThreadMessage={(msgId) => {
              window.dispatchEvent(new CustomEvent('nova:scrollToThreadMessage', { detail: { msgId } }));
            }}
          />
        );
      }
    }
  };

  // Mobile Single-Pane Screen renderer
  const renderMobileScreen = () => {
    // On mobile, use activeBottomTab for primary navigation; the bottom tabs map
    // onto the screens, so a tab always renders its own screen type.
    // Through the shared helper the type stays ScreenId: assigning the
    // conditionals inline would narrow it to the five tab values and make the
    // deep-link cases below unreachable for the type checker.
    const mobileScreen = screenForBottomTab(activeBottomTab);

    switch (mobileScreen) {
      case 'channel':
        if (mobileChannelListOpen || !activeChannelId) {
          return (
            <ChannelListPanel
              key="channel-list"
              channels={channels}
              activeChannelId={activeChannelId}
              onSelectChannel={openChannel}
              onCreateChannel={handleCreateChannel}
              onTogglePopular={handleToggleChannelPopular}
              onDeleteChannels={handleDeleteChannels}
              onBack={goBack}
            />
          );
        }
        return (
          <ChannelScreen
            key={`${activeChannelId}:${pendingCommentsPostId ?? ''}`}
            {...channelScreenProps}
            onBack={() => {
              setMobileChannelListOpen(true);
              goBack();
            }}
          />
        );
      case 'chats':
        return (
          <ChatsScreen
            onSelectChat={(id) => {
              navigate('chat', { chatId: id });
            }}
            onOpenChannel={openChannel}
            onOpenAnonymous={() => navigate('anonymous')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenPremium={() => setIsPremiumOpen(true)}
            activeChatId={activeChatId}

            stories={stories}
            channels={channels}
            localFingerprint={identity?.fingerprint}
            getBotSession={botsEnabled ? getBotSession : undefined}
            now={now}
            onCreateStory={createStory}
            onDeleteStory={deleteStory}
            onViewStory={viewStory}
            onToggleStoryReaction={toggleStoryReaction}
          />
        );
      case 'contacts':
        return (
          <AnonymousMessengerScreen
            onBack={goBack}
            initialInvite={pendingContactInvite}
            onInviteConsumed={() => setPendingContactInvite(null)}
          />
        );
      case 'settings':
        return (
          <SettingsModal
            isOpen={true}
            onClose={() => setActiveBottomTab('chats')}
            onOpenAnalytics={openAnalytics}
            onOpenSites={openSites}
            getBotSession={botsEnabled ? getBotSession : undefined}
            pendingBotInstall={pendingBotInstall}
            onBotInstallHandled={() => setPendingBotInstall(null)}
            onOpenBotChat={(botId) => {
              setPendingBotStart({ chatId: botId, payload: '' });
              navigate('chat', { chatId: botId });
            }}
            onOpenMeshMap={() => navigate('mesh-map')}
          />
        );
      case 'premium':
        return (
          <CryptoCheckoutModal
            isOpen={true}
            onClose={() => setActiveBottomTab('chats')}
            onSuccess={() => setActiveBottomTab('chats')}
          />
        );
      case 'chat': {
        const botId = botsEnabled && getBotSession().isBot(activeChatId) ? activeChatId : undefined;
        const botCommands = botId
          ? getBotSession().listBots().find((b) => b.manifest.id === botId)?.manifest.commands ?? []
          : [];
        return (
          <ChatScreen
            chatId={activeChatId}
            onBack={goBack}
            onOpenProfile={() => openProfile(activeChatId)}
            botId={botId}
            botCommands={botCommands}
            getBotSession={botsEnabled ? getBotSession : undefined}
            pendingBotStart={pendingBotStart}
            onBotStartSent={() => setPendingBotStart(null)}
            onBotCallback={handleBotCallback}
            sharedCallSignaling={callSignaling}
            pendingIncomingCall={pendingIncomingCall}
            onPendingIncomingCallConsumed={() => setPendingIncomingCall(null)}
          />
        );
      }
      case 'profile':
        return (
          <ProfileScreen
            profileId={activeProfileId}
            onBack={goBack}
            onOpenChat={() => navigate('chat')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        );
      case 'analytics':
        return <AnalyticsScreen onBack={goBack} />;
      case 'sites':
        return <SitesScreen onBack={goBack} />;
      case 'mesh-map':
        return (
          <div className="flex h-full w-full flex-col bg-[var(--nova-canvas)]">
            <header className="flex items-center gap-2 px-3 py-2 border-b border-[var(--nova-border-color)] shrink-0">
              <NovaTooltip label={t('common.back')}>
                <NovaIconButton
                  label={t('common.back')}
                  icon={<ArrowLeft />}
                  size={44}
                  variant="subtle"
                  onClick={goBack}
                />
              </NovaTooltip>
              <MapPin className="w-5 h-5 shrink-0 text-[var(--nova-accent-color)]" />
            <h1 className="min-w-0 truncate text-[15px] font-bold text-[var(--text-primary)]">
                {t('meshMap.title')}
              </h1>
            </header>
            <div className="flex-1 min-h-0 p-3">
              <MeshMapScreen
                nodes={liveMesh.nodes}
                links={liveMesh.links}
              />
            </div>
          </div>
        );
      case 'anonymous':
        return (
          <AnonymousMessengerScreen
            onBack={goBack}
            initialInvite={pendingContactInvite}
            onInviteConsumed={() => setPendingContactInvite(null)}
          />
        );
      default:
        return null;
    }
  };   const isDesktopChatActive = currentScreen === 'chats' || currentScreen === 'chat' || currentScreen === 'anonymous';
   const isDesktopChannelActive = currentScreen === 'channel';
   const totalUnreadChats = MOCK_CHATS.reduce((acc, chat) => acc + (chat.unreadCount || 0), 0);
   const totalUnreadChannels = channels.reduce((acc, channel) => acc + (channel.unreadCount || 0), 0);

  // A fresh install has no setup record yet, so it goes through the wizard
  // instead of landing on a pre-filled "Hello, Joseph" profile.
  if (!onboardingDone) {
    if (isInitialized === false) return <ScreenFallback />;
    return (
      <Suspense fallback={<ScreenFallback />}>
        <OnboardingWizard onDone={() => setOnboardingDone(true)} />
      </Suspense>
    );
  }

  return (
    <>
      {isLocked && pinHash ? (
        <PinLockScreen onUnlock={unlock} />
      ) : (
        <SanctionGate>
        <div className="h-screen h-[100dvh] w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col lg:flex-row font-sans selection:bg-[var(--nova-accent-color)]/30 select-none safe-area-screen">
      {/* ======================================================== */}
      {/* 1. DESKTOP LAYOUT (>= 768px md: breakpoint)               */}
      {/* ======================================================== */}

      {/* Left Navigation Rail (Desktop Only) */}
      <aside className="hidden lg:flex w-[72px] shrink-0 bg-[var(--bg-surface)] border-r border-[var(--border)] flex-col items-center justify-between py-4 z-30 select-none shadow-xl">
        {/* Primary Navigation Icons */}
        <nav className="flex flex-col items-center gap-2.5 w-full px-2">
          {/* Chats tab */}
          <NovaTooltip label={t('common.chats')}>
          <button
            onClick={() => {
              setActiveChatId('katie');
              setCurrentScreen('chat');
            }}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
                isDesktopChatActive
                  ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-lg shadow-[var(--nova-accent-color)]/30'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]'
              }`}
            title={t('common.chats')}
          >
            <MessageSquare className="w-5 h-5" />
            {isDesktopChatActive && <span className="absolute inset-0 rounded-2xl bg-[var(--nova-accent-color)]/10" aria-hidden="true" />}
            {totalUnreadChats > 0 && (
              <NovaBadge value={totalUnreadChats} max={99} variant="danger" className="absolute -top-0.5 -right-0.5" />
            )}
            {/* Active Pill Indicator on left edge */}
            {isDesktopChatActive && (
              <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-[var(--nova-accent-color)]" />
            )}
          </button>
          </NovaTooltip>

          {/* Kyiv Channel tab */}
          <NovaTooltip label={t('common.channels')}>
          <button
            onClick={() => openChannel()}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
              isDesktopChannelActive
                ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-lg shadow-[var(--nova-accent-color)]/30'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]'
            }`}
            title={t('common.channels')}
          >
            <Radio className={`w-5 h-5 ${isDesktopChannelActive ? 'fill-[var(--nova-accent-color)]' : ''}`} />
            {totalUnreadChannels > 0 && (
              <NovaBadge value={totalUnreadChannels} max={99} variant="danger" className="absolute -top-0.5 -right-0.5" />
            )}
            {isDesktopChannelActive && (
              <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-[var(--nova-accent-color)]" />
            )}
          </button>
          </NovaTooltip>

          {/* Folders tab */}
          <button
            onClick={() => foldersRef.current?.openFolderModal()}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]`}
            title={t('folders')}
          >
            <Folder className="w-5 h-5" />
          </button>
      </nav>
        <div className="flex flex-col items-center gap-2">
          {/* Settings Trigger (language switch moved into Settings) */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-11 h-11 rounded-2xl text-[var(--text-secondary)] hover:text-[var(--nova-accent-color)] hover:bg-[var(--bg-surface-2)] flex items-center justify-center transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)]"
            title={t('settings.title')}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* User Avatar with Status indicator */}
          <button
            onClick={() => openProfile(account.id)}
            className="w-10 h-10 rounded-full border border-[var(--border-strong)] overflow-hidden relative cursor-pointer active:scale-95 transition hover:ring-2 hover:ring-[var(--nova-accent-color)]/60 group"
            title={`${account.displayName} (Online)`}
          >
            {account.avatar && !avatarLoadFailed && (
              <LazyMedia
                src={account.avatar}
                alt={account.displayName}
                eager
                className="w-full h-full object-cover"
                onError={() => {
                  setAvatarLoadFailed(true);
                }}
              />
            )}
            {(!account.avatar || avatarLoadFailed) && (
              <div className="w-full h-full bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] font-bold text-xs flex items-center justify-center">
                {account.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            {premium && (
              <span
                data-testid="premium-crown"
                aria-label={t('premium.active')}
                title={t('premium.active')}
                className="absolute top-1 right-1 text-amber-300 drop-shadow"
              >
                <Crown className="w-3 h-3" />
              </span>
            )}
            {/* Online Green Beacon */}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--online)] ring-2 ring-[var(--bg-surface)]" />
          </button>
        </div>
      </aside>

      {/* Left Column (Desktop Only) */}
      <section className="hidden lg:flex w-[380px] xl:w-[410px] shrink-0 border-r border-[var(--nova-border-color)] bg-[var(--nova-canvas)] h-full flex-col overflow-hidden relative">
        {/* ChatsScreen stays mounted so the Folders button in the rail always
            has a live ref (it used to go dead on the Channels screen). */}
        <ChatsScreen
          ref={foldersRef}
          onSelectChat={(id) => {
            navigate('chat', { chatId: id });
          }}
          onOpenChannel={openChannel}
          onOpenAnonymous={() => navigate('anonymous')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenPremium={() => setIsPremiumOpen(true)}
          activeChatId={activeChatId}

          stories={stories}
          channels={channels}
          localFingerprint={identity?.fingerprint}
          getBotSession={botsEnabled ? getBotSession : undefined}
          now={now}
          onCreateStory={createStory}
          onDeleteStory={deleteStory}
          onViewStory={viewStory}
          onToggleStoryReaction={toggleStoryReaction}
        />
        {isDesktopChannelActive && (
          <div className="absolute inset-0 z-20 flex flex-col bg-[#0c0d11]">
            <ChannelListPanel
              channels={channels}
              activeChannelId={activeChannelId}
              onSelectChannel={openChannel}
              onCreateChannel={handleCreateChannel}
              onTogglePopular={handleToggleChannelPopular}
              onDeleteChannels={handleDeleteChannels}
            />
          </div>
        )}
      </section>

      {/* Right Main Content Stage (Desktop Only) */}
      <main className="hidden lg:flex flex-1 min-w-0 h-full overflow-hidden bg-[#090a0e] flex-col relative">
        <Suspense fallback={<ScreenFallback />}>{renderDesktopMainScreen()}</Suspense>
      </main>

      {/* Thread Sidebar (Desktop Only) - appears when thread is open in chat */}
      {(currentScreen === 'chat' || currentScreen === 'chats') && activeThreadRootId && (
        <ThreadSidebar
          threadRootId={activeThreadRootId}
          chatId={activeChatId}
          onClose={() => setActiveThreadRootId(null)}
          onScrollToMessage={(msgId) => {
            window.dispatchEvent(new CustomEvent('nova:scrollToThreadMessage', { detail: { msgId } }));
          }}
          profile={CONTACT_PROFILES[activeChatId]}
          isOwnProfile={activeChatId === account.id}
          accountDisplayName={account.displayName}
          accountAvatar={account.avatar}
        />
      )}

      {/* ======================================================== */}
      {/* 2. MOBILE VIEW (< 768px md: breakpoint)                   */}
      {/* ======================================================== */}
        <div className="flex-1 w-full h-full lg:hidden overflow-hidden flex flex-col relative bg-[var(--bg-app)]">
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<ScreenFallback />}>{renderMobileScreen()}</Suspense>
          </div>
          <BottomNav
            activeTab={activeBottomTab}
            onTabChange={setActiveBottomTab}
            onNewChat={() => void 0}
            unreadChats={totalUnreadChats}
            unreadChannels={totalUnreadChannels}
            unreadContacts={0}
            premium={premium}
          />
        </div>



      <JoinRequestNotice
        notice={joinNotice}
        onDismiss={() => setJoinNotice(null)}
        onOpen={(groupId) => {
          navigate('chat', { chatId: groupId });
          setJoinNotice(null);
        }}
      />

      {pendingInvite && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPendingInvite(null)}
        >
          <div
            ref={pendingInviteRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('chat.joinTitle')}
            data-testid="join-group-dialog"
            className="w-full max-w-sm bg-[var(--nova-surface)] border border-[var(--nova-border-color)] rounded-3xl shadow-2xl shadow-black/80 p-5 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--nova-accent-color,#ff4e18)]/15 border border-[var(--nova-accent-color,#ff4e18)]/40 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)]">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-[var(--nova-text-primary)] truncate">
                  {pendingInvite.groupName}
                </h3>
                <p className="text-[11px] text-[var(--nova-text-muted)]">{t('chat.joinTitle')}</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-[var(--nova-text-secondary)]">
              {t('chat.joinPrompt', { group: pendingInvite.groupName })}
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPendingInvite(null)}
                className="px-3 py-2 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-xs font-semibold text-[var(--nova-text-secondary)] transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)]"
              >
                {t('chat.joinDecline')}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Joining is a request, not membership: an admin has to approve it.
                  markJoinPending(pendingInvite.chatId);
                  navigate('chat', { chatId: pendingInvite.chatId });
                  setPendingInvite(null);
                }}
                className="px-3 py-2 rounded-xl bg-[var(--nova-accent-color,#ff4e18)] hover:bg-[var(--nova-accent-color,#ff5d2b)] text-xs font-semibold text-white transition cursor-pointer active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)] active:bg-[var(--nova-overlay-strong)]"
              >
                {t('chat.joinAccept')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App Settings Modal (language switch lives here) */}
      <PanelErrorBoundary name="settings">
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onOpenAnalytics={openAnalytics}
            onOpenSites={openSites}
            getBotSession={botsEnabled ? getBotSession : undefined}
            pendingBotInstall={pendingBotInstall}
            onBotInstallHandled={() => setPendingBotInstall(null)}
            onOpenBotChat={(botId) => {
              setPendingBotStart({ chatId: botId, payload: '' });
              navigate('chat', { chatId: botId });
            }}
            onOpenMeshMap={() => navigate('mesh-map')}
          />
        </Suspense>
      </PanelErrorBoundary>

      {/* Premium checkout, reachable from the chats header and from Settings */}
      {isPremiumOpen && (
        <Suspense fallback={null}>
          <CryptoCheckoutModal
            isOpen={isPremiumOpen}
            onClose={() => setIsPremiumOpen(false)}
            onSuccess={() => setIsPremiumOpen(false)}
          />
        </Suspense>
      )}
        </div>
        </SanctionGate>
      )}
    </>
  );
}
