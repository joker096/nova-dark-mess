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
import { JoinRequestNotice, type JoinRequestNoticeData } from './components/JoinRequestNotice';
import { PinLockScreen } from './components/PinLockScreen';
import { SanctionGate } from './components/SanctionGate';
import { EncryptedBotStorage } from './lib/bots/runtime';
import { dbInstance } from './lib/storage/db';
import { botSession } from './lib/bots/session';

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
  <div className="flex h-full w-full items-center justify-center bg-[#090a0e]">
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-[var(--nova-accent-color)]" />
  </div>
);
import { useLanguage } from './context/LanguageContext';
import { useAccount } from './hooks/useAccount';
import { useSecurity } from './hooks/useSecurity';
import { P2PManager } from './lib/p2p/p2pManager';
import { P2PSignalingClient } from './lib/p2p/signaling';
import { MeshRelay } from './lib/p2p/relay';
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
import { parseDeepLinkFromHash, type DeepLinkTarget } from './lib/network/deepLinks';
import { subscribeTauriDeepLinks } from './lib/network/tauriDeepLinks';
import { playSound } from './lib/notifications/sounds';
import { buildLiveMeshSnapshot, clearLastGpsFix, GPS_FIX_EVENT } from './lib/p2p/meshMapNodes';
import { heartbeatPresence, fetchPresence, resolvePresenceIds } from './lib/p2p/presence';
import { loadPrivacyPrefs } from './lib/network/privacyMode';
import { markJoinPending } from './lib/social/groupJoinRequests';
import { applyContactOverrides } from './lib/contacts/contactOverrides';
import { isGroupAdmin, loadGroupRoles } from './lib/social/groupRoles';
import {
  JOIN_RETRY_MAX_MS,
  JoinRequestRelay,
  nextJoinOutboxDelay,
} from './lib/social/joinRequestRelay';
import { MOCK_CHATS } from './data/mockMessengerData';
import { isOnboardingComplete } from './lib/onboarding';
import { useFocusTrap } from './lib/ui/useFocusTrap';
const OnboardingWizard = lazy(() =>
  import('./components/OnboardingWizard').then((m) => ({ default: m.OnboardingWizard })),
);

type ScreenId = 'chats' | 'chat-katie' | 'channel-kyiv' | 'profile-katie' | 'analytics' | 'mesh-map' | 'anonymous' | 'sites';

