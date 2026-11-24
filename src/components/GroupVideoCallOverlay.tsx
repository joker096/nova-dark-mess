import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Volume2,
  VolumeX,
  Sparkles,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Signal,
  Radio,
  Monitor,
  MonitorOff,
  Users,
  UserX,
  LayoutGrid,
  Settings,
  MoreHorizontal,
} from 'lucide-react';
import { useAccount } from '../hooks/useAccount';
import { useLanguage } from '../context/LanguageContext';
import { LazyMedia } from './LazyMedia';
import { GroupCallManager, GroupCallParticipant, GroupCallStatus } from '../lib/p2p/groupCall';

interface GroupVideoCallOverlayProps {
  isOpen: boolean;
  onEndCall: (durationFormatted: string) => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
  onMaximize?: () => void;
  /** Group call manager instance */
  callManager: GroupCallManager | null;
  /** Current call mode */
  mode?: 'voice' | 'video';
  /** True when media flows through a TURN relay */
  hidesIp?: boolean;
  /** Local user info for self-view */
  localName?: string;
  localAvatar?: string;
}

type VideoFilter = 'none' | 'studio' | 'cyber' | 'noir';

export const GroupVideoCallOverlay: React.FC<GroupVideoCallOverlayProps> = ({
  isOpen,
  onEndCall,
  onMinimize,
  isMinimized = false,
  onMaximize,
  callManager,
  mode = 'video',
  hidesIp = false,
  localName,
  localAvatar,
}) => {
  const { account } = useAccount();
  const { t } = useLanguage();
  const isVoiceCall = mode === 'voice';

  // Call state
  const [callDuration, setCallDuration] = useState<number>(0);
  const [callStatus, setCallStatus] = useState<GroupCallStatus>('idle');
  const [participants, setParticipants] = useState<Map<string, GroupCallParticipant>>(new Map());
  const [internalCameraOn, setInternalCameraOn] = useState<boolean>(true);
  const [internalMicOn, setInternalMicOn] = useState<boolean>(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [activeFilter, setActiveFilter] = useState<VideoFilter>('none');
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showParticipantList, setShowParticipantList] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [layout, setLayout] = useState<'grid' | 'speaker'>('speaker');
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);
  const [screenSharePreview, setScreenSharePreview] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const expandedVideoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioLevelIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [audioLevels, setAudioLevels] = useState<Map<string, number>>(new Map());

  // Sync with callManager
  useEffect(() => {
    if (!callManager) return;

    // Initial sync
    setCallStatus(callManager.getStatus());
    setParticipants(new Map(callManager.getParticipants()));

    const unsubStatus = callManager.onStatusChange(setCallStatus);
    const unsubParticipants = callManager.onParticipantsChange(setParticipants);
    const unsubLocalStream = callManager.onLocalStream((stream) => {
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    });
    const unsubScreenStream = callManager.onLocalScreenStream((stream) => {
      setScreenSharePreview(stream);
    });

    return () => {
      unsubStatus();
      unsubParticipants();
      unsubLocalStream();
      unsubScreenStream();
    };
  }, [callManager]);

  // Duration timer
  useEffect(() => {
    if (isOpen && callStatus === 'connected') {
      timerRef.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isOpen, callStatus]);

  // Audio level simulation for participants
  useEffect(() => {
    if (!isOpen || callStatus !== 'connected') return;

    participants.forEach((p, fingerprint) => {
      if (fingerprint === callManager?.getParticipants().keys().next().value) return; // Skip local
      if (audioLevelIntervalsRef.current.has(fingerprint)) return;

      const interval = setInterval(() => {
        setAudioLevels(prev => new Map(prev).set(fingerprint, Math.floor(Math.random() * 5) + 1));
      }, 450);
      audioLevelIntervalsRef.current.set(fingerprint, interval);
    });

    return () => {
      audioLevelIntervalsRef.current.forEach(interval => clearInterval(interval));
      audioLevelIntervalsRef.current.clear();
    };
  }, [isOpen, callStatus, participants.size, callManager]);

  // Auto-hide controls
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4500);
  };

  useEffect(() => {
    if (isOpen && !isMinimized) resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isOpen, isMinimized]);

  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getFilterStyle = (filter: VideoFilter) => {
    switch (filter) {
      case 'studio': return 'contrast-[1.1] saturate-[1.2] brightness-[1.05] shadow-[inset_0_0_80px_rgba(255,200,150,0.15)]';
      case 'cyber': return 'contrast-[1.2] saturate-[1.4] hue-rotate-[15deg] shadow-[inset_0_0_80px_rgba(255,78,24,0.2)]';
      case 'noir': return 'grayscale contrast-[1.3] brightness-[0.95]';
      default: return '';
    }
  };

  // Get main participant to show (expanded or speaker)
  const mainParticipant = useMemo(() => {
    if (expandedParticipant) return participants.get(expandedParticipant) || null;

    // In speaker layout, show the loudest remote participant
    if (layout === 'speaker') {
      let loudest: GroupCallParticipant | null = null;
      let maxLevel = 0;
      participants.forEach((p, fp) => {
        if (fp === callManager?.getParticipants().keys().next().value) return; // Skip local
        const level = audioLevels.get(fp) || 0;
        if (level > maxLevel && (p.stream || p.screenStream)) {
          maxLevel = level;
          loudest = p;
        }
      });
      if (loudest) return loudest;
    }

    // Default: first remote participant with video
    for (const [fp, p] of participants) {
      if (fp === callManager?.getParticipants().keys().next().value) continue;
      if (p.stream || p.screenStream) return p;
    }
    return null;
  }, [participants, expandedParticipant, layout, audioLevels, callManager]);

  // Other participants for grid
  const otherParticipants = useMemo(() => {
    const localFp = callManager?.getParticipants().keys().next().value;
    return Array.from(participants.entries())
      .filter(([fp, p]) => fp !== localFp && fp !== expandedParticipant && fp !== mainParticipant?.fingerprint)
      .map(([fp, p]) => ({ fingerprint: fp, ...p }));
  }, [participants, expandedParticipant, mainParticipant, callManager]);

  const localParticipant = useMemo(() => {
    const localFp = callManager?.getParticipants().keys().next().value;
    return localFp ? participants.get(localFp) : null;
  }, [participants, callManager]);

  // =================== MINIMIZED PIP ===================
  if (isMinimized) {
    const mp = mainParticipant;
    return (
      <div
        onClick={onMaximize}
        className="fixed bottom-20 right-4 z-50 w-36 h-52 bg-[#12131c] rounded-2xl border-2 border-[var(--nova-accent-color)] shadow-2xl shadow-black/80 overflow-hidden cursor-pointer group animate-in slide-in-from-bottom-5 duration-300 select-none"
      >
        <div className="absolute inset-0">
          {mp?.screenStream ? (
            <video ref={expandedVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          ) : mp?.stream ? (
            <video ref={expandedVideoRef} autoPlay playsInline className={`w-full h-full object-cover ${getFilterStyle(activeFilter)}`} />
          ) : mp ? (
            <LazyMedia src={mp.avatar} alt={mp.name} eager className={`w-full h-full object-cover ${getFilterStyle(activeFilter)}`} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--nova-bg-elevated)] text-[var(--nova-text-muted)]">{t('a11y.call.noVideo')}</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
        </div>

        <div className="relative z-10 p-2 flex items-center justify-between">
          <span className="text-[9.5px] font-mono text-white/90 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md flex items-center gap-1 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {formatTime(callDuration)}
          </span>
          <button onClick={(e) => { e.stopPropagation(); onMaximize?.(); }} className="w-5 h-5 rounded-full bg-black/60 hover:bg-white/20 text-white flex items-center justify-center transition" title="Expand">
            <Maximize2 className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="absolute bottom-2 inset-x-2 z-10 flex items-center justify-between">
          <div className="truncate pr-1">
            <p className="text-[10px] font-bold text-white truncate">{mp?.name || 'Call'}</p>
            <p className="text-[8px] text-white/60">{isVoiceCall ? 'HD Audio' : 'HD Video'}</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); handleHangUp(); }} className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md active:scale-90 transition shrink-0" title={t('a11y.call.endCall')}>
            <PhoneOff className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  // =================== FULL SCREEN GROUP CALL ===================
  const handleToggleCamera = () => {
    const next = !internalCameraOn;
    setInternalCameraOn(next);
    callManager?.setCameraEnabled(next);
    resetControlsTimeout();
  };

  const handleToggleMic = () => {
    const next = !internalMicOn;
    setInternalMicOn(next);
    callManager?.setMicrophoneEnabled(next);
    resetControlsTimeout();
  };

  const handleToggleSpeaker = () => {
    setIsSpeakerOn(prev => !prev);
    resetControlsTimeout();
  };

  const handleFlipCamera = async () => {
    const nextFacing = cameraFacing === 'front' ? 'back' : 'front';
    setCameraFacing(nextFacing);
    await callManager?.flipCamera(nextFacing);
    resetControlsTimeout();
  };

  const handleCycleFilter = () => {
    const filters: VideoFilter[] = ['none', 'studio', 'cyber', 'noir'];
    const currentIndex = filters.indexOf(activeFilter);
    setActiveFilter(filters[(currentIndex + 1) % filters.length]);
    resetControlsTimeout();
  };

  const handleStartScreenShare = async () => {
    await callManager?.startScreenShare();
    resetControlsTimeout();
  };

  const handleStopScreenShare = async () => {
    await callManager?.stopScreenShare();
    resetControlsTimeout();
  };

  const handleHangUp = () => {
    const formatted = formatTime(callDuration);
    onEndCall(formatted);
    callManager?.end();
  };

  const handleParticipantClick = (fp: string) => {
    setExpandedParticipant(fp === expandedParticipant ? null : fp);
    resetControlsTimeout();
  };

  // Render participant video
  const renderParticipantVideo = (p: GroupCallParticipant, isMain = false, size: 'main' | 'pip' | 'grid' = 'grid') => {
    const isLocal = p.isLocal;
    const isScreenSharing = p.isScreenSharing && p.screenStream;
    const stream = isScreenSharing ? p.screenStream : p.stream;

    const dimensions = {
      main: 'w-full h-full',
      pip: 'w-28 h-40',
      grid: 'w-full h-full aspect-video',
    }[size];

    const borderStyle = isMain ? 'border-2 border-[var(--nova-accent-color)]' : 'border border-white/20';

    return (
      <div
        key={p.fingerprint}
        onClick={() => !isLocal && handleParticipantClick(p.fingerprint)}
        className={`relative group ${dimensions} rounded-${size === 'pip' ? '2xl' : size === 'main' ? 'none' : 'xl'} overflow-hidden bg-[#1a1b24] ${borderStyle} transition-all duration-300 cursor-pointer ${isMain ? '' : 'hover:scale-[1.02] hover:shadow-xl'}`}
      >
        {/* Video */}
        <div className="absolute inset-0">
          {stream ? (
            <video
              ref={isMain ? expandedVideoRef : undefined}
              autoPlay
              playsInline
              muted={isLocal}
              className={`w-full h-full object-cover ${getFilterStyle(activeFilter)} ${p.isCameraOff ? 'hidden' : ''}`}
            />
          ) : p.isCameraOff || !p.stream ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1b24] text-white/50 p-4">
              {p.avatar ? (
                <LazyMedia src={p.avatar} alt={p.name} eager className={`w-16 h-16 rounded-full object-cover ${p.isMuted ? 'grayscale opacity-50' : ''}`} />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[var(--nova-accent-color)] flex items-center justify-center text-white font-bold text-xl">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              {p.isCameraOff && <span className="text-[10px] mt-2 text-[var(--nova-text-muted)]">{t('a11y.call.cameraOff')}</span>}
              {p.isMuted && <span className="text-[10px] mt-1 text-amber-400">Muted</span>}
            </div>
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        </div>

        {/* Screen share badge */}
        {isScreenSharing && (
          <div className="absolute top-2 left-2 z-10 bg-amber-500/90 text-black px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1">
            <Monitor className="w-3 h-3" />
            Sharing
          </div>
        )}

        {/* Audio level indicator */}
        {!isLocal && !isScreenSharing && (p.stream || p.isCameraOff) && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 bg-black/50 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <div className="flex items-end gap-0.5 h-3">
              {[1, 2, 3, 4].map((bar) => {
                const level = audioLevels.get(p.fingerprint) || 0;
                const height = bar <= level ? Math.max(4, (bar / 4) * 12) : 3;
                return (
                  <span key={bar} className="w-1 rounded-full bg-emerald-400 transition-all duration-200" style={{ height: `${height}px` }} />
                );
              })}
            </div>
          </div>
        )}

        {/* Name overlay */}
        <div className="absolute bottom-2 right-2 left-2 z-10 flex items-center justify-between px-2">
          <span className="text-[11px] font-medium text-white truncate bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm">
            {p.name}
          </span>
          {p.connectionStatus !== 'connected' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/80 text-white">
              {p.connectionStatus}
            </span>
          )}
        </div>

        {/* Muted indicator */}
        {p.isMuted && !isScreenSharing && (
          <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center">
            <MicOff className="w-3.5 h-3.5 text-amber-400" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onClick={resetControlsTimeout}
      data-theme-preserve="dark"
      className="absolute inset-0 z-50 bg-[#08090d] text-white flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-300"
    >
      {/* MAIN VIDEO AREA */}
      <div className="flex-1 relative overflow-hidden">
        {mainParticipant ? (
          renderParticipantVideo(mainParticipant, true, 'main')
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#12131c] text-white/50 p-8">
            <Users className="w-16 h-16 mb-4 text-white/30" />
            <p className="text-lg font-medium">{t('a11y.call.waiting')}</p>
            <p className="text-sm text-[var(--nova-text-muted)] mt-1">{callStatus === 'connecting' ? t('a11y.call.connecting') : t('a11y.call.noVideoShort')}</p>
          </div>
        )}

        {/* Self-view PIP (local participant) */}
        {localParticipant && !isVoiceCall && (
          <div
            data-testid="self-view"
            className="absolute bottom-20 right-4 z-30 w-28 h-40 bg-[#161722]/90 rounded-2xl border-2 border-white/20 shadow-2xl overflow-hidden backdrop-blur-md transition-all duration-300"
            onClick={() => setExpandedParticipant(localParticipant.fingerprint)}
          >
            {renderParticipantVideo(localParticipant, false, 'pip')}
            <div className="absolute bottom-1 left-1.5 bg-black/60 px-1 py-0.5 rounded text-[8px] font-mono text-white/80">
              {cameraFacing === 'front' ? 'Front' : 'Back'}
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleFlipCamera(); }} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition active:scale-90" title={t('a11y.call.flipCamera')}>
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Grid view for other participants (when not in speaker layout or expanded) */}
        {(layout === 'grid' || expandedParticipant) && otherParticipants.length > 0 && (
          <div className="absolute bottom-20 right-4 z-20 flex flex-row-reverse gap-2 pr-2 pb-2 max-w-[calc(100%-8rem)] overflow-x-auto no-scrollbar">
            {otherParticipants.map(p => renderParticipantVideo(p, false, 'pip'))}
          </div>
        )}

        {/* Ambient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/85 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />

        {/* Top Bar */}
        <div className={`absolute top-0 left-0 right-0 z-30 p-4 pt-6 flex items-center justify-between transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {/* Left: Minimize, Encryption, Participants count */}
          <div className="flex items-center gap-2">
            {onMinimize && (
              <button onClick={(e) => { e.stopPropagation(); onMinimize(); }} className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer" title="Minimize">
                <Minimize2 className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-[11px] text-white/80">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{hidesIp ? t('chat.ipHidden') : t('chat.e2eeEncrypted')}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-[11px] text-white/80">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>{participants.size}</span>
            </div>
          </div>

          {/* Center: Duration/Status */}
          <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full shadow-lg">
            {callStatus === 'failed' ? (
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-xs font-medium text-red-300">{t('a11y.call.connectionFailed')}</span></div>
            ) : callStatus === 'connecting' ? (
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" /><span className="text-xs font-medium text-amber-200">Connecting...</span></div>
            ) : callStatus === 'requesting-media' ? (
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" /><span className="text-xs font-medium text-blue-200">{t('a11y.call.requestingMedia')}</span></div>
            ) : (
              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wide text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{formatTime(callDuration)}</span>
              </div>
            )}
          </div>

          {/* Right: Layout toggle, Settings, More */}
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); setShowParticipantList(!showParticipantList); }} className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer" title="Participants">
              <Users className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setLayout(layout === 'grid' ? 'speaker' : 'grid'); }} className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer" title={layout === 'grid' ? 'Speaker view' : 'Grid view'}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }} className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter notification */}
        {activeFilter !== 'none' && (
          <div className="absolute top-20 left-4 z-30 bg-black/50 backdrop-blur-md border border-[var(--nova-accent-color)]/40 px-2.5 py-1 rounded-full text-[10px] font-semibold text-[var(--nova-accent-color)] flex items-center gap-1.5 animate-in fade-in">
            <Sparkles className="w-3 h-3" />
            <span>Filter: {activeFilter.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS DOCK */}
      <div className={`relative z-30 p-5 pb-8 flex flex-col items-center gap-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Call info */}
        <div className="text-center w-full max-w-2xl px-4">
          <h2 className="text-lg font-bold text-white drop-shadow-md truncate">
            {mainParticipant?.name || (callStatus === 'connecting' ? 'Connecting...' : 'Group Call')}
          </h2>
          <p className="text-xs text-white/70 font-medium drop-shadow-sm flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{participants.size} participant{participants.size !== 1 ? 's' : ''}</span>
            {mainParticipant?.isScreenSharing && <span className="text-amber-400 flex items-center gap-1"><Monitor className="w-3 h-3" /> {t('a11y.call.screenSharing')}</span>}
          </p>
        </div>

        {/* Controls */}
        <div className="bg-[#12131c]/90 border border-white/15 backdrop-blur-xl rounded-full px-4 py-2.5 flex items-center gap-3 shadow-2xl shadow-black/80">
          {/* Camera Toggle */}
          {!isVoiceCall && (
            <button onClick={(e) => { e.stopPropagation(); handleToggleCamera(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${internalCameraOn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-red-500/25 border border-red-500/50 text-red-400 hover:bg-red-500/35'}`} title={internalCameraOn ? t('a11y.call.turnCameraOff') : t('a11y.call.turnCameraOn')}>
              {internalCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          )}

          {/* Mic Toggle */}
          <button onClick={(e) => { e.stopPropagation(); handleToggleMic(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${internalMicOn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-red-500/25 border border-red-500/50 text-red-400 hover:bg-red-500/35'}`} title={internalMicOn ? 'Mute microphone' : 'Unmute microphone'}>
            {internalMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Flip Camera */}
          {!isVoiceCall && (
            <button onClick={(e) => { e.stopPropagation(); handleFlipCamera(); }} disabled={!internalCameraOn} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${internalCameraOn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-white/5 text-white/30 cursor-not-allowed'}`} title={t('a11y.call.switchCamera')}>
              <RefreshCw className="w-5 h-5" />
            </button>
          )}

          {/* Speaker */}
          <button onClick={(e) => { e.stopPropagation(); handleToggleSpeaker(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${isSpeakerOn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-white/5 text-white/40'}`} title={isSpeakerOn ? 'Mute speaker' : 'Enable speaker'}>
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Screen Share */}
          {!isVoiceCall && (
            <button onClick={(e) => { e.stopPropagation(); screenSharePreview ? handleStopScreenShare() : handleStartScreenShare(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${screenSharePreview ? 'bg-[var(--nova-accent-color)] text-white shadow-md shadow-[var(--nova-accent-color)]/40' : 'bg-white/15 hover:bg-white/25 text-white'}`} title={screenSharePreview ? 'Stop screen share' : 'Share screen'}>
              {screenSharePreview ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>
          )}

          {/* Video Filters */}
          {!isVoiceCall && (
            <button onClick={(e) => { e.stopPropagation(); handleCycleFilter(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${activeFilter !== 'none' ? 'bg-[var(--nova-accent-color)] text-white shadow-md shadow-[var(--nova-accent-color)]/40' : 'bg-white/15 hover:bg-white/25 text-white'}`} title={`Video Filter (Current: ${activeFilter})`}>
              <Sparkles className="w-5 h-5" />
            </button>
          )}

          {/* End Call */}
          <button onClick={(e) => { e.stopPropagation(); handleHangUp(); }} className="w-13 h-13 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white flex items-center justify-center shadow-xl shadow-red-600/40 active:scale-90 transition-all cursor-pointer ml-1" title={isVoiceCall ? 'End Voice Call' : 'End Video Call'}>
            <PhoneOff className="w-6 h-6 stroke-[2.4]" />
          </button>
        </div>
      </div>

      {/* PARTICIPANT LIST SIDEBAR */}
      {showParticipantList && (
        <div className="fixed inset-y-0 right-0 z-40 w-72 max-w-[90vw] bg-[#12131c] border-l border-white/10 shadow-2xl shadow-black/80 animate-in slide-in-from-right-4 duration-300 flex flex-col">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-semibold text-white">Participants ({participants.size})</h3>
            <button onClick={(e) => { e.stopPropagation(); setShowParticipantList(false); }} aria-label={t('a11y.call.closeParticipants')} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)]/70 hover:text-[var(--nova-text-primary)] flex items-center justify-center transition">
              <UserX className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {Array.from(participants.entries()).map(([fp, p]) => (
              <div key={fp} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer" onClick={() => { handleParticipantClick(fp); setShowParticipantList(false); }}>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1a1b24] border border-white/10 flex-shrink-0 relative">
                  {p.avatar ? (
                    <LazyMedia src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[var(--nova-accent-color)] text-white font-bold text-sm">{p.name.slice(0, 2).toUpperCase()}</div>
                  )}
                  {p.isLocal && <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-400 rounded-full border-2 border-[#12131c] flex items-center justify-center"><ShieldCheck className="w-2.5 h-2.5 text-white" /></span>}
                  {p.isScreenSharing && <span className="absolute top-0 right-0 w-4 h-4 bg-amber-500 rounded-full border-2 border-[#12131c] flex items-center justify-center"><Monitor className="w-2.5 h-2.5 text-black" /></span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate flex items-center gap-1.5">
                    {p.name}
                    {p.isLocal && <span className="text-[10px] text-emerald-400 bg-emerald-400/20 px-1.5 py-0.5 rounded">You</span>}
                  </p>
                  <p className="text-[11px] text-white/50 flex items-center gap-1">
                    {p.isMuted && <MicOff className="w-3 h-3 text-amber-400" />}
                    {p.isCameraOff && !p.isScreenSharing && <VideoOff className="w-3 h-3 text-white/50" />}
                    {p.connectionStatus !== 'connected' && <span className="text-red-400">{p.connectionStatus}</span>}
                    {p.isScreenSharing && <span className="text-amber-400 flex items-center gap-1"><Monitor className="w-3 h-3" /> {t('a11y.call.sharingScreen')}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS PANEL */}
      {showSettings && (
        <div className="fixed inset-y-0 right-0 z-40 w-80 max-w-[90vw] bg-[#12131c] border-l border-white/10 shadow-2xl shadow-black/80 animate-in slide-in-from-right-4 duration-300 flex flex-col">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-semibold text-white">{t('a11y.call.settings')}</h3>
            <button onClick={(e) => { e.stopPropagation(); setShowSettings(false); }} aria-label={t('a11y.call.closeSettings')} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)]/70 hover:text-[var(--nova-text-primary)] flex items-center justify-center transition">
              <UserX className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div>
              <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Video</h4>
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-white/90">{t('a11y.call.mirrorVideo')}</span>
                  <input type="checkbox" checked={cameraFacing === 'front'} onChange={() => handleFlipCamera()} className="w-5 h-5 rounded border-white/20 bg-white/5 text-[var(--nova-accent-color)] focus:ring-0" />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-white/90">{t('a11y.call.hardwareAcceleration')}</span>
                  <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-white/20 bg-white/5 text-[var(--nova-accent-color)] focus:ring-0" />
                </label>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Audio</h4>
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-white/90">{t('a11y.call.noiseSuppression')}</span>
                  <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-white/20 bg-white/5 text-[var(--nova-accent-color)] focus:ring-0" />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-white/90">{t('a11y.call.echoCancellation')}</span>
                  <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-white/20 bg-white/5 text-[var(--nova-accent-color)] focus:ring-0" />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-white/90">{t('a11y.call.highFidelityAudio')}</span>
                  <input type="checkbox" className="w-5 h-5 rounded border-white/20 bg-white/5 text-[var(--nova-accent-color)] focus:ring-0" />
                </label>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Privacy</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-[11px] text-white/80">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{hidesIp ? 'IP hidden via TURN relay' : 'Direct P2P (IP visible)'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXPANDED PARTICIPANT OVERLAY */}
      {expandedParticipant && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setExpandedParticipant(null)}>
          {mainParticipant && renderParticipantVideo(mainParticipant, true, 'main')}
          <button onClick={(e) => { e.stopPropagation(); setExpandedParticipant(null); }} aria-label={t('a11y.call.closeExpanded')} className="absolute top-4 right-4 w-12 h-12 rounded-full bg-[var(--nova-canvas)]/60 hover:bg-[var(--nova-canvas)]/80 text-[var(--nova-text-primary)] flex items-center justify-center transition">
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};