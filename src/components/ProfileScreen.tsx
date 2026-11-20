import React, { useState, useRef, useEffect } from 'react';
import { ScrollableRow, NovaSelectableButton, NovaModal, NovaMenu } from '../lib/ui';
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
  const profileTabsRef = useRef<HTMLDivElement>(null);
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
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const touchStartXRef = useRef<number | null>(null);

  const updateAvatarEverywhere = (value: string) => {
    setAvatar(value);
    setAvatarLoadFailed(false);
    if (isOwnProfile) {
      updateAccount({ avatar: value });
      return;
    }
    if (CONTACT_PROFILES[profileId]) {
      saveContactOverride(profileId, { avatar: value });
      setContactOverride((prev) => ({ ...prev, avatar: value }));
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      updateAvatarEverywhere(objectUrl);
    } catch {
      void 0;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (dataUrl) {
        updateAvatarEverywhere(dataUrl);
      }
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          void 0;
        }
      }
    };
    reader.readAsDataURL(file);
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
    // Generate a real one-time X25519 offer; the QR carries the ephemeral
    // public key so the new device can complete the handshake without a server.
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

  // Active Lightbox State
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

  // Secondary device: paste the primary's link, derive a reply to hand back.
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

  // Primary device: accept the reply, which completes the X25519 handshake.
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

      // Live encrypted history sync over session
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

  // Filtered Media
  const allMediaItems: SharedMediaItem[] = profile.sharedMedia ?? [];
  const filteredMedia = allMediaItems.filter((item) => {
    if (mediaFilter === 'photos') return item.type === 'image';
    if (mediaFilter === 'videos') return item.type === 'video';
    return true;
  });

  const photosCount = allMediaItems.filter((m) => m.type === 'image').length;
  const videosCount = allMediaItems.filter((m) => m.type === 'video').length;

  // Group media by month
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

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white relative select-none overflow-y-auto no-scrollbar pb-10">
      {/* Toast Notification */}
      {mediaToast && (
        <div className="pointer-events-none fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-[var(--nova-accent-color)]/40 text-white text-xs px-4 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <Check className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
          <span>{mediaToast}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div
        data-testid="profile-header"
        className="sticky top-0 z-30 bg-[#0b0c10]/92 backdrop-blur-md px-4 pt-3 pb-2 flex items-center justify-between shrink-0"
      >
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-full bg-[#181920]/90 hover:bg-[#22242e] border border-white/5 flex items-center justify-center text-white/90 active:scale-90 transition cursor-pointer"
          title={t('common.back')}
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (isOwnProfile) {
                setNameDraft(profile.name);
                setEditingName(true);
              } else {
                openContactEdit();
              }
            }}
            className="w-11 h-11 rounded-full bg-[#181920]/90 hover:bg-[#22242e] border border-white/5 flex items-center justify-center text-white/90 active:scale-90 transition cursor-pointer"
            title={isOwnProfile ? t('profile.editProfile') : t('profile.editContact')}
            aria-label={isOwnProfile ? t('profile.editProfile') : t('profile.editContact')}
          >
            <Edit2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShareContactOpen(true)}
            className="w-11 h-11 rounded-full bg-[#181920]/90 hover:bg-[#22242e] border border-white/5 flex items-center justify-center text-white/90 active:scale-90 transition cursor-pointer"
            title={t('common.share')}
            aria-label={t('common.share')}
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Avatar & Profile Hero */}
      <div className="flex flex-col items-center pt-2 pb-5 px-5">
        <div className="relative mb-3">
          <div className="w-24 h-24 rounded-full overflow-hidden p-1 bg-gradient-to-tr from-[#252834] via-[#323644] to-[var(--nova-accent-color)]/40 shadow-xl shadow-black/80">
            {avatar && !avatarLoadFailed ? (
              <LazyMedia
                src={avatar}
                alt={profile.name}
                className="w-full h-full rounded-full object-cover"
                eager
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <div className="w-full h-full rounded-full bg-[var(--nova-accent-color)] flex items-center justify-center font-bold text-2xl text-white">
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
                className="hidden"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-[var(--nova-accent-color)] text-white flex items-center justify-center shadow-lg active:scale-90 transition cursor-pointer"
                title={t('profile.changeAvatar')}
                aria-label={t('profile.changeAvatar')}
              >
                <Edit2 className="w-4 h-4" />
              </button>
              {avatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="absolute -top-1 -right-1 w-9 h-9 rounded-full bg-black/80 border border-white/10 text-white flex items-center justify-center shadow-lg active:scale-90 transition cursor-pointer"
                  title={t('profile.removeAvatar')}
                  aria-label={t('profile.removeAvatar')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>

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
              className="w-44 px-3 py-1.5 rounded-xl bg-[#181920] border border-[var(--nova-accent-color)]/50 text-sm font-semibold text-white text-center outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const next = nameDraft.trim();
                if (next) updateAccount({ displayName: next });
                setEditingName(false);
              }}
              className="p-1.5 rounded-lg bg-[var(--nova-accent-color)] text-white transition hover:opacity-90"
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
        <p className="text-xs text-[#828795] mt-0.5">
          {profile.status}
        </p>

        {/* Quick Action Buttons */}
        <div className={`grid ${isOwnProfile ? 'grid-cols-1' : 'grid-cols-4'} gap-3 mt-6 w-full max-w-[360px]`}>
          {!isOwnProfile && (
          <button
            onClick={onOpenChat}
            className="flex flex-col items-center gap-1.5 group cursor-pointer min-h-[76px]"
            aria-label={t('profile.message')}
          >
            <div className="w-14 h-14 rounded-full bg-[#181921] group-hover:bg-[var(--nova-accent-color)] group-hover:shadow-lg group-hover:shadow-[var(--nova-accent-color)]/25 border border-white/5 flex items-center justify-center transition duration-200 active:scale-90">
              <MessageSquare className="w-5 h-5 text-white/90 group-hover:text-white" />
            </div>
            <span className="text-xs font-medium text-[#868b98] group-hover:text-white transition">
              {t('profile.message')}
            </span>
          </button>
          )}

          {/* Audio call */}
          {!isOwnProfile && (
            <button
              onClick={() => setShowCallModal('audio')}
              className="flex flex-col items-center gap-1.5 group cursor-pointer min-h-[76px]"
              aria-label={t('common.audio')}
            >
              <div className="w-14 h-14 rounded-full bg-[#181921] group-hover:bg-[var(--nova-accent-color)] group-hover:shadow-lg group-hover:shadow-[var(--nova-accent-color)]/25 border border-white/5 flex items-center justify-center transition duration-200 active:scale-90">
                <Phone className="w-5 h-5 text-white/90 group-hover:text-white" />
              </div>
              <span className="text-xs font-medium text-[#868b98] group-hover:text-white transition">
                {t('common.audio')}
              </span>
            </button>
          )}

          {/* Video call */}
          {!isOwnProfile && (
            <button
              onClick={() => setShowVideoCall(true)}
              className="flex flex-col items-center gap-1.5 group cursor-pointer min-h-[76px]"
              aria-label={t('common.video')}
            >
              <div className="w-14 h-14 rounded-full bg-[#181921] group-hover:bg-[var(--nova-accent-color)] group-hover:shadow-lg group-hover:shadow-[var(--nova-accent-color)]/25 border border-white/5 flex items-center justify-center transition duration-200 active:scale-90">
                <Video className="w-5 h-5 text-white/90 group-hover:text-white" />
              </div>
              <span className="text-xs font-medium text-[#868b98] group-hover:text-white transition">
                {t('common.video')}
              </span>
            </button>
          )}

          {/* More: the contact actions open next to this button, not as a
              screen-wide sheet. */}
          <NovaMenu
            label={t('profile.contactOptions')}
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
              <button
                type="button"
                onClick={() => {
                  if (!isOwnProfile) return;
                  if (onOpenSettings) {
                    onOpenSettings();
                    return;
                  }
                  triggerToast(t('common.more'));
                }}
                className="flex flex-col items-center gap-1.5 group cursor-pointer min-h-[76px]"
                aria-label={isOwnProfile ? t('settings.title') : t('common.more')}
              >
                <div className="w-14 h-14 rounded-full bg-[#181921] group-hover:bg-[#252834] border border-white/5 flex items-center justify-center transition duration-200 active:scale-90">
                  <MoreHorizontal className="w-5 h-5 text-white/90" />
                </div>
                <span className="text-xs font-medium text-[#868b98] group-hover:text-white transition">
                  {isOwnProfile ? t('settings.title') : t('common.more')}
                </span>
              </button>
            }
          />
        </div>
      </div>

      {/* Contact Details Card */}
      <div className="px-5 mb-4">
        <div className="bg-[#171820]/95 border border-white/5 rounded-[24px] p-4 space-y-4 shadow-md shadow-black/50">

          <div className="h-[1px] bg-white/[0.04]" />

          {/* Nickname row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#20222a] border border-white/5 flex items-center justify-center text-[var(--nova-accent-color)] font-semibold text-sm">
                @
              </div>
              <div>
                <p className="text-[11px] text-[#787d8a] font-normal leading-tight">
                  {t('profile.nickname')}
                </p>
                <p className="text-[14px] font-semibold text-white tracking-wide mt-0.5">
                  {profile.nickname}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {editingField === 'nickname' ? (
                <>
                  <input
                    value={fieldDraft}
                    onChange={(e) => setFieldDraft(e.target.value)}
                    autoFocus
                    className="w-32 px-2 py-1.5 rounded-lg bg-[#181920] border border-white/10 text-[11px] text-white outline-none focus:border-[var(--nova-accent-color)]"
                  />
                  <button
                    onClick={saveField}
                    className="p-1.5 rounded-lg bg-[var(--nova-accent-color)] text-white hover:opacity-90 transition cursor-pointer"
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
            </div>
          </div>

          {/* Handle row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#20222a] border border-white/5 flex items-center justify-center text-[var(--nova-accent-color)] font-semibold text-sm">
                @
              </div>
              <div>
                <p className="text-[11px] text-[#787d8a] font-normal leading-tight">
                  {t('profile.handle')}
                </p>
                <p className="text-[14px] font-semibold text-white tracking-wide mt-0.5">
                  {isOwnProfile && ownHandle
                    ? ownHandle
                    : `nova://${(profile.nickname || profile.name).replace('@', '').toLowerCase().slice(0, 12)}`}
                </p>
              </div>
            </div>
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
                <Check className="w-4 h-4 text-[var(--nova-accent-color)]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Crypto ID row */}
          {isOwnProfile && identity && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#20222a] border border-white/5 flex items-center justify-center text-[var(--nova-accent-color)] font-semibold text-sm">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-[#787d8a] font-normal leading-tight">
                    {t('profile.cryptoId')}
                  </p>
                  <p className="text-[14px] font-semibold text-white tracking-wide mt-0.5 truncate max-w-[200px]">
                    {`nova_pk_${identity.fingerprint.slice(0, 8)}...${identity.fingerprint.slice(-8)}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(identity.fingerprint, 'fingerprint')}
                className="p-2.5 text-white/50 hover:text-white transition cursor-pointer"
                title={t('common.copy')}
                aria-label={t('common.copy')}
              >
                {copiedField === 'fingerprint' ? (
                  <Check className="w-4 h-4 text-[var(--nova-accent-color)]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          )}

          {/* Device linking row */}
          {isOwnProfile && identity && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#20222a] border border-white/5 flex items-center justify-center text-[var(--nova-accent-color)] font-semibold text-sm">
                  <Link2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-[#787d8a] font-normal leading-tight">
                    {t('profile.linkedDevices')}
                  </p>
                  <p className="text-[14px] font-semibold text-white tracking-wide mt-0.5">
                    {1 + linkedDeviceCount === 1
                      ? t('profile.deviceOne')
                      : t('profile.devicesMany', { count: 1 + linkedDeviceCount })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDeviceLinkModal(true)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] text-xs font-semibold hover:bg-[var(--nova-accent-color)]/25 transition cursor-pointer"
                title={t('profile.linkDevice')}
                aria-label={t('profile.linkDevice')}
              >
                {t('profile.linkDevice')}
              </button>
            </div>
          )}

          {/* Safety number row */}
          {isOwnProfile && identity && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#20222a] border border-white/5 flex items-center justify-center text-[var(--nova-accent-color)] font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-[#787d8a] font-normal leading-tight flex items-center gap-1">
                    {t('profile.safetyNumber')}
                    {!p2pManager && (
                      <span className="text-[10px] font-bold text-[#ff5f2e] bg-[#ff5f2e]/10 px-2 py-0.5 rounded">
                        DEMO
                      </span>
                    )}
                  </p>
                  <p className="text-[14px] font-semibold text-white tracking-wide mt-0.5">
                    {safetyEmoji}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSafetyModal(true)}
                className="p-2.5 text-white/50 hover:text-white transition cursor-pointer"
                title={t('profile.safetyNumber')}
                aria-label={t('profile.safetyNumber')}
              >
                <QrCode className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="h-[1px] bg-white/[0.04]" />

          {/* Additional phone (optional, not used for lookup — search by ID) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#20222a] border border-white/5 flex items-center justify-center text-[#6a6f7b]">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] text-[#6a6f7b] font-normal leading-tight">
                  {t('profile.additionalPhone')}
                </p>
                <p className="text-[14px] font-semibold text-[#cbd5e1] tracking-wide mt-0.5">
                  {profile.phone || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {editingField === 'phone' ? (
                <>
                  <input
                    value={fieldDraft}
                    onChange={(e) => setFieldDraft(e.target.value)}
                    autoFocus
                    inputMode="numeric"
                    className="w-32 px-2 py-1.5 rounded-lg bg-[#181920] border border-white/10 text-[11px] text-white outline-none focus:border-[var(--nova-accent-color)]"
                  />
                  <button
                    onClick={saveField}
                    className="p-1.5 rounded-lg bg-[var(--nova-accent-color)] text-white hover:opacity-90 transition cursor-pointer"
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
            </div>
          </div>
          <div className="h-[1px] bg-white/[0.04]" />
        </div>
      </div>

      {/* Main Tabs Selector: Media, Files, Links, Voice */}
      <div className="px-5 mb-3">
        <ScrollableRow ref={profileTabsRef} wheelScroll={true} gap="2" data-testid="profile-tabs" className="">
          <NovaSelectableButton
            selected={activeTab === 'media'}
            onClick={() => setActiveTab('media')}
          >
            {t('common.media')}
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'media' ? 'bg-black/30 text-white' : 'text-[#6a6f7b]'}`}>
              {profile.mediaCount}
            </span>
          </NovaSelectableButton>

          <NovaSelectableButton
            selected={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
          >
            {t('common.files')}
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'files' ? 'bg-black/30 text-white' : 'text-[#6a6f7b]'}`}>
              {profile.filesCount}
            </span>
          </NovaSelectableButton>

          <NovaSelectableButton
            selected={activeTab === 'links'}
            onClick={() => setActiveTab('links')}
          >
            {t('common.links')}
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'links' ? 'bg-black/30 text-white' : 'text-[#6a6f7b]'}`}>
              {profile.linksCount}
            </span>
          </NovaSelectableButton>

          <NovaSelectableButton
            selected={activeTab === 'voice'}
            onClick={() => setActiveTab('voice')}
          >
            {t('common.voice')}
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'voice' ? 'bg-black/30 text-white' : 'text-[#6a6f7b]'}`}>
              {profile.voiceCount}
            </span>
          </NovaSelectableButton>
        </ScrollableRow>
      </div>

      {/* Tab Content */}
      <div className="px-5">
        {/* MEDIA TAB CONTENT */}
        {activeTab === 'media' && (
          <div className="space-y-4">
            {/* Secondary Media Category Sub-filters (All, Photos, Videos) */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-1.5 bg-[#14151b] p-1 rounded-xl border border-white/[0.04]">
                <button
                  onClick={() => setMediaFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                    mediaFilter === 'all'
                      ? 'bg-[#222430] text-white shadow-sm'
                      : 'text-[#828795] hover:text-white'
                  }`}
                >
                  {t('common.all')} ({allMediaItems.length})
                </button>
                <button
                  onClick={() => setMediaFilter('photos')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                    mediaFilter === 'photos'
                      ? 'bg-[#222430] text-white shadow-sm'
                      : 'text-[#828795] hover:text-white'
                  }`}
                >
                  {t('profile.photos')} ({photosCount})
                </button>
                <button
                  onClick={() => setMediaFilter('videos')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                    mediaFilter === 'videos'
                      ? 'bg-[#222430] text-white shadow-sm'
                      : 'text-[#828795] hover:text-white'
                  }`}
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  {t('profile.videos')} ({videosCount})
                </button>
              </div>

              <span className="text-[10px] text-[#636875]">{t('profile.fromChatHistory')}</span>
            </div>

            {filteredMedia.length === 0 && (
              <div
                data-testid="profile-media-empty"
                className="py-12 text-center text-[#6a6f7b] text-xs"
              >
                {t('profile.noSharedMedia')}
              </div>
            )}

            {/* Media Grouped by Month */}
            {Object.keys(groupedMedia).map((month) => (
              <div key={month} className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-[11px] font-bold text-[#828795] tracking-wider uppercase">
                    {month}
                  </h3>
                  <span className="text-[10px] text-[#555a66]">
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
                        className="aspect-square rounded-2xl overflow-hidden bg-[#181921] border border-white/5 relative group cursor-pointer active:scale-95 transition shadow-sm hover:border-white/20"
                      >
                        <LazyMedia
                          src={item.type === 'video' ? item.thumbnail || item.url : item.url}
                          alt={item.caption || t('profile.sharedMedia')}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />

                        {/* Video Specific Badges & Overlays */}
                        {item.type === 'video' ? (
                          <>
                            {/* Subtle dark gradient scrim */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

                            {/* Center Play Icon circle */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-xs flex items-center justify-center text-white border border-white/20 group-hover:bg-[var(--nova-accent-color)] group-hover:scale-110 transition duration-200">
                                <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                              </div>
                            </div>

                            {/* Duration pill in bottom left */}
                            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white border border-white/10">
                              <Play className="w-2.5 h-2.5 fill-white" />
                              <span>{item.duration || '0:30'}</span>
                            </div>
                          </>
                        ) : (
                          /* Photo Hover Highlight */
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 pointer-events-none">
                            <span className="text-[10px] text-white/90 truncate font-medium">
                              {item.date}
                            </span>
                          </div>
                        )}
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
          <div className="space-y-2">
            {[
              { name: 'Trip_Schedule_Kyiv.pdf', size: '2.4 MB', date: 'Yesterday' },
              { name: 'Hotel_Reservation.pdf', size: '640 KB', date: '3 days ago' },
              { name: 'Photos_Archive.zip', size: '48.1 MB', date: 'Oct 28' },
            ].map((file, i) => (
              <div
                key={i}
                className="p-3 bg-[#181921] rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white truncate max-w-[180px]">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-[#717682]">{file.size} · {file.date}</p>
                  </div>
                </div>
                <button
                  onClick={() => triggerToast(t('profile.downloading', { name: file.name }))}
                  className="min-h-[40px] px-3 text-xs text-[var(--nova-accent-color)] hover:underline cursor-pointer"
                  aria-label={t('profile.download')}
                >
                  {t('profile.download')}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* LINKS TAB CONTENT */}
        {activeTab === 'links' && (
          <div className="space-y-2">
            {[
              { title: 'Harry’s Bar & Kitchen', url: 'https://harrysbar.com', desc: 'Reservations and dinner menu' },
              { title: 'Kyiv Independent Digest', url: 'https://kyivindependent.com', desc: 'Summer editorial series' },
            ].map((link, i) => (
              <button
                type="button"
                key={i}
                onClick={() => {
                  void copyToClipboard(link.url, `link-${i}`, t('profile.linkCopied'));
                }}
                className="w-full p-3 bg-[#181921] rounded-2xl border border-white/5 flex items-center gap-3 hover:border-white/20 transition cursor-pointer text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-[#20222b] text-[var(--nova-accent-color)] flex items-center justify-center">
                  <Link2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{link.title}</p>
                  <p className="text-[10px] text-[#717682] truncate">{link.url}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* VOICE TAB CONTENT */}
        {activeTab === 'voice' && (
          <div className="space-y-2">
            {[
              { duration: '0:42', date: 'Today at 18:20' },
              { duration: '1:15', date: 'Yesterday at 14:10' },
            ].map((voice, i) => (
              <div
                key={i}
                className="p-3 bg-[#181921] rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)] text-white flex items-center justify-center">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {t('profile.voiceMessage', { duration: voice.duration })}
                    </p>
                    <p className="text-[10px] text-[#717682]">{voice.date}</p>
                  </div>
                </div>
                <button
                  onClick={() => triggerToast(t('profile.playingVoice', { duration: voice.duration }))}
                  className="min-h-[40px] text-xs text-white/70 hover:text-white px-3 py-2 bg-white/5 rounded-lg active:scale-95 transition cursor-pointer"
                  aria-label={t('profile.playVoice')}
                >
                  {t('profile.play')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div
          ref={qrDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="QR code"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in"
        >
          <div className="bg-[#181922] border border-white/10 rounded-3xl p-6 text-center max-w-xs w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-lg text-white">{profile.name}'s QR Code</h3>
            <div className="bg-white p-4 rounded-2xl inline-block shadow-inner flex items-center justify-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-lg" />
              ) : (
                <div className="w-48 h-48 bg-black flex items-center justify-center rounded-lg p-2 text-white">
                  <QrCode className="w-40 h-40 text-black stroke-black fill-black" />
                </div>
              )}
            </div>
            <p className="text-xs text-[#8c919d]">
              Scan to add {profile.nickname} to your contact list
            </p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-[var(--nova-accent-color)] text-white font-semibold text-xs rounded-xl hover:bg-[var(--nova-accent-color, ff5f2e)] transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Audio Calling Simulation Modal */}
      {showCallModal && (
        <div className="fixed inset-0 z-50 bg-[#0c0d12]/95 backdrop-blur-xl flex flex-col items-center justify-between py-16 px-6 animate-in fade-in">
          <div className="flex flex-col items-center space-y-3 mt-8">
            <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-[var(--nova-accent-color)] shadow-2xl p-1 animate-pulse">
              <LazyMedia
                src={avatar}
                alt=""
                className="w-full h-full rounded-full object-cover"
                eager
              />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {profile.name}
            </h2>
            <p className="text-sm text-[var(--nova-accent-color)] font-medium">Calling...</p>
          </div>

          <div className="flex items-center gap-6 mb-8">
            <button
              onClick={() => setShowCallModal(null)}
              className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-xl shadow-red-900/40 active:scale-95 transition cursor-pointer"
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <Phone className="w-6 h-6 rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}

      {/* Video Call Overlay (shared component) */}
      <VideoCallOverlay
        isOpen={showVideoCall}
        onEndCall={() => setShowVideoCall(false)}
        contactName={profile.name}
        contactAvatar={avatar}
      />

      {/* FULL-FEATURED MEDIA LIGHTBOX (PHOTOS & VIDEOS) */}
      {activeMediaItem && (
        <div
          data-testid="media-lightbox"
          onClick={() => setSelectedMediaIndex(null)}
          onTouchStart={handleMediaTouchStart}
          onTouchEnd={handleMediaTouchEnd}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 pt-[calc(var(--nova-safe-top)+0.5rem)] pb-[calc(var(--nova-safe-bottom)+0.5rem)] animate-in fade-in"
        >
          {/* Lightbox Top Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-between w-full max-w-md mx-auto pt-2 shrink-0 z-10"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/30 flex items-center gap-1">
                {activeMediaItem.type === 'video' ? (
                  <>
                    <Play className="w-2.5 h-2.5 fill-current" /> {t('common.video')}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-2.5 h-2.5" /> {t('common.photo')}
                  </>
                )}
              </span>
              <span className="text-xs text-white/60">
                {t('profile.mediaPosition', {
                  current: selectedMediaIndex! + 1,
                  total: filteredMedia.length,
                })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={shareMedia}
                className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title={t('common.share')}
                aria-label={t('common.share')}
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={downloadMedia}
                className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title={t('profile.download')}
                aria-label={t('profile.download')}
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMediaIndex(null);
                }}
                className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title={t('common.close')}
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lightbox Main Media View */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex-1 flex items-center justify-center max-w-md w-full mx-auto my-auto overflow-hidden py-4"
          >
            {/* Previous Button */}
            {filteredMedia.length > 1 && (
              <button
                onClick={handlePrevMedia}
                className="absolute left-1 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 flex items-center justify-center active:scale-90 transition cursor-pointer"
                title={t('common.previous')}
                aria-label={t('common.previous')}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Next Button */}
            {filteredMedia.length > 1 && (
              <button
                onClick={handleNextMedia}
                className="absolute right-1 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 flex items-center justify-center active:scale-90 transition cursor-pointer"
                title={t('common.next')}
                aria-label={t('common.next')}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            {/* Content: Video or Image */}
            {activeMediaItem.type === 'video' ? (
              <div className="relative w-full max-h-[65vh] rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl flex flex-col justify-center">
                <video
                  ref={videoRef}
                  src={activeMediaItem.url}
                  poster={activeMediaItem.thumbnail}
                  playsInline
                  autoPlay
                  loop
                  muted={isMuted}
                  className="w-full h-auto max-h-[58vh] object-contain rounded-2xl"
                  onClick={toggleVideoPlayback}
                />

                {/* Floating Video Controls Overlay */}
                <div className="absolute inset-x-3 bottom-3 bg-[#181922]/90 backdrop-blur-md rounded-2xl p-2.5 border border-white/10 flex items-center justify-between shadow-xl">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleVideoPlayback}
                      className="w-11 h-11 rounded-full bg-[var(--nova-accent-color)] text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
                      title={isVideoPlaying ? t('profile.pause') : t('profile.play')}
                      aria-label={isVideoPlaying ? t('profile.pause') : t('profile.play')}
                    >
                      {isVideoPlaying ? (
                        <Pause className="w-4 h-4 fill-white" />
                      ) : (
                        <Play className="w-4 h-4 fill-white ml-0.5" />
                      )}
                    </button>
                    <div>
                      <span className="text-[11px] font-semibold text-white block">
                        {isVideoPlaying ? t('profile.playing') : t('profile.paused')}
                      </span>
                      <span className="text-[10px] text-white/50">
                        {activeMediaItem.duration || '0:30'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMuted(!isMuted);
                      }}
                      className="w-11 h-11 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                      title={isMuted ? t('common.unmute') : t('common.mute')}
                      aria-label={isMuted ? t('common.unmute') : t('common.mute')}
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-red-400" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative max-w-sm w-full rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#14151b]">
                <LazyMedia
                  src={activeMediaItem.url}
                  alt={activeMediaItem.caption || ''}
                  className="w-full h-auto max-h-[65vh] object-cover rounded-3xl"
                />
              </div>
            )}
          </div>

          {/* Lightbox Bottom Info Bar with Chat Link */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md mx-auto bg-[#171822]/95 border border-white/10 rounded-2xl p-3.5 space-y-2 shrink-0 z-10 backdrop-blur-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-white tracking-wide">
                  {activeMediaItem.caption || t('profile.sharedMedia')}
                </p>
                <p className="text-[10px] text-[#868b98]">
                  {activeMediaItem.date} · {t('profile.sharedWith', { name: profile.name })}
                </p>
              </div>

              {/* Quick shortcut to open chat message */}
              <button
                onClick={() => {
                  setSelectedMediaIndex(null);
                  onOpenChat();
                }}
                className="px-2.5 py-1 bg-[#252834] hover:bg-[var(--nova-accent-color)] hover:text-white text-[var(--nova-accent-color)] text-[11px] font-medium rounded-lg border border-[var(--nova-accent-color)]/20 transition cursor-pointer flex items-center gap-1 active:scale-95 shrink-0"
              >
                <MessageSquare className="w-3 h-3" />
                <span>{t('profile.showInChat')}</span>
              </button>
            </div>

            {/* Chat Context Snippet */}
            {activeMediaItem.chatMessageSnippet && (
              <div className="bg-black/30 rounded-xl p-2 border border-white/5 flex items-center gap-2">
                <span className="text-[10px] text-[var(--nova-accent-color)] font-semibold shrink-0">
                  {t('profile.chatContext')}:
                </span>
                <span className="text-[11px] text-white/80 italic truncate">
                  "{activeMediaItem.chatMessageSnippet}"
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      {showSafetyModal && (
        <div
          ref={safetyDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('profile.safetyNumber')}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in"
        >
          <div className="bg-[#181922] border border-white/10 rounded-3xl p-6 text-center max-w-xs w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-lg text-white">Safety number</h3>
            <div className="bg-white p-4 rounded-2xl inline-block shadow-inner flex items-center justify-center">
              {safetyQrUrl ? (
                <img src={safetyQrUrl} alt="Safety QR" className="w-44 h-44 rounded-lg" />
              ) : (
                <div className="w-44 h-44 bg-black flex items-center justify-center rounded-lg">
                  <QrCode className="w-32 h-32 text-black" />
                </div>
              )}
            </div>
            <p className="text-xs text-[#8c919d]">
              Compare this safety number with your contact: {safetyEmoji}
            </p>
            <div className="space-y-2">
              <input
                data-testid="safety-compare-input"
                value={peerSafetyInput}
                onChange={(e) => setPeerSafetyInput(e.target.value)}
                placeholder="Paste contact safety number"
                className="w-full rounded-xl border border-white/10 bg-[#101118] px-3 py-2 text-xs text-white placeholder-white/30 focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
              />
              {peerSafetyInput.trim() && (
                <p
                  data-testid="safety-match-status"
                  className={`text-xs font-semibold ${
                    peerSafetyInput.replace(/\s+/g, '') === safetyEmoji.replace(/\s+/g, '')
                      ? 'text-emerald-400'
                      : 'text-red-400'
                  }`}
                >
                  {peerSafetyInput.replace(/\s+/g, '') === safetyEmoji.replace(/\s+/g, '')
                    ? 'Match'
                    : 'Mismatch'}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowSafetyModal(false)}
              className="w-full py-2.5 bg-[var(--nova-accent-color)] text-white font-semibold text-xs rounded-xl hover:bg-[var(--nova-accent-color, ff5f2e)] transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {showDeviceLinkModal && (
        <div
          ref={deviceLinkDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('profile.linkDevice')}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in"
        >
          <div className="bg-[#181922] border border-white/10 rounded-3xl p-6 text-center max-w-xs w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-lg text-white">Link a new device</h3>
            <div className="flex gap-1 p-1 bg-[#111218] border border-white/5 rounded-xl">
              <button
                onClick={() => {
                  setDeviceLinkMode('primary');
                  setDeviceLinkError(null);
                }}
                className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition cursor-pointer ${
                  deviceLinkMode === 'primary'
                    ? 'bg-[var(--nova-accent-color)]/20 text-white'
                    : 'text-[#8c919d] hover:text-white'
                }`}
              >
                This device
              </button>
              <button
                onClick={() => {
                  setDeviceLinkMode('join');
                  setDeviceLinkError(null);
                }}
                className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition cursor-pointer ${
                  deviceLinkMode === 'join'
                    ? 'bg-[var(--nova-accent-color)]/20 text-white'
                    : 'text-[#8c919d] hover:text-white'
                }`}
              >
                New device
              </button>
            </div>

            {deviceLinkMode === 'primary' ? (
              <>
                <div className="bg-white p-4 rounded-2xl inline-block shadow-inner flex items-center justify-center">
                  {deviceLinkQrUrl ? (
                    <img src={deviceLinkQrUrl} alt="Device link QR" className="w-44 h-44 rounded-lg" />
                  ) : (
                    <div className="w-44 h-44 bg-black flex items-center justify-center rounded-lg">
                      <QrCode className="w-32 h-32 text-black" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-[#8c919d]">
                  Scan this QR on your new device, or enter code: {deviceLinkCode}
                </p>
                {deviceLinkUrl && (
                  <div className="space-y-1 text-left">
                    <p className="text-[11px] text-[#787d8a]">
                      Or send this link to the new device:
                    </p>
                    <p
                      className="text-[10px] text-[#b8bcc6] break-all font-mono"
                      data-testid="device-link-url"
                    >
                      {deviceLinkUrl}
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-[#787d8a]">
                  Then paste the reply code shown on the new device.
                </p>
                <input
                  value={deviceLinkReplyInput}
                  onChange={(e) => setDeviceLinkReplyInput(e.target.value)}
                  placeholder="nova://device-link-response?…"
                  aria-label="Device link reply"
                  className="w-full px-3 py-2 bg-[#111218] border border-white/10 rounded-xl text-[11px] text-white placeholder:text-[#5c616d] outline-none focus:border-[var(--nova-accent-color)]/60"
                />
                <button
                  onClick={handleDeviceLinkReply}
                  className="w-full py-2.5 bg-[var(--nova-accent-color)] text-white font-semibold text-xs rounded-xl hover:bg-[var(--nova-accent-color, ff5f2e)] transition cursor-pointer"
                >
                  Complete linking
                </button>
                {linkedDeviceCount > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-emerald-400">
                      Handshake complete — {linkedDeviceCount} device
                      {linkedDeviceCount === 1 ? '' : 's'} linked.
                    </p>
                    {historySyncStatus === 'syncing' && (
                      <p className="text-[10.5px] text-[#8c919d] animate-pulse">
                        Transferring encrypted history...
                      </p>
                    )}
                    {historySyncStatus === 'synced' && historySyncCount && (
                      <p className="text-[10.5px] text-emerald-400/90 font-medium">
                        ✓ History synced ({historySyncCount.chats} chats, {historySyncCount.messages} messages)
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={isScanningCamera ? stopCameraScan : startCameraScan}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer border border-white/10"
                    data-testid="toggle-camera-scan"
                  >
                    <Camera className="w-4 h-4 text-[var(--nova-accent-color, #ff4e18)]" />
                    <span>{isScanningCamera ? 'Stop camera scan' : 'Scan QR with camera'}</span>
                  </button>

                  {isScanningCamera && (
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-white/15 flex items-center justify-center">
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        data-testid="camera-video-preview"
                      />
                      <div className="absolute inset-2 border-2 border-dashed border-[var(--nova-accent-color, #ff4e18)]/60 rounded-xl pointer-events-none" />
                      <button
                        type="button"
                        onClick={() => {
                          if (deviceLinkUrl) {
                            setDeviceLinkOfferInput(deviceLinkUrl);
                          }
                          stopCameraScan();
                        }}
                        className="absolute bottom-2 px-3 py-1 bg-[var(--nova-accent-color, #ff4e18)] text-white text-[11px] font-semibold rounded-lg shadow-md cursor-pointer"
                        data-testid="capture-qr-button"
                      >
                        Capture QR
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#8c919d]">
                  Or paste the link shown on your primary device:
                </p>
                <textarea
                  value={deviceLinkOfferInput}
                  onChange={(e) => setDeviceLinkOfferInput(e.target.value)}
                  placeholder="nova://device-link?…"
                  aria-label="Device link offer"
                  rows={3}
                  className="w-full px-3 py-2 bg-[#111218] border border-white/10 rounded-xl text-[11px] text-white placeholder:text-[#5c616d] outline-none focus:border-[var(--nova-accent-color)]/60 resize-none"
                />
                <button
                  onClick={handleJoinDeviceLink}
                  className="w-full py-2.5 bg-[var(--nova-accent-color)] text-white font-semibold text-xs rounded-xl hover:bg-[var(--nova-accent-color, ff5f2e)] transition cursor-pointer"
                >
                  Create reply code
                </button>
                {deviceLinkReply && (
                  <div className="space-y-2 text-left bg-[#111218] border border-white/10 rounded-xl p-3">
                    <p className="text-[11px] text-[#8c919d]">
                      Paste this reply code on the primary device to finish linking:
                    </p>
                    <p className="text-[10px] text-white break-all font-mono" data-testid="device-link-reply">
                      {deviceLinkReply}
                    </p>
                    <button
                      onClick={() => {
                        try {
                          void navigator.clipboard?.writeText(deviceLinkReply);
                          triggerToast('Reply code copied');
                        } catch {
                          triggerToast('Copy the reply code manually');
                        }
                      }}
                      className="w-full py-2 bg-white/5 text-white text-[11px] font-semibold rounded-lg hover:bg-white/10 transition cursor-pointer"
                    >
                      Copy reply code
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const offer = parseDeviceLinkOffer(deviceLinkOfferInput);
                        if (offer) {
                          void handleSyncHistoryOnSecondary(offer.code, offer.publicKey);
                        }
                      }}
                      className="w-full py-2 bg-[var(--nova-accent-color, #ff4e18)]/20 hover:bg-[var(--nova-accent-color, #ff4e18)]/30 text-white text-[11px] font-semibold rounded-lg transition cursor-pointer border border-[var(--nova-accent-color, #ff4e18)]/40"
                      data-testid="sync-history-secondary"
                    >
                      Sync history stream
                    </button>
                    {historySyncStatus === 'synced' && historySyncCount && (
                      <p className="text-[10.5px] text-emerald-400 font-medium text-center">
                        ✓ History synced ({historySyncCount.chats} chats, {historySyncCount.messages} messages)
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {deviceLinkError && (
              <p role="alert" className="text-[11px] text-red-400">
                {deviceLinkError}
              </p>
            )}
            <button
              onClick={() => {
                stopCameraScan();
                setShowDeviceLinkModal(false);
                setDeviceLinkReplyInput('');
                setDeviceLinkError(null);
                setDeviceLinkUrl('');
              }}
              className="w-full py-2.5 bg-white/5 text-white/70 font-semibold text-xs rounded-xl hover:bg-white/10 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {/* Contact edit modal */}
      <NovaModal
        isOpen={showContactEdit}
        onClose={() => setShowContactEdit(false)}
        title={t('profile.editContact')}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <label htmlFor="contact-edit-name" className="block space-y-1.5">
            <span className="text-xs font-medium text-[#8c919d]">{t('profile.name')}</span>
            <input
              id="contact-edit-name"
              value={contactDraft.name}
              onChange={(e) => setContactDraft((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#101118] border border-white/10 text-sm text-white outline-none focus:border-[var(--nova-accent-color)]/60"
            />
          </label>
          <label htmlFor="contact-edit-nickname" className="block space-y-1.5">
            <span className="text-xs font-medium text-[#8c919d]">{t('profile.nickname')}</span>
            <input
              id="contact-edit-nickname"
              value={contactDraft.nickname}
              onChange={(e) => setContactDraft((prev) => ({ ...prev, nickname: e.target.value }))}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#101118] border border-white/10 text-sm text-white outline-none focus:border-[var(--nova-accent-color)]/60"
            />
          </label>
          <label htmlFor="contact-edit-phone" className="block space-y-1.5">
            <span className="text-xs font-medium text-[#8c919d]">{t('profile.phone')}</span>
            <input
              id="contact-edit-phone"
              value={contactDraft.phone}
              onChange={(e) => setContactDraft((prev) => ({ ...prev, phone: e.target.value }))}
              inputMode="tel"
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#101118] border border-white/10 text-sm text-white outline-none focus:border-[var(--nova-accent-color)]/60"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowContactEdit(false)}
              className="flex-1 min-h-[44px] rounded-xl bg-white/[0.05] text-white/70 text-sm font-semibold hover:bg-white/[0.1] transition cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={saveContactEdit}
              className="flex-1 min-h-[44px] rounded-xl bg-[var(--nova-accent-color)] text-white text-sm font-semibold hover:opacity-90 transition cursor-pointer"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </NovaModal>

      <ContactShareModal
        isOpen={shareContactOpen}
        onClose={() => setShareContactOpen(false)}
        contactName={profile.name}
        contactId={profileId}
        onShared={() => {
          triggerToast(t('profile.contactIdCopied'));
        }}
      />
    </div>
  );
};