export default function App() {
  const { t } = useLanguage();
  const { account } = useAccount();
  const { isLocked, pinHash, unlock, identity, isInitialized, setP2PManager, peerFingerprintsByChat } = useSecurity();
  const premium = isPremium();

  // Bots track (docs/bots-roadmap.md §B2): one session per app lifetime.
  const botSessionRef = useRef<typeof botSession | null>(null);
  const getBotSession = useCallback(() => {
    if (!botSessionRef.current) botSessionRef.current = botSession;
    return botSessionRef.current;
  }, []);
  // Keep the latest fingerprint→chatId map so P2PManager.onMessage can route
  // incoming messages to the right bot without recreating the transport.
  const peerFingerprintsRef = useRef(peerFingerprintsByChat);
  useEffect(() => {
    peerFingerprintsRef.current = peerFingerprintsByChat;
  }, [peerFingerprintsByChat]);

  // Wire the real P2P transport once the local identity is available. The
  // signaling client uses the in-page BroadcastChannel bus so two manager
  // instances in the same browser (or two tabs) can complete a prekey exchange
  // and send encrypted messages over the mesh relay without a central server.
  // In production pass signalingUrl to reach remote peers over WebSocket.
  useEffect(() => {
    if (!identity || !setP2PManager) return;
    let manager: P2PManager | null = null;
    let signaling: P2PSignalingClient | null = null;
    let relay: MeshRelay | null = null;
    const start = async () => {
      signaling = new P2PSignalingClient();
      relay = new MeshRelay(identity.fingerprint);
      manager = new P2PManager({ 
        identity, 
        signaling, 
        relay,
        // B4 (L2 gateway transport): route incoming P2P/relay messages to bots
        // so they receive updates even when the chat screen is not mounted.
        onMessage: (fromFingerprint, text) => {
          const chatId = Object.entries(peerFingerprintsRef.current)
            .find(([, fp]) => fp === fromFingerprint)?.[0];
          if (!chatId) return;
          const session = getBotSession();
          if (!session.isBot(chatId)) return;
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
            },
          });
        },
      });
      await manager.initialize();
      setP2PManager(manager);
    };
    void start();
    return () => {
      manager?.close();
      signaling?.close();
      relay?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, setP2PManager]);
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
  const [activeProfileId, setActiveProfileId] = useState<string>('katie');
  const [activeChannelId, setActiveChannelId] = useState<string>(KYIV_CHANNEL_ID);
  // Set when a link points at one post's comments; cleared once the channel
  // screen has opened the sheet.
  const [pendingCommentsPostId, setPendingCommentsPostId] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(() => isOnboardingComplete());
  const [pendingInvite, setPendingInvite] = useState<{ chatId: string; groupName: string } | null>(
    null,
  );
  const [pendingContactInvite, setPendingContactInvite] = useState<string | null>(null);
  const [pendingBotStart, setPendingBotStart] = useState<{ chatId: string; payload: string } | null>(null);

  useEffect(() => {
    void getBotSession().ensureReady();
  }, [getBotSession]);

  // Switch bot registry to the encrypted vault once it is ready (SecurityContext
  // initializes dbInstance with the user's master key). Until then the registry
  // lives in memory and is lost on reload — acceptable for dev fixtures; real
  // bots installed via Phase B3 UI will persist once the vault is up.
  useEffect(() => {
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
  }, [getBotSession]);
  const handleBotCallback = useCallback(
    (botId: string, chatId: string, messageId: string, callbackData: string) =>
      getBotSession().dispatchCallback(botId, chatId, messageId, callbackData),
    [getBotSession],
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
        if (view.screen === 'chat-katie' && view.chatId === applied.groupId) return;
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

  const openProfile = (profileId: string) => {
    navigate('profile-katie', { profileId });
  };

  const openAnalytics = () => {
    setIsSettingsOpen(false);
    navigate('analytics');
  };

  const openChannel = (channelId?: string) => {
    if (typeof channelId === 'string' && channelId) {
      setActiveChannelId(channelId);
    }
    setPendingCommentsPostId(null);
    navigate('channel-kyiv');
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
        navigate('chat-katie', { chatId: target.id });
        return;
      }
      if (target.type === 'profile') {
        navigate('profile-katie', { profileId: target.id });
        return;
      }
      if (target.type === 'bot') {
        // Open the bot's chat and, if the link carried a start payload, send
        // /start <payload> once the chat mounts (docs/bots-roadmap.md §B2).
        setPendingBotStart(target.startPayload ? { chatId: target.id, payload: target.startPayload } : null);
        navigate('chat-katie', { chatId: target.id });
        return;
      }
      if (
        target.type === 'channel' &&
        channels.some((channel) => channel.id === target.id)
      ) {
        setActiveChannelId(target.id);
        setPendingCommentsPostId(
          target.postId && target.comments ? target.postId : null,
        );
        navigate('channel-kyiv', { channelId: target.id });
      }
    },
    [channels, navigate],
  );

  // Deep links (`#nova://chat/<id>`, `#nova://channel/<id>`, universal links)
  // stay offline: they carry an id, not an account lookup.
  useEffect(() => {
    const applyDeepLink = () => {
      const hash = window.location.hash;
      if (!hash || hash === handledDeepLinkRef.current) return;
      handledDeepLinkRef.current = hash;
      const target = parseDeepLinkFromHash(hash);
      if (!target) return;
      handleTarget(target, hash);
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
    onToggleSound: setChannelSound,
    onToggleSubscriberPrivacy: toggleChannelSubscriberPrivacy,
    initialCommentsPostId: pendingCommentsPostId,
    onInitialCommentsHandled: () => setPendingCommentsPostId(null),
  };

  // Desktop Main Panel renderer
  const renderDesktopMainScreen = () => {
    switch (currentScreen) {
      case 'channel-kyiv':
        return (
          <ChannelScreen
            key={`${activeChannelId}:${pendingCommentsPostId ?? ''}`}
            {...channelScreenProps}
            onBack={goBack}
          />
        );
      case 'profile-katie':
        return (
          <ProfileScreen
            profileId={activeProfileId}
            onBack={goBack}
            onOpenChat={() => navigate('chat-katie')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        );
      case 'analytics':
        return <AnalyticsScreen onBack={goBack} />;
      case 'mesh-map':
        return (
          <div className="w-full h-full p-4">
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
      case 'sites':
        return <SitesScreen onBack={goBack} />;
      case 'chat-katie':
      case 'chats':
      default: {
        const botId = getBotSession().isBot(activeChatId) ? activeChatId : undefined;
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
            getBotSession={getBotSession}
            pendingBotStart={pendingBotStart}
            onBotStartSent={() => setPendingBotStart(null)}
            onBotCallback={handleBotCallback}
          />
        );
      }
    }
  };

  // Mobile Single-Pane Screen renderer
  const renderMobileScreen = () => {
    switch (currentScreen) {
      case 'chats':
        return (
          <ChatsScreen
            onSelectChat={(id) => {
              navigate('chat-katie', { chatId: id });
            }}
            onOpenChannel={openChannel}
            onOpenProfile={() => openProfile(account.id)}
            onOpenMeshMap={() => navigate('mesh-map')}
            onOpenAnonymous={() => navigate('anonymous')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenPremium={() => setIsPremiumOpen(true)}
            activeChatId={activeChatId}
            activeNavTab={currentScreen === 'chats' ? 'chats' : undefined}
            stories={stories}
            channels={channels}
            localFingerprint={identity?.fingerprint}
            getBotSession={getBotSession}
            now={now}
            onCreateStory={createStory}
            onDeleteStory={deleteStory}
            onViewStory={viewStory}
            onToggleStoryReaction={toggleStoryReaction}
          />
        );
      case 'chat-katie': {
        const botId = getBotSession().isBot(activeChatId) ? activeChatId : undefined;
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
            getBotSession={getBotSession}
            pendingBotStart={pendingBotStart}
            onBotStartSent={() => setPendingBotStart(null)}
            onBotCallback={handleBotCallback}
          />
        );
      }
      case 'channel-kyiv':
        return (
          <ChannelScreen
            key={`${activeChannelId}:${pendingCommentsPostId ?? ''}`}
            {...channelScreenProps}
            onBack={goBack}
          />
        );
      case 'profile-katie':
        return (
          <ProfileScreen
            profileId={activeProfileId}
            onBack={goBack}
            onOpenChat={() => navigate('chat-katie')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        );
      case 'analytics':
        return <AnalyticsScreen onBack={goBack} />;
      case 'mesh-map':
        return (
          <div className="flex h-full w-full flex-col bg-[#090a0e]">
            <header className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] shrink-0">
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
              <h1 className="min-w-0 truncate text-[15px] font-bold text-white">
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
      case 'sites':
        return <SitesScreen onBack={goBack} />;
      default:
        return null;
    }
  };   const isDesktopChatActive = currentScreen === 'chats' || currentScreen === 'chat-katie' || currentScreen === 'anonymous';
   const isDesktopChannelActive = currentScreen === 'channel-kyiv';
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
        <div className="h-screen h-[100dvh] w-screen overflow-hidden bg-[#090a0e] text-white flex flex-col md:flex-row font-sans selection:bg-[var(--nova-accent-color)]/30 select-none safe-area-screen">
      {/* ======================================================== */}
      {/* 1. DESKTOP LAYOUT (>= 768px md: breakpoint)               */}
      {/* ======================================================== */}

      {/* Left Navigation Rail (Desktop Only) */}
      <aside className="hidden md:flex w-[72px] shrink-0 bg-[#0b0c11] border-r border-white/[0.06] flex-col items-center justify-between py-4 z-30 select-none shadow-xl">
        {/* Primary Navigation Icons */}
        <nav className="flex flex-col items-center gap-2.5 w-full px-2">
          {/* Chats tab */}
          <NovaTooltip label={t('common.chats')}>
          <button
            onClick={() => {
              setActiveChatId('katie');
              setCurrentScreen('chat-katie');
            }}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
              isDesktopChatActive
                ? 'bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30'
                : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
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
            onClick={() => {
              setActiveChatId('kyiv-channel');
              setCurrentScreen('channel-kyiv');
            }}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
              isDesktopChannelActive
                ? 'bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30'
                : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
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
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group text-white/45 hover:text-white hover:bg-white/[0.08]`}
            title={t('folders')}
          >
            <Folder className="w-5 h-5" />
          </button>



          {/* Analytics tab */}
          <button
            onClick={() => navigate('analytics')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
              currentScreen === 'analytics'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30'
                : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
            }`}
            title={t('analytics.title')}
          >
            <BarChart3 className={`w-5 h-5 ${currentScreen === 'analytics' ? 'fill-[var(--nova-accent-color)]' : ''}`} />
          {currentScreen === 'analytics' && (
            <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-[var(--nova-accent-color)]" />
          )}
        </button>

          {/* Mesh Map tab */}
          <button
            onClick={() => navigate('mesh-map')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
              currentScreen === 'mesh-map'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30'
                : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
            }`}
            title={t('meshMap.title')}
            aria-label={t('meshMap.title')}
          >
            <MapPin className={`w-5 h-5 ${currentScreen === 'mesh-map' ? 'fill-[var(--nova-accent-color)]' : ''}`} />
        {currentScreen === 'mesh-map' && (
          <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-[var(--nova-accent-color)]" />
        )}
      </button>

      {/* Sites tab */}
      <button
        onClick={() => { setActiveChatId(''); setCurrentScreen('sites'); }}
        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group ${
          currentScreen === 'sites'
            ? 'bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30'
            : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
        }`}
        title={t('sites.title')}
      >
        <MessageSquare className="w-5 h-5" />
      {currentScreen === 'sites' && (
        <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-[var(--nova-accent-color)]" />
      )}
    </button>
  </nav>

        <div className="flex flex-col items-center gap-2">
          {/* Settings Trigger (language switch moved into Settings) */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-11 h-11 rounded-2xl text-white/45 hover:text-[var(--nova-accent-color)] hover:bg-white/[0.08] flex items-center justify-center transition cursor-pointer"
            title={t('settings.title')}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* User Avatar with Status indicator */}
          <button
            onClick={() => openProfile(account.id)}
            className="w-10 h-10 rounded-full border border-white/15 overflow-hidden relative cursor-pointer active:scale-95 transition hover:ring-2 hover:ring-[var(--nova-accent-color)]/60 group"
            title={`${account.displayName} (Online)`}
          >
            {account.avatar && (
              <img
                src={account.avatar}
                alt={account.displayName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}
            <div className="w-full h-full bg-[var(--nova-accent-color)] text-white font-bold text-xs flex items-center justify-center">
              {account.displayName.slice(0, 2).toUpperCase()}
            </div>
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
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0b0c11]" />
          </button>
        </div>
      </aside>

      {/* Left Column (Desktop Only) */}
      <section className="hidden md:flex w-[340px] lg:w-[380px] xl:w-[410px] shrink-0 border-r border-white/[0.06] bg-[#0c0d11] h-full flex-col overflow-hidden relative">
        {/* ChatsScreen stays mounted so the Folders button in the rail always
            has a live ref (it used to go dead on the Channels screen). */}
        <ChatsScreen
          ref={foldersRef}
          onSelectChat={(id) => {
            navigate('chat-katie', { chatId: id });
          }}
          onOpenChannel={openChannel}
          onOpenProfile={() => openProfile(account.id)}
          onOpenMeshMap={() => navigate('mesh-map')}
          onOpenAnonymous={() => navigate('anonymous')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenPremium={() => setIsPremiumOpen(true)}
          activeChatId={activeChatId}
          activeNavTab={currentScreen === 'chats' ? 'chats' : undefined}
          stories={stories}
          channels={channels}
          localFingerprint={identity?.fingerprint}
          getBotSession={getBotSession}
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
      <main className="hidden md:flex flex-1 min-w-0 h-full overflow-hidden bg-[#090a0e] flex-col relative">
        <Suspense fallback={<ScreenFallback />}>{renderDesktopMainScreen()}</Suspense>
      </main>

      {/* ======================================================== */}
      {/* 2. MOBILE VIEW (< 768px md: breakpoint)                   */}
      {/* ======================================================== */}
      <div className="flex-1 w-full h-full md:hidden overflow-hidden flex flex-col relative bg-[#0c0d11]">
        <Suspense fallback={<ScreenFallback />}>{renderMobileScreen()}</Suspense>
      </div>



      <JoinRequestNotice
        notice={joinNotice}
        onDismiss={() => setJoinNotice(null)}
        onOpen={(groupId) => {
          navigate('chat-katie', { chatId: groupId });
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
            className="w-full max-w-sm bg-[#151621] border border-white/15 rounded-3xl shadow-2xl shadow-black/80 p-5 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--nova-accent-color, #ff4e18)]/15 border border-[var(--nova-accent-color, #ff4e18)]/40 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)]">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-white truncate">
                  {pendingInvite.groupName}
                </h3>
                <p className="text-[11px] text-[#8c919d]">{t('chat.joinTitle')}</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-white/70">
              {t('chat.joinPrompt', { group: pendingInvite.groupName })}
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPendingInvite(null)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/70 transition cursor-pointer"
              >
                {t('chat.joinDecline')}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Joining is a request, not membership: an admin has to approve it.
                  markJoinPending(pendingInvite.chatId);
                  navigate('chat-katie', { chatId: pendingInvite.chatId });
                  setPendingInvite(null);
                }}
                className="px-3 py-2 rounded-xl bg-[var(--nova-accent-color, #ff4e18)] hover:bg-[var(--nova-accent-color, #ff5d2b)] text-xs font-semibold text-white transition cursor-pointer"
              >
                {t('chat.joinAccept')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App Settings Modal (language switch lives here) */}
      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onOpenAnalytics={openAnalytics}
          getBotSession={getBotSession}
        />
      </Suspense>

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
