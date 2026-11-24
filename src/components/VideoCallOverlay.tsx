import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { useAccount } from '../hooks/useAccount';
import { useLanguage } from '../context/LanguageContext';
import { LazyMedia } from './LazyMedia';

interface VideoCallOverlayProps {
  isOpen: boolean;
  onEndCall: (durationFormatted: string) => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
  onMaximize?: () => void;
  contactName?: string;
  contactAvatar?: string;
  mode?: 'voice' | 'video';
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  connectionStatus?: 'connecting' | 'connected' | 'failed';
  isMicOn?: boolean;
  isCameraOn?: boolean;
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
  /** True when media flows through a TURN relay and the peer cannot see the local IP. */
  hidesIp?: boolean;
  /** Call quality statistics (bitrate, packet loss, RTT). */
  qualityStats?: {
    sendBitrateBps: number;
    receiveBitrateBps: number;
    sendPacketLoss: number;
    receivePacketLoss: number;
    rttMs: number;
    sampledAt: number;
  };
}

type VideoFilter = 'none' | 'studio' | 'cyber' | 'noir';

export const VideoCallOverlay: React.FC<VideoCallOverlayProps> = ({
  isOpen,
  onEndCall,
  onMinimize,
  isMinimized = false,
  onMaximize,
  contactName,
  contactAvatar,
  mode = 'video',
  localStream = null,
  remoteStream = null,
  connectionStatus,
  isMicOn: controlledMicOn,
  isCameraOn: controlledCameraOn,
  onToggleMic,
  onToggleCamera,
  hidesIp = false,
  qualityStats,
}) => {
  const { account } = useAccount();
  const { t } = useLanguage();
  const name = contactName || 'Contact';
  const avatar = contactAvatar || '';
  const isVoiceCall = mode === 'voice';
  // Call state
  const [callDuration, setCallDuration] = useState<number>(0);
  const [simulatedStatus, setSimulatedStatus] = useState<'connecting' | 'connected'>('connecting');
  const [internalCameraOn, setInternalCameraOn] = useState<boolean>(true);
  const [internalMicOn, setInternalMicOn] = useState<boolean>(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [activeFilter, setActiveFilter] = useState<VideoFilter>('none');
  const [showControls, setShowControls] = useState<boolean>(true);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState<number>(3);

  const isCameraOn = controlledCameraOn ?? internalCameraOn;
  const isMicOn = controlledMicOn ?? internalMicOn;
  const callStatus = connectionStatus ?? simulatedStatus;

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Bind real media streams (when a P2P call is active).
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream, isMinimized, isOpen, isCameraOn]);

  // Connection delay simulation used only when no real call status is supplied.
  useEffect(() => {
    if (!isOpen || connectionStatus) return;
    setSimulatedStatus('connecting');
    setCallDuration(0);
    const connectTimer = setTimeout(() => {
      setSimulatedStatus('connected');
    }, 1200);

    return () => clearTimeout(connectTimer);
  }, [isOpen, connectionStatus]);

  // Reset duration when a new call opens.
  useEffect(() => {
    if (isOpen) {
      setCallDuration(0);
    }
  }, [isOpen]);

  // Duration timer
  useEffect(() => {
    if (isOpen && callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, callStatus]);

  // Simulated remote speaking / audio waveform fluctuation
  useEffect(() => {
    if (!isOpen || callStatus !== 'connected') return;

    const audioInterval = setInterval(() => {
      // Random audio level between 1 and 5
      setRemoteAudioLevel(Math.floor(Math.random() * 5) + 1);
    }, 450);

    return () => clearInterval(audioInterval);
  }, [isOpen, callStatus]);

  // Auto-hide controls on inactivity
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4500);
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      resetControlsTimeout();
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isOpen, isMinimized]);

  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleToggleCamera = () => {
    setInternalCameraOn((prev) => !prev);
    onToggleCamera?.();
    resetControlsTimeout();
  };

  const handleToggleMic = () => {
    setInternalMicOn((prev) => !prev);
    onToggleMic?.();
    resetControlsTimeout();
  };

  const handleToggleSpeaker = () => {
    setIsSpeakerOn((prev) => !prev);
    resetControlsTimeout();
  };

  const handleFlipCamera = () => {
    const nextFacing = cameraFacing === 'front' ? 'back' : 'front';
    setCameraFacing(nextFacing);
    const track = localStream?.getVideoTracks()[0];
    if (track) {
      void track
        .applyConstraints({ facingMode: nextFacing === 'front' ? 'user' : 'environment' })
        .catch(() => undefined);
    }
    resetControlsTimeout();
  };

  const handleCycleFilter = () => {
    const filters: VideoFilter[] = ['none', 'studio', 'cyber', 'noir'];
    const currentIndex = filters.indexOf(activeFilter);
    const nextFilter = filters[(currentIndex + 1) % filters.length];
    setActiveFilter(nextFilter);
    resetControlsTimeout();
  };

  const handleHangUp = () => {
    const formatted = formatTime(callDuration);
    onEndCall(formatted);
  };

  // Filter styles applied to main video feed
  const getFilterStyle = (filter: VideoFilter) => {
    switch (filter) {
      case 'studio':
        return 'contrast-[1.1] saturate-[1.2] brightness-[1.05] shadow-[inset_0_0_80px_rgba(255,200,150,0.15)]';
      case 'cyber':
        return 'contrast-[1.2] saturate-[1.4] hue-rotate-[15deg] shadow-[inset_0_0_80px_rgba(255,78,24,0.2)]';
      case 'noir':
        return 'grayscale contrast-[1.3] brightness-[0.95]';
      default:
        return '';
    }
  };

  // 1. MINIMIZED PICTURE-IN-PICTURE TILE
  if (isMinimized) {
    return (
      <div
        onClick={onMaximize}
        className="fixed bottom-20 right-4 z-50 w-36 h-52 bg-[#12131c] rounded-2xl border-2 border-[var(--nova-accent-color)] shadow-2xl shadow-black/80 overflow-hidden cursor-pointer group animate-in slide-in-from-bottom-5 duration-300 select-none"
      >
        {/* Remote Video Thumbnail */}
        <div className="absolute inset-0">
          {remoteStream && !isVoiceCall ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${getFilterStyle(
                activeFilter
              )}`}
            />
          ) : (
            <LazyMedia
              src={avatar}
              alt={name}
              eager
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${getFilterStyle(
                activeFilter
              )}`}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
        </div>

        {/* Top Info */}
        <div className="relative z-10 p-2 flex items-center justify-between">
          <span className="text-[9.5px] font-mono text-[var(--nova-text-primary)]/90 bg-[var(--nova-canvas)]/60 backdrop-blur-md px-1.5 py-0.5 rounded-md flex items-center gap-1 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {formatTime(callDuration)}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onMaximize) onMaximize();
            }}
            className="w-5 h-5 rounded-full bg-[var(--nova-canvas)]/60 hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition"
            title="Expand to full screen"
          >
            <Maximize2 className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Bottom Contact Name and Quick Hangup */}
        <div className="absolute bottom-2 inset-x-2 z-10 flex items-center justify-between">
          <div className="truncate pr-1">
            <p className="text-[10px] font-bold text-[var(--nova-text-primary)] truncate leading-tight">
              {name.split(' ')[0]}
            </p>
            <p className="text-[8px] text-[var(--nova-text-primary)]/60 leading-none">
              {isVoiceCall ? 'HD Audio' : 'HD 1080p'}
            </p>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleHangUp();
            }}
            className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-[var(--nova-text-primary)] flex items-center justify-center shadow-md active:scale-90 transition shrink-0"
            title={t('a11y.call.endCall')}
          >
            <PhoneOff className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  // 2. FULL-SCREEN VIDEO CALL OVERLAY
  return (
    <div
      onClick={resetControlsTimeout}
      data-theme-preserve="dark"
      className="absolute inset-0 z-50 bg-[var(--nova-canvas)] text-[var(--nova-text-primary)] flex flex-col justify-between overflow-hidden select-none animate-in fade-in zoom-in-95 duration-300"
    >
      {/* BACKGROUND / MAIN REMOTE VIDEO FEED */}
      <div className="absolute inset-0 overflow-hidden">
        {remoteStream && !isVoiceCall ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover scale-[1.02] transition-all duration-700 ${getFilterStyle(
              activeFilter
            )}`}
          />
        ) : (
          <LazyMedia
            src={avatar}
            alt={name}
            eager
            className={`w-full h-full object-cover scale-[1.02] transition-all duration-700 ${getFilterStyle(
              activeFilter
            )}`}
          />
        )}

        {/* Dynamic ambient video grain & lighting simulation */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/85" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]" />

        {/* Simulated subtle screen scanlines / high-tech overlay */}
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

        {/* Live Audio Reaction Wave Indicator on remote video */}
        {callStatus === 'connected' && (
          <div className="absolute bottom-28 left-4 z-20 flex items-center gap-2 bg-[var(--nova-canvas)]/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-[var(--nova-border-color)]">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-[var(--nova-text-primary)]/90">{name}</span>
            <div className="flex items-end gap-0.5 h-3 ml-1">
              {[1, 2, 3, 4].map((bar) => {
                const height =
                  bar <= remoteAudioLevel
                    ? Math.max(4, (bar / 4) * 12)
                    : 3;
                return (
                  <span
                    key={bar}
                    className="w-1 rounded-full bg-emerald-400 transition-all duration-200"
                    style={{ height: `${height}px` }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* TOP BAR CONTROLS & STATUS */}
      <div
        className={`relative z-30 p-4 pt-6 flex items-center justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Left: Minimize button & Encryption indicator */}
        <div className="flex items-center gap-2">
          {onMinimize && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMinimize();
              }}
              className="w-9 h-9 rounded-full bg-[var(--nova-canvas)]/40 hover:bg-[var(--nova-canvas)]/60 backdrop-blur-md border border-[var(--nova-border-color)] text-[var(--nova-text-primary)]/80 hover:text-[var(--nova-text-primary)] flex items-center justify-center transition active:scale-95 cursor-pointer"
              title="Minimize to Picture-in-Picture"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}

          <div
            className="flex items-center gap-1.5 bg-[var(--nova-canvas)]/40 backdrop-blur-md border border-[var(--nova-border-color)] px-2.5 py-1 rounded-full text-[11px] text-[var(--nova-text-primary)]/80"
            title={hidesIp ? t('chat.ipHiddenTitle') : t('chat.ipVisibleTitle')}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{hidesIp ? t('chat.ipHidden') : t('chat.e2eeEncrypted')}</span>
          </div>
        </div>

        {/* Center: Call Duration or Connecting State */}
        <div className="flex items-center gap-1.5 bg-[var(--nova-canvas)]/50 backdrop-blur-md border border-[var(--nova-border-color)] px-3 py-1 rounded-full shadow-lg">
          {callStatus === 'failed' ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--nova-text-primary)]/90" />
              <span className="text-xs font-medium text-[var(--nova-text-primary)]">Connection failed</span>
            </div>
          ) : callStatus === 'connecting' ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--nova-accent-color,#ff4e18)] animate-ping" />
              <span className="text-xs font-medium text-[var(--nova-accent-color,#ff4e18)]">Connecting...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wide text-[var(--nova-text-primary)]">
              <span className="w-2 h-2 rounded-full bg-[var(--nova-text-primary)]/90 animate-pulse" />
              <span>{formatTime(callDuration)}</span>
            </div>
          )}
        </div>

        {/* Right: Call Quality Indicators */}
        {callStatus === 'connected' && qualityStats && (
          <div className="flex items-center gap-1.5 bg-[var(--nova-canvas)]/40 backdrop-blur-md border border-[var(--nova-border-color)] px-2.5 py-1 rounded-full text-[10px] text-[var(--nova-text-primary)]/80 font-mono">
            <Signal className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-300">{Math.round(qualityStats.sendBitrateBps / 1000)} kbps ↑</span>
            <span className="text-emerald-300">{Math.round(qualityStats.receiveBitrateBps / 1000)} kbps ↓</span>
            {qualityStats.rttMs > 0 && (
              <>
                <span className="text-amber-300">{Math.round(qualityStats.rttMs)} ms RTT</span>
                {(qualityStats.sendPacketLoss > 0.05 || qualityStats.receivePacketLoss > 0.05) && (
                  <span className="text-red-400">Loss: {Math.max(qualityStats.sendPacketLoss, qualityStats.receivePacketLoss) * 100}%</span>
                )}
              </>
            )}
          </div>
        )}
        {callStatus === 'connected' && !qualityStats && (
          <div className="flex items-center gap-1.5 bg-[var(--nova-canvas)]/40 backdrop-blur-md border border-[var(--nova-border-color)] px-2.5 py-1 rounded-full text-[11px] text-[var(--nova-text-primary)]/80">
            <Signal className="w-3 h-3 text-emerald-400" />
            <span className="font-mono text-[10px]">{isVoiceCall ? 'HD Audio' : '1080p 60fps'}</span>
          </div>
        )}
      </div>

      {/* TOP RIGHT: SELF VIEW / PICTURE-IN-PICTURE (PIP) CAMERA */}
      {!isVoiceCall && (
        <div
          data-testid="self-view"
          aria-label="Your camera preview"
          className="absolute top-16 right-4 z-30 w-28 h-40 bg-[var(--nova-canvas)]/90 rounded-2xl border-2 border-[var(--nova-border-color)] shadow-2xl overflow-hidden backdrop-blur-md transition-all duration-300"
        >
          {isCameraOn ? (
            <div className="w-full h-full relative group">
              {/* Local camera preview (real stream) or simulated selfie fallback */}
              {localStream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-transform duration-300 ${
                    cameraFacing === 'back' ? 'scale-x-[-1]' : ''
                  } ${activeFilter === 'noir' ? 'grayscale' : ''}`}
                />
              ) : account.avatar ? (
                <LazyMedia
                  src={account.avatar}
                  alt="You"
                  eager
                  className={`w-full h-full object-cover transition-transform duration-300 ${
                    cameraFacing === 'back' ? 'scale-x-[-1]' : ''
                  } ${activeFilter === 'noir' ? 'grayscale' : ''}`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[var(--nova-surface-high)] text-[var(--nova-text-primary)] text-2xl font-bold">
                  {account.displayName.slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* Viewfinder brackets */}
              <div className="absolute top-1.5 left-1.5 w-2 h-2 border-t-2 border-l-2 border-[var(--nova-border-color)]/60 pointer-events-none" />
              <div className="absolute top-1.5 right-1.5 w-2 h-2 border-t-2 border-r-2 border-[var(--nova-border-color)]/60 pointer-events-none" />
              <div className="absolute bottom-1.5 left-1.5 w-2 h-2 border-b-2 border-l-2 border-[var(--nova-border-color)]/60 pointer-events-none" />
              <div className="absolute bottom-1.5 right-1.5 w-2 h-2 border-b-2 border-r-2 border-[var(--nova-border-color)]/60 pointer-events-none" />

              {/* Camera facing label */}
              <div className="absolute bottom-1 left-1.5 bg-[var(--nova-canvas)]/60 px-1 py-0.5 rounded text-[8px] font-mono text-[var(--nova-text-primary)]/80">
                {cameraFacing === 'front' ? 'Front' : 'Back 0.5x'}
              </div>

              {/* Quick Flip button on hover/tap */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFlipCamera();
                }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[var(--nova-canvas)]/60 hover:bg-[var(--nova-canvas)]/80 text-[var(--nova-text-primary)] flex items-center justify-center transition active:scale-90"
                title={t('a11y.call.flipCamera')}
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          ) : (
            /* Camera Off State */
            <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-[var(--nova-canvas)]/90 text-[var(--nova-text-primary)]/60 text-center">
              <div className="w-9 h-9 rounded-full bg-[var(--nova-overlay-weak)] flex items-center justify-center mb-1 text-[var(--nova-text-primary)]/40">
                <VideoOff className="w-4 h-4 text-[var(--nova-accent-color)]" />
              </div>
              <span className="text-[10px] font-semibold text-[var(--nova-text-primary)]/70">Camera Off</span>
              <span className="text-[8px] text-[var(--nova-text-primary)]/40 mt-0.5">
                {isMicOn ? 'Mic on' : 'Mic muted'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* FILTER NOTIFICATION PILL */}
      {activeFilter !== 'none' && (
        <div className="absolute top-20 left-4 z-30 bg-black/50 backdrop-blur-md border border-[var(--nova-accent-color)]/40 px-2.5 py-1 rounded-full text-[10px] font-semibold text-[var(--nova-accent-color)] flex items-center gap-1.5 animate-in fade-in">
          <Sparkles className="w-3 h-3" />
          <span>Filter: {activeFilter.toUpperCase()}</span>
        </div>
      )}

      {/* BOTTOM CONTROLS DOCK */}
      <div
        className={`relative z-30 p-5 pb-8 flex flex-col items-center gap-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Remote Participant Info */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-[var(--nova-text-primary)] drop-shadow-md">
            {name}
          </h2>
          <p className="text-xs text-[var(--nova-text-primary)]/70 font-medium drop-shadow-sm">
            {callStatus === 'failed'
              ? isVoiceCall
                ? 'Voice call unavailable'
                : 'Video call unavailable'
              : callStatus === 'connecting'
                ? 'Ringing...'
                : isVoiceCall
                  ? 'Connected • HD Audio'
                  : 'Connected • HD Audio & Video'}
          </p>
        </div>

        {/* Floating Action Controls Dock */}
        <div className="bg-[var(--nova-canvas)]/90 border border-[var(--nova-border-color)] backdrop-blur-xl rounded-full px-4 py-2.5 flex items-center gap-3 shadow-2xl shadow-black/80">
          {/* 1. Camera Toggle */}
          {!isVoiceCall && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCamera();
              }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                isCameraOn
                  ? 'bg-[var(--nova-overlay-medium)] hover:bg-[var(--nova-overlay-strong)] text-[var(--nova-text-primary)]'
                  : 'bg-red-500/25 border border-red-500/50 text-red-400 hover:bg-red-500/35'
              }`}
              title={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {isCameraOn ? (
                <Video className="w-5 h-5" />
              ) : (
                <VideoOff className="w-5 h-5" />
              )}
            </button>
          )}

          {/* 2. Microphone Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleMic();
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
              isMicOn
                ? 'bg-[var(--nova-overlay-medium)] hover:bg-[var(--nova-overlay-strong)] text-[var(--nova-text-primary)]'
                : 'bg-red-500/25 border border-red-500/50 text-red-400 hover:bg-red-500/35'
            }`}
            title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicOn ? (
              <Mic className="w-5 h-5" />
            ) : (
              <MicOff className="w-5 h-5" />
            )}
          </button>

          {/* 3. Flip Camera (Front / Back) */}
          {!isVoiceCall && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFlipCamera();
              }}
              disabled={!isCameraOn}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                isCameraOn
                  ? 'bg-[var(--nova-overlay-medium)] hover:bg-[var(--nova-overlay-strong)] text-[var(--nova-text-primary)]'
                  : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-muted)]/40 cursor-not-allowed'
              }`}
              title="Switch front / rear camera"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}

          {/* 4. Speaker Audio Output Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSpeaker();
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
              isSpeakerOn
                ? 'bg-[var(--nova-overlay-medium)] hover:bg-[var(--nova-overlay-strong)] text-[var(--nova-text-primary)]'
                : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-muted)]/40'
            }`}
            title={isSpeakerOn ? 'Mute speaker' : 'Enable speaker'}
          >
            {isSpeakerOn ? (
              <Volume2 className="w-5 h-5" />
            ) : (
              <VolumeX className="w-5 h-5" />
            )}
          </button>

          {/* 5. Video Filters / Effects */}
          {!isVoiceCall && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCycleFilter();
              }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                activeFilter !== 'none'
                  ? 'bg-[var(--nova-accent-color)] text-[var(--nova-text-primary)] shadow-md shadow-[var(--nova-accent-color)]/40'
                  : 'bg-[var(--nova-overlay-medium)] hover:bg-[var(--nova-overlay-strong)] text-[var(--nova-text-primary)]'
              }`}
              title={`Video Filter (Current: ${activeFilter})`}
            >
              <Sparkles className="w-5 h-5" />
            </button>
          )}

          {/* 6. Big Red End Call Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleHangUp();
            }}
            className="w-13 h-13 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-[var(--nova-text-primary)] flex items-center justify-center shadow-xl shadow-red-600/40 active:scale-90 transition-all cursor-pointer ml-1"
            title={isVoiceCall ? 'End Voice Call' : 'End Video Call'}
          >
            <PhoneOff className="w-6 h-6 stroke-[2.4]" />
          </button>
        </div>
      </div>
    </div>
  );
};
