import React, { useState, useRef, useEffect } from 'react';
import { ScrollableRow, NovaSelectableButton } from '../lib/ui';
import {
  ArrowLeft,
  Share2,
  Edit2,
  MessageSquare,
  Phone,
  MoreHorizontal,
  QrCode,
  FileText,
  Key,
  Link2,
  Mic,
  Check,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Volume2,
  VolumeX,
  Sparkles,
} from 'lucide-react';
import { CONTACT_PROFILES, CURRENT_USER, KATIE_SHARED_MEDIA } from '../data/mockMessengerData';
import { VideoCallOverlay } from './VideoCallOverlay';
import { SharedMediaItem } from '../types/messenger';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { ContactShareModal } from './ContactShareModal';
import { toDataURL } from 'qrcode';

interface ProfileScreenProps {
  profileId: string;
  onBack: () => void;
  onOpenChat: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ profileId, onBack, onOpenChat }) => {
  const profile = CONTACT_PROFILES[profileId] || CONTACT_PROFILES['katie'];
  const isOwnProfile = profileId === CURRENT_USER.id;
  const initials = profile.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const { t } = useLanguage();
  const { identity } = useSecurity();
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links' | 'voice'>('media');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'photos' | 'videos'>('all');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const profileTabsRef = useRef<HTMLDivElement>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState<'audio' | null>(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'nickname' | 'phone' | null>(null);
  const [editableNickname, setEditableNickname] = useState<string | null>(null);
  const [editablePhone, setEditablePhone] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');
  const [shareContactOpen, setShareContactOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showQrModal) setShowQrModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQrModal]);

  // Active Lightbox State
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [mediaToast, setMediaToast] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const triggerToast = (msg: string) => {
    setMediaToast(msg);
    setTimeout(() => setMediaToast(null), 2200);
  };

  const openQr = async () => {
    setShowQrModal(true);
    try {
      const url = await toDataURL(`https://nova.app/u/${profile.nickname.replace('@', '')}`, {
        width: 260,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(url);
    } catch {
      setQrDataUrl(null);
    }
  };

  const saveField = () => {
    if (editingField === 'nickname') setEditableNickname(fieldDraft);
    if (editingField === 'phone') setEditablePhone(fieldDraft);
    setEditingField(null);
    setFieldDraft('');
  };

  const cancelEdit = () => {
    setEditingField(null);
    setFieldDraft('');
  };

  // Filtered Media
  const allMediaItems: SharedMediaItem[] = profile.sharedMedia || (isOwnProfile ? [] : KATIE_SHARED_MEDIA);
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
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-[var(--nova-accent-color)]/40 text-white text-xs px-4 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <Check className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
          <span>{mediaToast}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="pt-4 px-5 pb-2 flex items-center justify-between shrink-0">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#181920]/90 hover:bg-[#22242e] border border-white/5 flex items-center justify-center text-white/90 active:scale-90 transition cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => triggerToast('Contact edit modal')}
            className="w-10 h-10 rounded-full bg-[#181920]/90 hover:bg-[#22242e] border border-white/5 flex items-center justify-center text-white/90 active:scale-90 transition cursor-pointer"
            title={t('common.edit')}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShareContactOpen(true)}
            className="w-10 h-10 rounded-full bg-[#181920]/90 hover:bg-[#22242e] border border-white/5 flex items-center justify-center text-white/90 active:scale-90 transition cursor-pointer"
            title={t('common.share')}
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Avatar & Profile Hero */}
      <div className="flex flex-col items-center pt-2 pb-5 px-5">
        <div className="w-24 h-24 rounded-full overflow-hidden p-1 bg-gradient-to-tr from-[#252834] via-[#323644] to-[var(--nova-accent-color)]/40 shadow-xl shadow-black/80 mb-3 relative">
          <img
            src={profile.avatar}
            alt={profile.name}
            className="w-full h-full rounded-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="w-full h-full rounded-full bg-[var(--nova-accent-color)] flex items-center justify-center font-bold text-2xl text-white">
            {initials}
          </div>
        </div>

        <h1 className="text-xl font-bold text-white tracking-tight">
          {profile.name}
        </h1>
        <p className="text-xs text-[#828795] mt-0.5">
          {profile.status}
        </p>

        {/* 4 Quick Action Buttons */}
        <div className={`grid ${isOwnProfile ? 'grid-cols-1' : 'grid-cols-4'} gap-3 mt-6 w-full max-w-[340px]`}>
          {!isOwnProfile && (
          <button
            onClick={onOpenChat}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-[#181921] group-hover:bg-[var(--nova-accent-color)] group-hover:shadow-lg group-hover:shadow-[var(--nova-accent-color)]/25 border border-white/5 flex items-center justify-center transition duration-200 active:scale-90">
              <MessageSquare className="w-5 h-5 text-white/90 group-hover:text-white" />
            </div>
            <span className="text-[11px] font-medium text-[#868b98] group-hover:text-white transition">
              Message
            </span>
          </button>
          )}



          {/* More */}
          <button
            onClick={() => triggerToast('More profile options')}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-[#181921] group-hover:bg-[#252834] border border-white/5 flex items-center justify-center transition duration-200 active:scale-90">
              <MoreHorizontal className="w-5 h-5 text-white/90" />
            </div>
            <span className="text-[11px] font-medium text-[#868b98] group-hover:text-white transition">
              More
            </span>
          </button>
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
                  Nickname
                </p>
                <p className="text-[14px] font-semibold text-white tracking-wide mt-0.5">
                  {editableNickname ?? profile.nickname}
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
                      setFieldDraft(editableNickname ?? profile.nickname);
                      setEditingField('nickname');
                    }}
                    className="p-2 text-white/50 hover:text-white transition cursor-pointer"
                    title={t('common.edit')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={openQr}
                    className="p-2 text-white/50 hover:text-white transition cursor-pointer"
                    title={t('common.contact')}
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
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
                    Crypto ID
                  </p>
                  <p className="text-[14px] font-semibold text-white tracking-wide mt-0.5 truncate max-w-[200px]">
                    `nova_pk_${identity.fingerprint.slice(0, 8)}...${identity.fingerprint.slice(-8)}`
                  </p>
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(identity.fingerprint, 'fingerprint')}
                className="p-2 text-white/50 hover:text-white transition cursor-pointer"
                title={t('common.copy')}
              >
                {copiedField === 'fingerprint' ? (
                  <Check className="w-4 h-4 text-[var(--nova-accent-color)]" />
                ) : (
                  <Edit2 className="w-4 h-4" />
                )}
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
                  Additional phone
                </p>
                <p className="text-[14px] font-semibold text-[#cbd5e1] tracking-wide mt-0.5">
                  {editablePhone ?? (profile.phone || '—')}
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
                      setFieldDraft(editablePhone ?? (profile.phone || ''));
                      setEditingField('phone');
                    }}
                    className="p-2 text-white/50 hover:text-white transition cursor-pointer"
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
            Media
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'media' ? 'bg-black/30 text-white' : 'text-[#6a6f7b]'}`}>
              {profile.mediaCount}
            </span>
          </NovaSelectableButton>

          <NovaSelectableButton
            selected={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
          >
            Files
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'files' ? 'bg-black/30 text-white' : 'text-[#6a6f7b]'}`}>
              {profile.filesCount}
            </span>
          </NovaSelectableButton>

          <NovaSelectableButton
            selected={activeTab === 'links'}
            onClick={() => setActiveTab('links')}
          >
            Links
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'links' ? 'bg-black/30 text-white' : 'text-[#6a6f7b]'}`}>
              {profile.linksCount}
            </span>
          </NovaSelectableButton>

          <NovaSelectableButton
            selected={activeTab === 'voice'}
            onClick={() => setActiveTab('voice')}
          >
            Voice
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
                  All ({allMediaItems.length})
                </button>
                <button
                  onClick={() => setMediaFilter('photos')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                    mediaFilter === 'photos'
                      ? 'bg-[#222430] text-white shadow-sm'
                      : 'text-[#828795] hover:text-white'
                  }`}
                >
                  Photos ({photosCount})
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
                  Videos ({videosCount})
                </button>
              </div>

              <span className="text-[10px] text-[#636875]">From chat history</span>
            </div>

            {/* Media Grouped by Month */}
            {Object.keys(groupedMedia).map((month) => (
              <div key={month} className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-[11px] font-bold text-[#828795] tracking-wider uppercase">
                    {month}
                  </h3>
                  <span className="text-[10px] text-[#555a66]">
                    {groupedMedia[month].length} items
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {groupedMedia[month].map((item) => {
                    const globalIndex = filteredMedia.findIndex((m) => m.id === item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedMediaIndex(globalIndex);
                          setIsVideoPlaying(true);
                        }}
                        className="aspect-square rounded-2xl overflow-hidden bg-[#181921] border border-white/5 relative group cursor-pointer active:scale-95 transition shadow-sm hover:border-white/20"
                      >
                        <img
                          src={item.type === 'video' ? item.thumbnail || item.url : item.url}
                          alt={item.caption || 'Shared media'}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          loading="lazy"
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
                      </div>
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
                  onClick={() => triggerToast(`Downloading ${file.name}...`)}
                  className="text-xs text-[var(--nova-accent-color)] hover:underline cursor-pointer"
                >
                  Download
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
              <div
                key={i}
                onClick={() => {
                  copyToClipboard(link.url, `link-${i}`);
                  triggerToast('Link copied to clipboard');
                }}
                className="p-3 bg-[#181921] rounded-2xl border border-white/5 flex items-center gap-3 hover:border-white/20 transition cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#20222b] text-[var(--nova-accent-color)] flex items-center justify-center">
                  <Link2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{link.title}</p>
                  <p className="text-[10px] text-[#717682] truncate">{link.url}</p>
                </div>
              </div>
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
                    <p className="text-xs font-semibold text-white">Voice message ({voice.duration})</p>
                    <p className="text-[10px] text-[#717682]">{voice.date}</p>
                  </div>
                </div>
                <button
                  onClick={() => triggerToast(`Playing voice note (${voice.duration})...`)}
                  className="text-xs text-white/70 hover:text-white px-2.5 py-1 bg-white/5 rounded-lg active:scale-95 transition cursor-pointer"
                >
                  Play
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div
          role="dialog"
          aria-modal="true"
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
              <img
                src={profile.avatar}
                alt=""
                className="w-full h-full rounded-full object-cover"
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
        contactAvatar={profile.avatar}
      />

      {/* FULL-FEATURED MEDIA LIGHTBOX (PHOTOS & VIDEOS) */}
      {activeMediaItem && (
        <div
          onClick={() => setSelectedMediaIndex(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 animate-in fade-in"
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
                    <Play className="w-2.5 h-2.5 fill-current" /> Video
                  </>
                ) : (
                  <>
                    <Sparkles className="w-2.5 h-2.5" /> Photo
                  </>
                )}
              </span>
              <span className="text-xs text-white/60">
                {selectedMediaIndex! + 1} of {filteredMedia.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerToast('Shared to clipboard');
                }}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title={t('common.share')}
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerToast('Downloaded to camera roll');
                }}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title={t('common.save')}
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMediaIndex(null);
                }}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title={t('common.close')}
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
                className="absolute left-1 z-20 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 flex items-center justify-center active:scale-90 transition cursor-pointer"
                title={t('common.previous')}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Next Button */}
            {filteredMedia.length > 1 && (
              <button
                onClick={handleNextMedia}
                className="absolute right-1 z-20 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 flex items-center justify-center active:scale-90 transition cursor-pointer"
                title={t('common.next')}
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
                      className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)] text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      {isVideoPlaying ? (
                        <Pause className="w-4 h-4 fill-white" />
                      ) : (
                        <Play className="w-4 h-4 fill-white ml-0.5" />
                      )}
                    </button>
                    <div>
                      <span className="text-[11px] font-semibold text-white block">
                        {isVideoPlaying ? 'Playing' : 'Paused'}
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
                      className="p-2 text-white/70 hover:text-white transition cursor-pointer"
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
                <img
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
                  {activeMediaItem.caption || 'Shared Media'}
                </p>
                <p className="text-[10px] text-[#868b98]">
                  {activeMediaItem.date} · Shared with {profile.name}
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
                <span>Show in Chat</span>
              </button>
            </div>

            {/* Chat Context Snippet */}
            {activeMediaItem.chatMessageSnippet && (
              <div className="bg-black/30 rounded-xl p-2 border border-white/5 flex items-center gap-2">
                <span className="text-[10px] text-[var(--nova-accent-color)] font-semibold shrink-0">
                  Chat Context:
                </span>
                <span className="text-[11px] text-white/80 italic truncate">
                  "{activeMediaItem.chatMessageSnippet}"
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      <ContactShareModal
        isOpen={shareContactOpen}
        onClose={() => setShareContactOpen(false)}
        contactName={profile.name}
        contactId={profileId}
        onShared={(sharedId) => {
          triggerToast(`Contact ID shared: ${sharedId}`);
        }}
      />
    </div>
  );
};
