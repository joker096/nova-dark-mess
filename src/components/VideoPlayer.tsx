import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  ForwardRefExoticComponent,
  RefAttributes,
} from 'react';
import {
  IconCirclePlay as Play,
  IconCirclePause as Pause,
  IconVolume2 as Volume2,
  IconVolumeOff as VolumeOff,
  IconMaximize as Maximize,
  IconMinimize as Minimize,
  IconSettings as Settings,
  IconGauge as Speed,
  IconPictureInPicture as PictureInPicture,
  IconArrowLeft as ArrowLeft,
  IconArrowRight as ArrowRight,
  IconPlayerSkipBack as SkipBack,
  IconPlayerSkipForward as SkipForward,
  IconLoader as Loader,
  IconX as X,
} from '@tabler/icons-react';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  onTimeUpdate?: (current: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  onPlay?: () => void;
  onPause?: () => void;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

interface VideoPlayerState {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  buffered: TimeRanges | null;
  isFullscreen: boolean;
  isLoading: boolean;
  showControls: boolean;
  playbackRate: number;
  showSettings: boolean;
  showPiP: boolean;
  error: Error | null;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SEEK_STEP = 10;
const VOLUME_STEP = 0.1;
const CONTROLS_HIDE_DELAY = 3000;
const LOADING_THRESHOLD = 0.5;

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDuration = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const VideoPlayer: ForwardRefExoticComponent<
  VideoPlayerProps & RefAttributes<HTMLVideoElement>
> = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  (
    {
      src,
      poster,
      title,
      autoPlay = false,
      loop = false,
      muted = false,
      playsInline = true,
      onTimeUpdate,
      onEnded,
      onError,
      onPlay,
      onPause,
      className = '',
      style,
      'data-testid': dataTestid,
    },
    forwardedRef
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const rafRef = useRef<number | undefined>(undefined);
    const lastTouchRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const isDraggingProgressRef = useRef(false);
    const isDraggingVolumeRef = useRef(false);
    const wasPlayingBeforeDragRef = useRef(false);
    const pipRef = useRef<Promise<PictureInPictureWindow> | null>(null);

    const [state, setState] = useState<VideoPlayerState>({
      isPlaying: false,
      isMuted: muted,
      volume: muted ? 0 : 1,
      currentTime: 0,
      duration: 0,
      buffered: null,
      isFullscreen: false,
      isLoading: true,
      showControls: true,
      playbackRate: 1,
      showSettings: false,
      showPiP: false,
      error: null,
    });

    const mergedRef = useCallback(
      (el: HTMLVideoElement | null) => {
        videoRef.current = el;
        if (forwardedRef) {
          if (typeof forwardedRef === 'function') forwardedRef(el);
          else forwardedRef.current = el;
        }
      },
      [forwardedRef]
    );

    const hideControls = useCallback(() => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setState((s) => ({ ...s, showControls: false }));
      }, CONTROLS_HIDE_DELAY);
    }, []);

    const showControls = useCallback(() => {
      setState((s) => ({ ...s, showControls: true }));
      hideControls();
    }, [hideControls]);

    const togglePlay = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        void video.play()?.catch(() => {});
        onPlay?.();
      } else {
        video.pause();
        onPause?.();
      }
    }, [onPlay, onPause]);

    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current;
      if (!video || isDraggingProgressRef.current) return;
      const currentTime = video.currentTime;
      const duration = video.duration || 0;
      const buffered = video.buffered;
      setState((s) => ({ ...s, currentTime, duration, buffered }));
      onTimeUpdate?.(currentTime, duration);
    }, [onTimeUpdate]);

    const handleProgress = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      const buffered = video.buffered;
      setState((s) => ({ ...s, buffered }));
    }, []);

    const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      setState((s) => ({ ...s, duration: video.duration || 0, isLoading: false }));
    }, []);

    const handleWaiting = useCallback(() => {
      setState((s) => ({ ...s, isLoading: true }));
    }, []);

    const handleCanPlay = useCallback(() => {
      setState((s) => ({ ...s, isLoading: false }));
    }, []);

    const handleEnded = useCallback(() => {
      setState((s) => ({ ...s, isPlaying: false }));
      if (loop) {
        const video = videoRef.current;
        if (video) {
          video.currentTime = 0;
          void video.play()?.catch(() => {});
        }
      } else {
        onEnded?.();
      }
    }, [loop, onEnded]);

    const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = videoRef.current;
      const error = video?.error
        ? new Error(`Media error: ${video.error.code} - ${video.error.message}`)
        : new Error('Unknown media error');
      setState((s) => ({ ...s, error, isLoading: false }));
      onError?.(error);
    }, [onError]);

    const handlePlay = useCallback(() => {
      setState((s) => ({ ...s, isPlaying: true, isLoading: false }));
    }, []);

    const handlePause = useCallback(() => {
      setState((s) => ({ ...s, isPlaying: false }));
    }, []);

    const handleVolumeChange = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      setState((s) => ({ ...s, volume: video.volume, isMuted: video.muted }));
    }, []);

    const handleRateChange = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      setState((s) => ({ ...s, playbackRate: video.playbackRate }));
    }, []);

    const handleFullscreenChange = useCallback(() => {
      const isFullscreen = document.fullscreenElement === containerRef.current;
      setState((s) => ({ ...s, isFullscreen }));
    }, []);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        const video = videoRef.current;
        if (!video) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

        switch (e.key) {
          case ' ':
          case 'k':
            e.preventDefault();
            togglePlay();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - SEEK_STEP);
            break;
          case 'ArrowRight':
            e.preventDefault();
            video.currentTime = Math.min(video.duration || 0, video.currentTime + SEEK_STEP);
            break;
          case 'ArrowUp':
            e.preventDefault();
            video.volume = Math.min(1, video.volume + VOLUME_STEP);
            video.muted = false;
            break;
          case 'ArrowDown':
            e.preventDefault();
            video.volume = Math.max(0, video.volume - VOLUME_STEP);
            break;
          case 'm':
            e.preventDefault();
            video.muted = !video.muted;
            break;
          case 'f':
            e.preventDefault();
            toggleFullscreen();
            break;
          case 'p':
            e.preventDefault();
            togglePiP();
            break;
          case '>':
          case '.':
            e.preventDefault();
            setPlaybackRate(Math.min(2, video.playbackRate + 0.25));
            break;
          case '<':
          case ',':
            e.preventDefault();
            setPlaybackRate(Math.max(0.5, video.playbackRate - 0.25));
            break;
          case '0':
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            e.preventDefault();
            const percent = parseInt(e.key, 10) * 10;
            video.currentTime = (video.duration || 0) * (percent / 100);
            break;
          case 'Home':
            e.preventDefault();
            video.currentTime = 0;
            break;
          case 'End':
            e.preventDefault();
            video.currentTime = video.duration || 0;
            break;
          case 'Escape':
            if (state.isFullscreen) toggleFullscreen();
            if (state.showSettings) setState((s) => ({ ...s, showSettings: false }));
            break;
        }
        showControls();
      },
      [togglePlay, showControls, state.isFullscreen, state.showSettings]
    );

    const toggleFullscreen = useCallback(async () => {
      const container = containerRef.current;
      const video = videoRef.current;
      if (!container || !video) return;

      try {
        if (!state.isFullscreen) {
          await container.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch {
        // Fullscreen not supported or denied
      }
    }, [state.isFullscreen]);

    const togglePiP = useCallback(async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
          pipRef.current = null;
        } else {
          pipRef.current = video.requestPictureInPicture();
          await pipRef.current;
        }
      } catch {
        // PiP not supported or denied
      }
    }, []);

    const setPlaybackRate = useCallback((rate: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.playbackRate = rate;
      setState((s) => ({ ...s, playbackRate: rate, showSettings: false }));
    }, []);

    const seekTo = useCallback((time: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, Math.min(video.duration || 0, time));
    }, []);

    const seekBy = useCallback((delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    }, []);

    const setVolume = useCallback((volume: number) => {
      const video = videoRef.current;
      if (!video) return;
      const clamped = Math.max(0, Math.min(1, volume));
      video.volume = clamped;
      video.muted = clamped === 0;
    }, []);

    const toggleMute = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      video.muted = !video.muted;
    }, []);

    const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      isDraggingProgressRef.current = true;
      wasPlayingBeforeDragRef.current = videoRef.current?.paused === false;
      const video = videoRef.current;
      if (video && wasPlayingBeforeDragRef.current) video.pause();
      const handleMove = (moveEvent: MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
        const video = videoRef.current;
        if (video) video.currentTime = (video.duration || 0) * percent;
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        isDraggingProgressRef.current = false;
        const video = videoRef.current;
        if (video && wasPlayingBeforeDragRef.current) void video.play()?.catch(() => {});
      };
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      e.preventDefault();
    }, []);

    const handleVolumeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      isDraggingVolumeRef.current = true;
      const handleMove = (moveEvent: MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, 1 - (moveEvent.clientY - rect.top) / rect.height));
        setVolume(percent);
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        isDraggingVolumeRef.current = false;
      };
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      e.preventDefault();
    }, [setVolume]);

    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      showControls();
    }, [showControls]);

    const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
      if (!lastTouchRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchRef.current.x;
      const dy = touch.clientY - lastTouchRef.current.y;
      const video = videoRef.current;
      if (!video) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (touch.clientX < window.innerWidth / 2) {
          video.volume = Math.max(0, Math.min(1, video.volume - dy * 0.005));
          video.muted = video.volume === 0;
        } else {
          video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + dx * 0.05));
        }
      }
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
      if (!lastTouchRef.current) return;
      const now = Date.now();
      const dt = now - lastTouchRef.current.time;
      const dx = (e.changedTouches[0]?.clientX ?? lastTouchRef.current.x) - lastTouchRef.current.x;

      if (dt < 300 && Math.abs(dx) < 20) {
        togglePlay();
      }
      lastTouchRef.current = null;
    }, [togglePlay]);

    const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video) return;
      const rect = video.getBoundingClientRect();
      if (e.clientX < rect.left + rect.width / 2) {
        seekBy(-SEEK_STEP);
      } else {
        seekBy(SEEK_STEP);
      }
    }, [seekBy]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.muted = muted;
      video.volume = muted ? 0 : state.volume;
      video.loop = loop;
      video.playsInline = playsInline;
      if (autoPlay && video.paused) {
        void video.play()?.catch(() => {});
      }
    }, [autoPlay, loop, muted, playsInline, state.volume]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('progress', handleProgress);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('waiting', handleWaiting);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('ended', handleEnded);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('volumechange', handleVolumeChange);
      video.addEventListener('ratechange', handleRateChange);

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('progress', handleProgress);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('volumechange', handleVolumeChange);
        video.removeEventListener('ratechange', handleRateChange);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('keydown', handleKeyDown);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [
      handleTimeUpdate,
      handleProgress,
      handleLoadedMetadata,
      handleWaiting,
      handleCanPlay,
      handleEnded,
      handlePlay,
      handlePause,
      handleVolumeChange,
      handleRateChange,
      handleFullscreenChange,
      handleKeyDown,
    ]);

    const prefersReducedMotion = useMemo(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      []
    );

    const bufferedPercent = useMemo(() => {
      if (!state.buffered || state.buffered.length === 0 || !state.duration) return 0;
      const end = state.buffered.end(state.buffered.length - 1);
      return Math.min(1, end / state.duration);
    }, [state.buffered, state.duration]);

    const progressPercent = state.duration ? (state.currentTime / state.duration) * 100 : 0;

    const handleSettingsClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setState((s) => ({ ...s, showSettings: !s.showSettings }));
    }, []);

    const handleClickOutside = useCallback((e: MouseEvent) => {
      const target = e.target as Element | null;
      if (state.showSettings && !target?.closest('[data-settings-menu]')) {
        setState((s) => ({ ...s, showSettings: false }));
      }
    }, [state.showSettings]);

    useEffect(() => {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [handleClickOutside]);

    return (
      <div
        ref={containerRef}
        className={`relative w-full h-full bg-black rounded-xl overflow-hidden ${className}`}
        style={style}
        data-testid={dataTestid}
        onMouseEnter={showControls}
        onMouseLeave={hideControls}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        tabIndex={0}
      >
        <video
          ref={mergedRef}
          src={src}
          poster={poster}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline={playsInline}
          onError={handleError}
          className="w-full h-full object-contain"
          style={{ outline: 'none' }}
        />

        {state.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <Loader className="w-8 h-8 text-white animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading video...</span>
          </div>
        )}

        {state.error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-20 p-4 text-white text-center">
            <X className="w-10 h-10 text-red-400" />
            <p className="text-sm">Failed to load video</p>
            <p className="text-xs text-white/60 max-w-xs">{state.error.message}</p>
            <button
              onClick={() => {
                setState((s) => ({ ...s, error: null, isLoading: true }));
                videoRef.current?.load();
              }}
              className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
            >
              Retry
            </button>
          </div>
        )}

        <div
          className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-200 ${
            state.showControls || state.isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${prefersReducedMotion ? 'transition-none' : ''}`}
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)' }}
        >
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2 h-10">
              <div className="flex items-center gap-1">
                <button
                  onClick={togglePlay}
                  aria-label={state.isPlaying ? 'Pause' : 'Play'}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors active:scale-95"
                >
                  {state.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <button
                  onClick={() => seekBy(-SEEK_STEP)}
                  aria-label="Rewind 10 seconds"
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors active:scale-95"
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  onClick={() => seekBy(SEEK_STEP)}
                  aria-label="Forward 10 seconds"
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors active:scale-95"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              <div
                onMouseDown={handleProgressMouseDown}
                onTouchStart={(e) => {
                  isDraggingProgressRef.current = true;
                  wasPlayingBeforeDragRef.current = videoRef.current?.paused === false;
                  const video = videoRef.current;
                  if (video && wasPlayingBeforeDragRef.current) video.pause();
                  const touch = e.touches[0];
                  if (touch) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                    video.currentTime = (video.duration || 0) * percent;
                  }
                }}
                onTouchMove={(e) => {
                  if (!isDraggingProgressRef.current) return;
                  const touch = e.touches[0];
                  const video = videoRef.current;
                  if (video && touch) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                    video.currentTime = (video.duration || 0) * percent;
                  }
                }}
                onTouchEnd={() => {
                  if (isDraggingProgressRef.current) {
                    isDraggingProgressRef.current = false;
                    const video = videoRef.current;
                    if (video && wasPlayingBeforeDragRef.current) void video.play()?.catch(() => {});
                  }
                }}
                className="flex-1 h-10 relative cursor-pointer flex items-center"
                role="slider"
                aria-label="Video progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPercent)}
                tabIndex={0}
              >
                <div
                  className="absolute bottom-1/2 left-0 h-1 bg-white/30 rounded-full transition-all"
                  style={{ width: `${bufferedPercent * 100}%` }}
                />
                <div
                  className="absolute bottom-1/2 left-0 h-1 bg-[var(--nova-accent-color,#ff4e18)] rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
                <div
                  className="absolute bottom-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
                  style={{ left: `calc(${progressPercent}% - 6px)` }}
                />
              </div>

              <div className="flex items-center gap-1 text-white/80 text-sm font-mono min-w-[90px] text-right">
                <span>{formatTime(state.currentTime)}</span>
                <span className="text-white/50">/</span>
                <span>{formatDuration(state.duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={toggleMute}
                    aria-label={state.isMuted ? 'Unmute' : 'Mute'}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors active:scale-95"
                  >
                    {state.isMuted || state.volume === 0 ? <VolumeOff className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <div
                    onMouseDown={handleVolumeMouseDown}
                    onTouchStart={(e) => {
                      isDraggingVolumeRef.current = true;
                      const touch = e.touches[0];
                      if (touch) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const percent = Math.max(0, Math.min(1, 1 - (touch.clientY - rect.top) / rect.height));
                        setVolume(percent);
                      }
                    }}
                    onTouchMove={(e) => {
                      if (!isDraggingVolumeRef.current) return;
                      const touch = e.touches[0];
                      if (touch) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const percent = Math.max(0, Math.min(1, 1 - (touch.clientY - rect.top) / rect.height));
                        setVolume(percent);
                      }
                    }}
                    onTouchEnd={() => {
                      isDraggingVolumeRef.current = false;
                    }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-4 h-24 bg-black/80 rounded-lg flex items-center justify-center px-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none group"
                    role="slider"
                    aria-label="Volume"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(state.volume * 100)}
                  >
                    <div
                      className="w-full h-full bg-white/20 rounded-lg relative"
                      style={{ height: '100%' }}
                    >
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-[var(--nova-accent-color,#ff4e18)] rounded-lg"
                        style={{ height: `${state.volume * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="relative group" data-settings-menu>
                  <button
                    onClick={handleSettingsClick}
                    aria-label="Settings"
                    aria-expanded={state.showSettings}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors active:scale-95"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                  {state.showSettings && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/90 rounded-xl p-2 shadow-xl border border-white/10 min-w-[160px] animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2 py-1 text-xs text-white/60 uppercase tracking-wide">Speed</div>
                      {PLAYBACK_RATES.map((rate) => (
                        <button
                          key={rate}
                          onClick={() => setPlaybackRate(rate)}
                          className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                            state.playbackRate === rate
                              ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white'
                              : 'text-white/80 hover:bg-white/10'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                      <div className="border-t border-white/10 my-1" />
                      <button
                        onClick={togglePiP}
                        disabled={!document.pictureInPictureEnabled}
                        className="w-full px-3 py-2 text-left text-sm rounded-lg text-white/80 hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <PictureInPicture className="w-4 h-4" />
                        Picture-in-Picture
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={toggleFullscreen}
                  aria-label={state.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors active:scale-95"
                >
                  {state.isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group"
          aria-hidden="true"
        >
          {title && <span className="bg-black/70 backdrop-blur text-xs px-2 py-1 rounded text-white">{title}</span>}
        </div>
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;