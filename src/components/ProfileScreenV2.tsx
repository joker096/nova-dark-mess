import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Share2,
  Edit2,
  MessageSquare,
  Phone,
  Video,
  MoreHorizontal,
  QrCode,
  FileText,
  Key,
  Link2,
  Mic,
  Check,
  Copy,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Volume2,
  VolumeX,
  Sparkles,
  ShieldCheck,
  Camera,
  Crown,
} from 'lucide-react';
import { CONTACT_PROFILES, CURRENT_USER, CONVERSATION_HISTORIES } from '../data/mockMessengerData';
import {
  loadContactOverrides,
  saveContactOverride,
  type ContactOverride,
} from '../lib/contacts/contactOverrides';
import { VideoCallOverlay } from './VideoCallOverlay';
import { SharedMediaItem } from '../types/messenger';
import { useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { useSecurity } from '../hooks/useSecurity';
import { useAccount } from '../hooks/useAccount';
import { ContactShareModal } from './ContactShareModal';
import { toDataURL } from 'qrcode';
import {
  DeviceLinkManager,
  encodeDeviceLinkOffer,
  encodeDeviceLinkResponse,
  parseDeviceLinkOffer,
  parseDeviceLinkResponse,
} from '../lib/p2p/deviceLinking';
import { createHandle } from '../lib/crypto/handles';
import { isPremium } from '../lib/premium';
import { LazyMedia } from './LazyMedia';
import { createThumbnail } from '../lib/media/imageThumbnail';
import {
  NovaNavBar,
  NovaAvatar,
  NovaSegmentedTabs,
  NovaListGroup,
  NovaListRow,
  NovaListSectionHeader,
  NovaBottomSheet,
  NovaActionTile,
  NovaPillButton,
  NovaBadge,
  NovaButton,
} from '../lib/ui';

interface ProfileScreenProps {
  profileId: string;
  onBack: () => void;
  onOpenChat: () => void;
  onOpenSettings?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profileId,
  onBack,
  onOpenChat,
  onOpenSettings,
}) => {
  const baseProfile = CONTACT_PROFILES[profileId] || CONTACT_PROFILES['katie'];
  const isOwnProfile = profileId === CURRENT_USER.id;
  const { account, updateAccount } = useAccount();
  const [contactOverride, setContactOverride] = useState<ContactOverride | null>(() =>
    profileId === CURRENT_USER.id ? null : loadContactOverrides()[profileId] ?? null,
  );
  const profile = isOwnProfile
    ? {
        ...baseProfile,
        name: account.displayName,
        nickname: account.nickname,
        phone: account.phone,
        avatar: account.avatar,
        status: account.status,
      }
    : { ...baseProfile, ...(contactOverride ?? {}) };
  const initials = profile.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const { t } = useLanguage();
  const premium = isPremium();
  const { identity, p2pManager } = useSecurity();
  const ownHandle = identity
    ? createHandle(identity.signingPublicKey, account.displayName).handle
    : null;
  const SAFETY_EMOJIS = ['🐶', '🐱', '🦊', '🐯', '🦁', '🐻', '🐼', '🐨', '🐵', '🐸'];
  const safetySource = isOwnProfile ? (identity?.fingerprint || '') : profile.nickname;
  const safetyEmoji = safetySource
    .split('')
    .map((c) => SAFETY_EMOJIS[c.charCodeAt(0) % SAFETY_EMOJIS.length])
    .slice(0, 8)
    .join(' ');
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links' | 'voice'>('media');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'photos' | 'videos'>('all');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState<'audio' | null>(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'nickname' | 'phone' | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [fieldDraft, setFieldDraft] = useState('');
  const [showContactEdit, setShowContactEdit] = useState(false);
  const [contactDraft, setContactDraft] = useState({ name: '', nickname: '', phone: '' });
  const [shareContactOpen, setShareContactOpen] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [peerSafetyInput, setPeerSafetyInput] = useState('');
  const [safetyQrUrl, setSafetyQrUrl] = useState<string | null>(null);
  const [showDeviceLinkModal, setShowDeviceLinkModal] = useState(false);
  const qrDialogRef = useFocusTrap<HTMLDivElement>(showQrModal, () => setShowQrModal(false));
  const safetyDialogRef = useFocusTrap<HTMLDivElement>(showSafetyModal, () =>
    setShowSafetyModal(false),
  );
  const deviceLinkDialogRef = useFocusTrap<HTMLDivElement>(showDeviceLinkModal, () =>
    setShowDeviceLinkModal(false),
  );
  const [deviceLinkQrUrl, setDeviceLinkQrUrl] = useState<string | null>(null);
  const [deviceLinkCode, setDeviceLinkCode] = useState('');
  const [deviceLinkUrl, setDeviceLinkUrl] = useState('');
  const deviceLinkManagerRef = useRef<DeviceLinkManager | null>(null);
  const secondaryLinkManagerRef = useRef<DeviceLinkManager | null>(null);
  const [deviceLinkMode, setDeviceLinkMode] = useState<'primary' | 'join'>('primary');
  const [deviceLinkOfferInput, setDeviceLinkOfferInput] = useState('');
  const [deviceLinkReplyInput, setDeviceLinkReplyInput] = useState('');
  const [deviceLinkReply, setDeviceLinkReply] = useState<string | null>(null);
  const [deviceLinkError, setDeviceLinkError] = useState<string | null>(null);
  const [linkedDeviceCount, setLinkedDeviceCount] = useState(0);
  const [historySyncStatus, setHistorySyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [historySyncCount, setHistorySyncCount] = useState<{ chats: number; messages: number } | null>(null);
  const [isScanningCamera, setIsScanningCamera] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const touchStartXRef = useRef<number | null>(null);

  const updateAvatarEverywhere = (value: string) => {
    setAvatar(value);
    setAvatarLoadFailed(false);
    setAvatarMessage('');
    if (isOwnProfile) {
      try {
        updateAccount({ avatar: value });
      } catch (error) {
        setAvatarMessage(
          error instanceof Error ? error.message : t('profile.avatarSaveFailed', { defaultValue: 'Could not save the photo.' }),
        );
      }
      return;
    }
    saveContactOverride(profileId, { avatar: value });
    setContactOverride((prev) => ({ ...prev, avatar: value }));
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarMessage(t('profile.avatarChooseImage', { defaultValue: 'Choose an image file.' }));
      return;
    }
    setAvatarMessage(t('profile.avatarProcessing', { defaultValue: 'Preparing photo…' }));
    void createThumbnail(file, { maxWidth: 512, maxHeight: 512, quality: 0.85 })
      .then((dataUrl) => updateAvatarEverywhere(dataUrl))
      .catch(() =>
        setAvatarMessage(t('profile.avatarSaveFailed', { defaultValue: 'Could not save the photo.' })),
      );
  };

  const handleRemoveAvatar = () => {
    updateAvatarEverywhere('');
  };

  useEffect(() => {
    setContactOverride(
      isOwnProfile ? null : loadContactOverrides()[profileId] ?? null,
    );
  }, [profileId, isOwnProfile]);

  useEffect(() => {
    setAvatar(profile.avatar);
    setAvatarLoadFailed(false);
  }, [profileId, isOwnProfile, account.avatar, profile.avatar]);

  useEffect(() => {
    if (!showSafetyModal || !identity) return;
    let cancelled = false;
    (async () => {
      try {
        const url = await toDataURL(`nova-safety:${identity.fingerprint}`, {
          width: 220,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (!cancelled) setSafetyQrUrl(url);
      } catch {
        if (!cancelled) setSafetyQrUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showSafetyModal, identity]);

  useEffect(() => {
    if (!showDeviceLinkModal || !identity) return;
    if (!deviceLinkManagerRef.current) {
      deviceLinkManagerRef.current = new DeviceLinkManager();
    }
    const offer = deviceLinkManagerRef.current.createOffer();
    setDeviceLinkCode(offer.code);
    setDeviceLinkUrl(encodeDeviceLinkOffer(offer));
    let cancelled = false;
    (async () => {
      try {
        const url = await toDataURL(encodeDeviceLinkOffer(offer), {
          width: 220,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (!cancelled) setDeviceLinkQrUrl(url);
      } catch {
        if (!cancelled) setDeviceLinkQrUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showDeviceLinkModal, identity]);

  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [mediaToast, setMediaToast] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stopCameraScan = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setIsScanningCamera(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedMediaIndex !== null) setSelectedMediaIndex(null);
      else if (showQrModal) setShowQrModal(false);
      else if (showSafetyModal) setShowSafetyModal(false);
      else if (showDeviceLinkModal) {
        stopCameraScan();
        setShowDeviceLinkModal(false);
      } else if (showContactEdit) setShowContactEdit(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedMediaIndex,
    showQrModal,
    showSafetyModal,
    showDeviceLinkModal,
    showContactEdit,
  ]);

  const copyToClipboard = async (text: string, field: string, message?: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      void 0;
    }
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1800);
    if (message) triggerToast(message);
  };

  const triggerToast = (msg: string) => {
    setMediaToast(msg);
    setTimeout(() => setMediaToast(null), 2200);
  };

  const handleJoinDeviceLink = () => {
    setDeviceLinkError(null);
    const offer = parseDeviceLinkOffer(deviceLinkOfferInput);
    if (!offer) {
      setDeviceLinkError('That is not a valid Nova device link.');
      setDeviceLinkReply(null);
      return;
    }
    try {
      if (!secondaryLinkManagerRef.current) {
        secondaryLinkManagerRef.current = new DeviceLinkManager();
      }
      const response = secondaryLinkManagerRef.current.acceptOffer(offer);
      setDeviceLinkReply(encodeDeviceLinkResponse(response));
    } catch (err) {
      setDeviceLinkReply(null);
      setDeviceLinkError(err instanceof Error ? err.message : 'Link failed');
    }
  };

  const handleDeviceLinkReply = () => {
    setDeviceLinkError(null);
    const response = parseDeviceLinkResponse(deviceLinkReplyInput);
    if (!response) {
      setDeviceLinkError('That is not a valid reply code.');
      return;
    }
    try {
      if (!deviceLinkManagerRef.current) throw new Error('No pending link offer');
      const session = deviceLinkManagerRef.current.finalizeFromResponse(response);
      setLinkedDeviceCount((count) => count + 1);
      setDeviceLinkReplyInput('');

      void (async () => {
        try {
          setHistorySyncStatus('syncing');
          const encrypted = await deviceLinkManagerRef.current!.exportHistorySnapshot(
            session,
            CONVERSATION_HISTORIES,
          );
          localStorage.setItem(`nova_device_link_history_${session.code}`, JSON.stringify(encrypted));
          const totalMessages = Object.values(CONVERSATION_HISTORIES).reduce((acc, m) => acc + (m?.length || 0), 0);
          setHistorySyncCount({ chats: Object.keys(CONVERSATION_HISTORIES).length, messages: totalMessages });
          setHistorySyncStatus('synced');
        } catch {
          setHistorySyncStatus('idle');
        }
      })();
    } catch (err) {
      setDeviceLinkError(err instanceof Error ? err.message : 'Link failed');
    }
  };

  const handleSyncHistoryOnSecondary = async (code: string, remotePublicKey: string) => {
    try {
      if (!secondaryLinkManagerRef.current) return;
      setHistorySyncStatus('syncing');
      const session = secondaryLinkManagerRef.current.finalizeFromStoredSecret(remotePublicKey, code);
      const raw = localStorage.getItem(`nova_device_link_history_${code}`);
      if (raw) {
        const encrypted = JSON.parse(raw);
        const imported = await secondaryLinkManagerRef.current.importHistorySnapshot(session, encrypted);
        for (const chat of imported.chats) {
          CONVERSATION_HISTORIES[chat.id] = chat.messages as any;
        }
        const total = imported.chats.reduce((acc, c) => acc + c.messages.length, 0);
        setHistorySyncCount({ chats: imported.chats.length, messages: total });
        setHistorySyncStatus('synced');
      } else {
        setHistorySyncStatus('synced');
      }
    } catch (err) {
      setDeviceLinkError(err instanceof Error ? err.message : 'History sync failed');
      setHistorySyncStatus('idle');
    }
  };

  const startCameraScan = async () => {
    setDeviceLinkError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported on this device');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraStreamRef.current = stream;
      setIsScanningCamera(true);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        void cameraVideoRef.current.play();
      }
    } catch (err) {
      setDeviceLinkError(err instanceof Error ? err.message : 'Camera access denied');
      setIsScanningCamera(false);
    }
  };

  const openQr = async () => {
    setShowQrModal(true);
    try {
      const profileUrl = isOwnProfile && identity?.fingerprint
        ? `https://nova.app/profile/${encodeURIComponent(identity.fingerprint)}`
        : `https://nova.app/u/${encodeURIComponent(profile.nickname.replace(/^@/, ''))}`;
      const url = await toDataURL(profileUrl, {
        width: 260,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(url);
    } catch {
      setQrDataUrl(null);
    }
  };

  const applyContactPatch = (patch: ContactOverride) => {
    saveContactOverride(profileId, patch);
    setContactOverride((prev) => ({ ...prev, ...patch }));
  };

  const saveField = () => {
    const value = fieldDraft.trim();
    if (editingField === 'nickname') {
      const next = value || profile.nickname;
      if (isOwnProfile) updateAccount({ nickname: next });
      else applyContactPatch({ nickname: next });
    }
    if (editingField === 'phone') {
      if (isOwnProfile) updateAccount({ phone: value });
      else applyContactPatch({ phone: value });
    }
    setEditingField(null);
    setFieldDraft('');
  };

  const cancelEdit = () => {
    setEditingField(null);
    setFieldDraft('');
  };

  const openContactEdit = () => {
    setContactDraft({
      name: profile.name,
      nickname: profile.nickname,
      phone: profile.phone === '—' ? '' : profile.phone,
    });
    setShowContactEdit(true);
  };

  const saveContactEdit = () => {
    const name = contactDraft.name.trim() || profile.name;
    const nickname = contactDraft.nickname.trim() || profile.nickname;
    const phone = contactDraft.phone.trim();
    if (isOwnProfile) {
      updateAccount({ displayName: name, nickname, phone });
    } else {
      applyContactPatch({ name, nickname, phone });
    }
    setShowContactEdit(false);
    triggerToast(t('profile.contactUpdated'));
  };

  const allMediaItems: SharedMediaItem[] = profile.sharedMedia ?? [];
  const filteredMedia = allMediaItems.filter((item) => {
    if (mediaFilter === 'photos') return item.type === 'image';
    if (mediaFilter === 'videos') return item.type === 'video';
    return true;
  });

  const photosCount = allMediaItems.filter((m) => m.type === 'image').length;
  const videosCount = allMediaItems.filter((m) => m.type === 'video').length;

  const groupedMedia: { [month: string]: SharedMediaItem[] } = {};
  filteredMedia.forEach((item) => {
    if (!groupedMedia[item.monthGroup]) {
      groupedMedia[item.monthGroup] = [];
    }
    groupedMedia[item.monthGroup].push(item);
  });

  const activeMediaItem =
    selectedMediaIndex !== null ? filteredMedia[selectedMediaIndex] : null;

  const handlePrevMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedMediaIndex === null) return;
    setSelectedMediaIndex((prev) =>
      prev! > 0 ? prev! - 1 : filteredMedia.length - 1
    );
    setIsVideoPlaying(true);
  };

  const handleNextMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedMediaIndex === null) return;
    setSelectedMediaIndex((prev) =>
      prev! < filteredMedia.length - 1 ? prev! + 1 : 0
    );
    setIsVideoPlaying(true);
  };

  const handleMediaTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleMediaTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartXRef.current;
    touchStartXRef.current = null;
    if (start === null || selectedMediaIndex === null || filteredMedia.length < 2) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 50) return;
    setSelectedMediaIndex((prev) => {
      if (prev === null) return prev;
      if (delta > 0) return prev > 0 ? prev - 1 : filteredMedia.length - 1;
      return prev < filteredMedia.length - 1 ? prev + 1 : 0;
    });
    setIsVideoPlaying(true);
  };

  const shareMedia = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeMediaItem) return;
    const title = activeMediaItem.caption || t('profile.sharedMedia');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, url: activeMediaItem.url });
        return;
      }
      await copyToClipboard(activeMediaItem.url, 'media-share', t('profile.sharedToClipboard'));
    } catch {
      void 0;
    }
  };

  const downloadMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeMediaItem) return;
    try {
      const link = document.createElement('a');
      link.href = activeMediaItem.url;
      link.download = activeMediaItem.caption || 'nova-media';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      void 0;
    }
    triggerToast(t('profile.downloaded'));
  };

  const toggleVideoPlayback = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsVideoPlaying(true);
      } else {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      }
    } else {
      setIsVideoPlaying((v) => !v);
    }
  };

  const tabs = [
    { key: 'media', label: t('common.media'), count: profile.mediaCount },
    { key: 'files', label: t('common.files'), count: profile.filesCount },
    { key: 'links', label: t('common.links'), count: profile.linksCount },
    { key: 'voice', label: t('common.voice'), count: profile.voiceCount },
  ];

  const mediaFilterTabs = [
    { key: 'all', label: t('common.all'), count: allMediaItems.length },
    { key: 'photos', label: t('profile.photos'), count: photosCount },
    { key: 'videos', label: t('profile.videos'), count: videosCount },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--bg-screen)] text-white relative select-none overflow-y-auto no-scrollbar pb-10">
      {mediaToast && (
        <div className="pointer-events-none fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-card)] border border-[var(--c-primary)]/40 text-white text-xs px-4 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <Check className="w-3.5 h-3.5 text-[var(--c-primary)]" />
          <span>{mediaToast}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <NovaNavBar
        showBack
        onBack={onBack}
        backLabel={t('common.back')}
        title={isOwnProfile ? t('profile.myProfile') : profile.name}
        right={
          <>
            {!isOwnProfile && (
              <NovaMenu
                label={t('profile.contactOptions')}
                align="start"
                items={[
                  {
                    key: 'edit',
                    label: t('profile.editContact'),
                    icon: <Edit2 />,
                    onSelect: openContactEdit,
                  },
                  {
                    key: 'share',
                    label: t('common.share'),
                    icon: <Share2 />,
                    onSelect: () => setShareContactOpen(true),
                  },
                  {
                    key: 'copy-id',
                    label: t('profile.copyId'),
                    icon: <Copy />,
                    onSelect: () => {
                      void copyToClipboard(profileId, 'contact-id', t('profile.contactIdCopied'));
                    },
                  },
                ]}
                trigger={
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full bg-[var(--bg-field)] hover:bg-[var(--bg-soft)] flex items-center justify-center text-white/90 active:scale-90 transition cursor-pointer"
                    aria-label={t('common.more')}
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                }
              />
            )}
            {isOwnProfile && onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="w-9 h-9 rounded-full bg-[var(--bg-field)] hover:bg-[var(--bg-soft)] flex items-center justify-center text-white/90 active:scale-90 transition cursor-pointer"
                aria-label={t('settings.title')}
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </>
        }
      />

      {/* Avatar & Profile Hero */}
      <div className="flex flex-col items-center pt-2 pb-5 px-5">
        <div className="relative mb-3">
          <div className="w-24 h-24 rounded-full overflow-hidden p-1 bg-gradient-to-tr from-[#252834] via-[#323644] to-[var(--c-primary)]/40 shadow-xl shadow-black/80">
            {avatar && !avatarLoadFailed ? (
              <LazyMedia
                src={avatar}
                alt={profile.name}
                className="w-full h-full rounded-full object-cover"
                eager
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <div className="w-full h-full rounded-full bg-[var(--c-primary)] flex items-center justify-center font-bold text-2xl text-white">
                {initials}
              </div>
            )}
          </div>
          {isOwnProfile && (
            <>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                data-testid="avatar-input"
                aria-label={t('profile.changeAvatar')}
                title={t('profile.changeAvatar')}
                onChange={handleAvatarFileChange}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-[var(--c-primary)]/95 text-white flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer border-2 border-[var(--bg-screen)]"
                title={t('profile.changeAvatar')}
                aria-label={t('profile.changeAvatar')}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              {avatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 border border-white/10 text-white flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer"
                  title={t('profile.removeAvatar')}
                  aria-label={t('profile.removeAvatar')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        {isOwnProfile && avatarMessage && (
          <p role="status" className="mb-2 max-w-[240px] text-center text-[11px] text-[var(--c-primary)]">
            {avatarMessage}
          </p>
        )}

        {editingName ? (
          <div className="flex items-center gap-1.5">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const next = nameDraft.trim();
                  if (next) updateAccount({ displayName: next });
                  setEditingName(false);
                }
                if (e.key === 'Escape') setEditingName(false);
              }}
              autoFocus
              aria-label={t('profile.name')}
              className="w-44 px-3 py-1.5 rounded-xl bg-[var(--bg-field)] border border-[var(--c-primary)]/50 text-sm font-semibold text-white text-center outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const next = nameDraft.trim();
                if (next) updateAccount({ displayName: next });
                setEditingName(false);
              }}
              className="p-1.5 rounded-lg bg-[var(--c-primary)] text-white transition hover:opacity-90"
              title={t('common.save')}
              aria-label={t('common.save')}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              className="p-1.5 rounded-lg bg-white/5 text-white/70 transition hover:bg-white/10"
              title={t('common.cancel')}
              aria-label={t('common.cancel')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-xl font-bold text-white tracking-tight">{profile.name}</h1>
            {isOwnProfile && premium && (
              <span
                data-testid="premium-crown"
                aria-label={t('premium.active')}
                title={t('premium.active')}
                className="text-amber-300 drop-shadow"
              >
                <Crown className="w-4 h-4" />
              </span>
            )}
          </div>
        )}
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          {profile.status}
        </p>

        {/* Quick Action Buttons */}
        <div className={`grid ${isOwnProfile ? 'grid-cols-1' : 'grid-cols-4'} gap-3 mt-6 w-full max-w-[360px]`}>
          {!isOwnProfile && (
            <NovaActionTile
              icon={<MessageSquare className="w-5 h-5" />}
              label={t('profile.message')}
              onClick={onOpenChat}
            />
          )}

          <NovaActionTile
            icon={<Phone className="w-5 h-5" />}
            label={t('common.audio')}
            onClick={() => setShowCallModal('audio')}
            disabled={isOwnProfile}
          />

          <NovaActionTile
            icon={<Video className="w-5 h-5" />}
            label={t('common.video')}
            onClick={() => setShowVideoCall(true)}
            disabled={isOwnProfile}
          />

          <NovaMenu
            label={isOwnProfile ? t('settings.title') : t('common.more')}
            align="start"
            items={
              isOwnProfile
                ? []
                : [
                    {
                      key: 'edit',
                      label: t('profile.editContact'),
                      icon: <Edit2 />,
                      onSelect: openContactEdit,
                    },
                    {
                      key: 'share',
                      label: t('common.share'),
                      icon: <Share2 />,
                      onSelect: () => setShareContactOpen(true),
                    },
                    {
                      key: 'copy-id',
                      label: t('profile.copyId'),
                      icon: <Copy />,
                      onSelect: () => {
                        void copyToClipboard(profileId, 'contact-id', t('profile.contactIdCopied'));
                      },
                    },
                  ]
            }
            trigger={
              <NovaActionTile
                icon={<MoreHorizontal className="w-5 h-5" />}
                label={isOwnProfile ? t('settings.title') : t('common.more')}
                onClick={() => {}}
              />
            }
          />
        </div>
      </div>

      {/* Contact Details Card */}
      <div className="px-5 mb-4">
        <NovaListGroup>
          <NovaListSectionHeader title={t('profile.contactInfo')} />

          {/* Nickname row */}
          <NovaListRow
            title={t('profile.nickname')}
            subtitle={profile.nickname}
            rightContent={
              <>
                {editingField === 'nickname' ? (
                  <>
                    <input
                      value={fieldDraft}
                      onChange={(e) => setFieldDraft(e.target.value)}
                      autoFocus
                      className="w-32 px-2 py-1.5 rounded-lg bg-[var(--bg-field)] border border-white/10 text-[11px] text-white outline-none focus:border-[var(--c-primary)]"
                    />
                    <button
                      onClick={saveField}
                      className="p-1.5 rounded-lg bg-[var(--c-primary)] text-white hover:opacity-90 transition cursor-pointer"
                      title={t('common.save')}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1.5 rounded-lg bg-white/[0.05] text-white/70 hover:bg-white/[0.1] transition cursor-pointer"
                      title={t('common.cancel')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setFieldDraft(profile.nickname);
                        setEditingField('nickname');
                      }}
                      className="p-2.5 text-white/50 hover:text-white transition cursor-pointer"
                      title={t('common.edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={openQr}
                      className="p-2.5 text-white/50 hover:text-white transition cursor-pointer"
                      title={t('common.contact')}
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            }
          />

          {/* Handle row */}
          <NovaListRow
            title={t('profile.handle')}
            subtitle={isOwnProfile && ownHandle ? ownHandle : `nova://${(profile.nickname || profile.name).replace('@', '').toLowerCase().slice(0, 12)}`}
            rightContent={
              <button
                onClick={() =>
                  copyToClipboard(
                    isOwnProfile && ownHandle
                      ? ownHandle
                      : `nova://${(profile.nickname || profile.name).replace('@', '').toLowerCase().slice(0, 12)}`,
                    'handle'
                  )
                }
                className="p-2.5 text-white/50 hover:text-white transition cursor-pointer"
                title={t('common.copy')}
                aria-label={t('common.copy')}
              >
                {copiedField === 'handle' ? (
                  <Check className="w-4 h-4 text-[var(--c-primary)]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            }
          />

          {/* Crypto ID row */}
          {isOwnProfile && identity && (
            <NovaListRow
              title={t('profile.cryptoId')}
              subtitle={`nova_pk_${identity.fingerprint.slice(0, 8)}...${identity.fingerprint.slice(-8)}`}
              rightContent={
                <button
                  onClick={() => copyToClipboard(identity.fingerprint, 'fingerprint')}
                  className="p-2.5 text-white/50 hover:text-white transition cursor-pointer"
                  title={t('common.copy')}
                  aria-label={t('common.copy')}
                >
                  {copiedField === 'fingerprint' ? (
                    <Check className="w-4 h-4 text-[var(--c-primary)]" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              }
              icon={<Key className="w-4 h-4" />}
            />
          )}

          {/* Device linking row */}
          {isOwnProfile && identity && (
            <NovaListRow
              title={t('profile.linkedDevices')}
              subtitle={
                1 + linkedDeviceCount === 1
                  ? t('profile.deviceOne')
                  : t('profile.devicesMany', { count: 1 + linkedDeviceCount })
              }
              rightContent={
                <NovaPillButton
                  variant="default"
                  onClick={() => setShowDeviceLinkModal(true)}
                  size="sm"
                >
                  {t('profile.linkDevice')}
                </NovaPillButton>
              }
              icon={<Link2 className="w-4 h-4" />}
            />
          )}

          {/* Safety number row */}
          {isOwnProfile && identity && (
            <NovaListRow
              title={t('profile.safetyNumber')}
              subtitle={safetyEmoji}
              rightContent={
                <button
                  onClick={() => setShowSafetyModal(true)}
                  className="p-2.5 text-white/50 hover:text-white transition cursor-pointer"
                  title={t('profile.safetyNumber')}
                  aria-label={t('profile.safetyNumber')}
                >
                  <QrCode className="w-4 h-4" />
                </button>
              }
              icon={<ShieldCheck className="w-4 h-4" />}
            />
          )}

          {/* Additional phone */}
          <NovaListRow
            title={t('profile.additionalPhone')}
            subtitle={profile.phone || '—'}
            rightContent={
              <>
                {editingField === 'phone' ? (
                  <>
                    <input
                      value={fieldDraft}
                      onChange={(e) => setFieldDraft(e.target.value)}
                      autoFocus
                      inputMode="numeric"
                      className="w-32 px-2 py-1.5 rounded-lg bg-[var(--bg-field)] border border-white/10 text-[11px] text-white outline-none focus:border-[var(--c-primary)]"
                    />
                    <button
                      onClick={saveField}
                      className="p-1.5 rounded-lg bg-[var(--c-primary)] text-white hover:opacity-90 transition cursor-pointer"
                      title={t('common.save')}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1.5 rounded-lg bg-white/[0.05] text-white/70 hover:bg-white/[0.1] transition cursor-pointer"
                      title={t('common.cancel')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setFieldDraft(profile.phone || '');
                        setEditingField('phone');
                      }}
                      className="p-2.5 text-white/50 hover:text-white transition cursor-pointer"
                      title={t('common.edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            }
          />
        </NovaListGroup>
      </div>

      {/* Main Tabs */}
      <div className="px-5 mb-3">
        <NovaSegmentedTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          variant="underline"
        />
      </div>

      {/* Tab Content */}
      <div className="px-5">
        {/* MEDIA TAB CONTENT */}
        {activeTab === 'media' && (
          <div className="space-y-4">
            {/* Media Filter Sub-tabs */}
            <NovaSegmentedTabs
              tabs={mediaFilterTabs}
              activeTab={mediaFilter}
              onTabChange={(key) => setMediaFilter(key as 'all' | 'photos' | 'videos')}
              variant="pill"
            />

            {filteredMedia.length === 0 && (
              <div
                data-testid="profile-media-empty"
                className="py-12 text-center text-[var(--text-secondary)] text-xs"
              >
                {t('profile.noSharedMedia')}
              </div>
            )}

            {/* Media Grouped by Month */}
            {Object.keys(groupedMedia).map((month) => (
              <div key={month} className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-[11px] font-bold text-[var(--text-secondary)] tracking-wider uppercase">
                    {month}
                  </h3>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {t('profile.itemsCount', { count: groupedMedia[month].length })}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {groupedMedia[month].map((item) => {
                    const globalIndex = filteredMedia.findIndex((m) => m.id === item.id);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setSelectedMediaIndex(globalIndex);
                          setIsVideoPlaying(true);
                        }}
                        aria-label={item.caption || t('profile.sharedMedia')}
                        className="aspect-square rounded-2xl overflow-hidden bg-[var(--bg-field)] border border-white/5 relative group cursor-pointer active:scale-95 transition shadow-sm hover:border-white/20"
                      >
                        <LazyMedia
                          src={item.type === 'video' ? item.thumbnail || item.url : item.url}
                          alt={item.caption || t('profile.sharedMedia')}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />

                        {item.type === 'video' ? (
                          <>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white transition-transform hover:scale-110">
                                <Play className="w-6 h-6 ml-1" aria-hidden="true" />
                              </div>
                            </div>
                            <div className="absolute bottom-1 right-1 flex items-center gap-0.5 text-[10px] text-white/90 font-mono">
                              <span className="bg-black/50 px-1.5 py-0.5 rounded">
                                {item.duration || '0:00'}
                              </span>
                            </div>
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FILES TAB CONTENT */}
        {activeTab === 'files' && (
          <div className="py-4 text-center text-[var(--text-secondary)] text-sm">
            {t('profile.noFiles')}
          </div>
        )}

        {/* LINKS TAB CONTENT */}
        {activeTab === 'links' && (
          <div className="py-4 text-center text-[var(--text-secondary)] text-sm">
            {t('profile.noLinks')}
          </div>
        )}

        {/* VOICE TAB CONTENT */}
        {activeTab === 'voice' && (
          <div className="py-4 text-center text-[var(--text-secondary)] text-sm">
            {t('profile.noVoice')}
          </div>
        )}
      </div>

      {/* Modals */}
      {showQrModal && (
        <NovaBottomSheet
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title={t('profile.qrCode')}
          showHandle
          showCloseButton
        >
          <div className="p-4 flex flex-col items-center">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-[var(--text-secondary)]">
                Loading...
              </div>
            )}
            <p className="text-sm text-[var(--text-secondary)] mt-4 text-center">
              {t('profile.qrCodeDesc')}
            </p>
          </div>
        </NovaBottomSheet>
      )}

      {showCallModal && (
        <NovaBottomSheet
          isOpen={!!showCallModal}
          onClose={() => setShowCallModal(null)}
          title={showCallModal === 'audio' ? t('common.audio') : t('common.video')}
          showHandle
          showCloseButton
        >
          <div className="p-4 space-y-4 text-center">
            <NovaAvatar
              src={profile.avatar}
              alt={profile.name}
              name={profile.name}
              size="xl"
            />
            <h3 className="text-lg font-semibold">{profile.name}</h3>
            <p className="text-[var(--text-secondary)]">{showCallModal === 'audio' ? t('common.audioCall') : t('common.videoCall')}</p>
            <div className="flex gap-3 justify-center">
              <NovaButton variant="danger" onClick={() => setShowCallModal(null)} className="w-14 h-14 rounded-full">
                <Phone className="w-6 h-6" />
              </NovaButton>
              {showCallModal === 'video' && (
                <NovaButton variant="accent" onClick={() => { setShowCallModal(null); setShowVideoCall(true); }} className="w-14 h-14 rounded-full">
                  <Video className="w-6 h-6" />
                </NovaButton>
              )}
            </div>
          </div>
        </NovaBottomSheet>
      )}

      {showVideoCall && (
        <VideoCallOverlay
          isOpen={showVideoCall}
          onClose={() => setShowVideoCall(false)}
          mode="video"
          localStream={null}
          remoteStream={null}
        />
      )}

      {showQrModal && (
        <NovaBottomSheet
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          title={t('profile.qrCode')}
          showHandle
          showCloseButton
        >
          <div className="p-4 flex flex-col items-center">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-[var(--text-secondary)]">
                Loading...
              </div>
            )}
            <p className="text-sm text-[var(--text-secondary)] mt-4 text-center">
              {t('profile.qrCodeDesc')}
            </p>
            <div className="flex gap-2 mt-4">
              <NovaButton variant="ghost" onClick={() => setShareContactOpen(true)} className="flex-1">
                <Share2 className="w-4 h-4 mr-2" />
                {t('common.share')}
              </NovaButton>
              <NovaButton variant="accent" onClick={openQr} className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                {t('common.save')}
              </NovaButton>
            </div>
          </div>
        </NovaBottomSheet>
      )}

      {showSafetyModal && (
        <NovaBottomSheet
          isOpen={showSafetyModal}
          onClose={() => setShowSafetyModal(false)}
          title={t('profile.safetyNumber')}
          showHandle
          showCloseButton
        >
          <div className="p-4 space-y-4">
            <p className="text-[var(--text-secondary)]">{t('profile.safetyNumberDesc')}</p>
            <div className="font-mono text-xl tracking-wider text-center bg-[var(--bg-field)] p-4 rounded-xl whitespace-pre-wrap break-words">
              {safetyEmoji}
            </div>
            {safetyQrUrl ? (
              <img src={safetyQrUrl} alt="Safety Number QR" className="w-48 h-48 mx-auto" />
            ) : (
              <div className="w-48 h-48 mx-auto flex items-center justify-center text-[var(--text-secondary)]">
                Loading...
              </div>
            )}
            <p className="text-sm text-[var(--text-secondary)] text-center">
              {t('profile.safetyNumberVerify')}
            </p>
          </div>
        </NovaBottomSheet>
      )}

      {showDeviceLinkModal && (
        <NovaBottomSheet
          isOpen={showDeviceLinkModal}
          onClose={() => {
            stopCameraScan();
            setShowDeviceLinkModal(false);
          }}
          title={t('profile.linkDevice')}
          showHandle
          showCloseButton
        >
          <div className="p-4 space-y-4">
            {deviceLinkMode === 'primary' ? (
              <>
                <p className="text-[var(--text-secondary)]">{t('profile.deviceLinkPrimaryDesc')}</p>
                <div className="flex flex-col items-center gap-4">
                  {deviceLinkQrUrl ? (
                    <img src={deviceLinkQrUrl} alt="Device Link QR" className="w-48 h-48" />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center text-[var(--text-secondary)]">
                      Loading...
                    </div>
                  )}
                  <div className="bg-[var(--bg-field)] p-3 rounded-xl text-center text-sm font-mono tracking-wider">
                    {deviceLinkCode}
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(deviceLinkUrl, 'device-link', t('profile.linkCopied'))}
                  className="w-full px-4 py-2 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white hover:bg-[var(--bg-soft)] transition-colors"
                >
                  {t('profile.copyLink')}
                </button>
              </>
            ) : (
              <>
                <p className="text-[var(--text-secondary)]">{t('profile.deviceLinkJoinDesc')}</p>
                <input
                  type="text"
                  value={deviceLinkOfferInput}
                  onChange={(e) => setDeviceLinkOfferInput(e.target.value)}
                  placeholder={t('profile.pasteLinkPlaceholder')}
                  className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
                />
                <div className="flex gap-2">
                  <NovaButton variant="ghost" onClick={() => { stopCameraScan(); setIsScanningCamera(true); }} className="flex-1">
                    <Camera className="w-4 h-4 mr-2" />
                    {t('profile.scanQR')}
                  </NovaButton>
                  <NovaButton variant="accent" onClick={handleJoinDeviceLink} className="flex-1">
                    {t('profile.join')}
                  </NovaButton>
                </div>
                {deviceLinkReply && (
                  <>
                    <div className="bg-[var(--bg-field)] p-3 rounded-xl text-sm font-mono tracking-wider">
                      {deviceLinkReply}
                    </div>
                    <button
                      onClick={() => copyToClipboard(deviceLinkReply, 'device-link-reply', t('profile.replyCopied'))}
                      className="w-full px-4 py-2 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white hover:bg-[var(--bg-soft)] transition-colors"
                    >
                      {t('profile.copyReply')}
                    </button>
                  </>
                )}
                {deviceLinkError && <p className="text-sm text-[var(--c-danger)]">{deviceLinkError}</p>}
              </>
            )}
          </div>
        </NovaBottomSheet>
      )}

      {showContactEdit && (
        <NovaBottomSheet
          isOpen={showContactEdit}
          onClose={() => setShowContactEdit(false)}
          title={t('profile.editContact')}
          showHandle
          showCloseButton
        >
          <div className="p-4 space-y-4">
            <input
              type="text"
              value={contactDraft.name}
              onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })}
              placeholder={t('profile.name')}
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
            />
            <input
              type="text"
              value={contactDraft.nickname}
              onChange={(e) => setContactDraft({ ...contactDraft, nickname: e.target.value })}
              placeholder={t('profile.nickname')}
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
            />
            <input
              type="tel"
              value={contactDraft.phone}
              onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })}
              placeholder={t('profile.phone')}
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
            />
            <div className="flex gap-2">
              <NovaButton variant="ghost" onClick={() => setShowContactEdit(false)} className="flex-1">
                {t('common.cancel')}
              </NovaButton>
              <NovaButton variant="accent" onClick={saveContactEdit} className="flex-1">
                {t('common.save')}
              </NovaButton>
            </div>
          </div>
        </NovaBottomSheet>
      )}

      {shareContactOpen && (
        <ContactShareModal
          isOpen={shareContactOpen}
          onClose={() => setShareContactOpen(false)}
          contact={{
            name: profile.name,
            nickname: profile.nickname,
            phone: profile.phone,
            avatar: profile.avatar,
            handle: profileId,
          }}
        />
      )}
    </div>
  );
};

ProfileScreen.displayName = 'ProfileScreen';