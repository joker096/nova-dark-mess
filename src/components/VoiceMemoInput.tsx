import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  Mic,
  Trash2,
  Send,
  Square,
  RefreshCw,
  ChevronUp,
  Lock,
  Unlock,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { VoiceNoteData } from '../types/messenger';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { loadMediaPreferences } from '../lib/ui/mediaPreferences';

export interface VoiceMemoInputHandle {
  startRecording: (pushToTalk?: boolean) => void;
  stopAndPreview: () => void;
  sendRecordingDirectly: () => void;
  cancelRecording: () => void;
}

export interface VoiceMemoInputProps {
  onSendVoiceMemo: (note: VoiceNoteData) => void;
  onScheduleVoiceMemo?: (note: VoiceNoteData) => void;
  onActiveChange?: (isActive: boolean) => void;
  disabled?: boolean;
}

export const VoiceMemoInput = forwardRef<VoiceMemoInputHandle, VoiceMemoInputProps>(
  ({ onSendVoiceMemo, onScheduleVoiceMemo, onActiveChange, disabled = false }, ref) => {
    // Recording states
    const [isRecording, setIsRecording] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    // Push-to-talk mode: release sends. Hands-free / locked: release keeps recording.
    const [isPushToTalk, setIsPushToTalk] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [isSlidingUp, setIsSlidingUp] = useState(false);
    const [voiceSendMode] = useState(() => loadMediaPreferences().voiceSendMode);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [, setSlideOffset] = useState(0);
    const [isCanceling, setIsCanceling] = useState(false);
    const [recordingError, setRecordingError] = useState(false);
    const [stagedVoiceNote, setStagedVoiceNote] = useState<VoiceNoteData | null>(null);
    const { t } = useLanguage();

    // Live visual waveform bars (28 bars)
    const [liveBars, setLiveBars] = useState<number[]>([
      20, 25, 45, 60, 35, 20, 40, 70, 85, 55, 30, 45, 65, 80, 50, 25, 35, 60, 75,
      90, 45, 30, 40, 65, 50, 30, 25, 35,
    ]);

    // Audio Context & Mic Stream refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordedAudioUrlRef = useRef<string | null>(null);

    // Timers and gesture tracking refs
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const simWaveformIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const accumulatedSamplesRef = useRef<number[]>([]);
    const pointerStartPosRef = useRef<{ x: number; y: number } | null>(null);
    const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isHeldRef = useRef(false);
    const isRecordingRef = useRef(false);
    const isStartingRef = useRef(false);
    const isPushToTalkRef = useRef(false);
    const isCancelingRef = useRef(false);
    const recordingSecondsRef = useRef(0);
    const recordingRequestRef = useRef(0);
    const isLockedRef = useRef(false);

    // px to slide left to cancel
    const CANCEL_DRAG_THRESHOLD = 80;
    // px to slide up to lock hands-free recording
    const LOCK_DRAG_THRESHOLD = 50;

    // Notify parent whenever recording or staged preview is active
    useEffect(() => {
      const active = isRecording || stagedVoiceNote !== null;
      onActiveChange?.(active);
    }, [isRecording, stagedVoiceNote, onActiveChange]);

    // Format mm:ss
    const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // Stop all active microphone & audio streams
    const cleanupAudio = useCallback(() => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (simWaveformIntervalRef.current) {
        clearInterval(simWaveformIntervalRef.current);
        simWaveformIntervalRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch { /* ignore */ }
      }

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }

      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close();
        } catch { /* ignore */ }
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
    }, []);

    useEffect(() => {
      return () => {
        recordingRequestRef.current += 1;
        cleanupAudio();
      };
    }, [cleanupAudio]);

    // Start Voice Recording
    const startRecording = useCallback(
      async (pushToTalkMode = false) => {
        cleanupAudio();
        setStagedVoiceNote(null);
        setRecordingError(false);
        setIsStarting(true);
        isStartingRef.current = true;
        setRecordingSeconds(0);
        setSlideOffset(0);
        setIsCanceling(false);
        setIsPushToTalk(pushToTalkMode);
        setIsRecording(false);
        isRecordingRef.current = false;
        isPushToTalkRef.current = pushToTalkMode;
        accumulatedSamplesRef.current = [];
        audioChunksRef.current = [];
        recordedAudioUrlRef.current = null;
        const requestId = ++recordingRequestRef.current;

        try {
          if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            throw new Error('Voice recording is not supported');
          }

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (requestId !== recordingRequestRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          if (pushToTalkMode && !isHeldRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            setIsPushToTalk(false);
            isPushToTalkRef.current = false;
            return;
          }

          micStreamRef.current = stream;
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunksRef.current.push(event.data);
          };
          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.start(100);

          setIsRecording(true);
          isRecordingRef.current = true;
          recordingSecondsRef.current = 0;
          timerIntervalRef.current = setInterval(() => {
            recordingSecondsRef.current += 1;
            setRecordingSeconds((prev) => prev + 1);
          }, 1000);

          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(40);
          }

          let hasLiveAnalyser = false;
          try {
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) throw new Error('Web Audio API is not supported');
            const audioCtx = new AudioCtx();
            audioCtxRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateRealWaveform = () => {
              if (!analyserRef.current) return;
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const avgVolume = Math.min(100, Math.max(15, Math.floor((sum / dataArray.length) * 1.5)));
              accumulatedSamplesRef.current.push(avgVolume);
              setLiveBars((prev) => {
                const nextHeight = Math.max(18, Math.min(100, avgVolume + Math.floor(Math.random() * 15)));
                return [...prev.slice(1), nextHeight];
              });
              animFrameRef.current = requestAnimationFrame(updateRealWaveform);
            };

            hasLiveAnalyser = true;
            animFrameRef.current = requestAnimationFrame(updateRealWaveform);
          } catch {
            analyserRef.current = null;
          }

          if (!hasLiveAnalyser) {
            simWaveformIntervalRef.current = setInterval(() => {
              const timeFactor = Date.now() / 180;
              const baseWave = Math.sin(timeFactor) * 35;
              const modulation = Math.sin(timeFactor * 2.3) * 20;
              const jitter = Math.floor(Math.random() * 30);
              const height = Math.min(100, Math.max(18, Math.floor(45 + baseWave + modulation + jitter)));
              setLiveBars((prev) => [...prev.slice(1), height]);
            }, 80);
          }
        } catch {
          if (requestId === recordingRequestRef.current) {
            cleanupAudio();
            setIsRecording(false);
            isRecordingRef.current = false;
            setIsPushToTalk(false);
            isPushToTalkRef.current = false;
            setRecordingSeconds(0);
            setRecordingError(true);
          }
        } finally {
          if (requestId === recordingRequestRef.current) {
            setIsStarting(false);
            isStartingRef.current = false;
          }
        }
      },
      [cleanupAudio]
    );

    // Finalize waveform data from recorded samples
    const finalizeWaveformData = useCallback(
      (durationSecs: number): VoiceNoteData => {
        const formattedDuration = formatTime(durationSecs);
        const targetBars = 26;
        let finalWaveform: number[] = [];

        if (audioChunksRef.current.length > 0) {
          const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
          const blob = new Blob(audioChunksRef.current, { type: mime });
          if (blob.size === 0) throw new Error('The voice recording is empty');
          try {
            if (blob.size > 0) recordedAudioUrlRef.current = URL.createObjectURL(blob);
          } catch {
            // Some environments (older WebViews, hardened browsers) refuse blob
            // URLs; keep the note without a playable source instead of failing.
            recordedAudioUrlRef.current = null;
          }
        }

        const samples = accumulatedSamplesRef.current;
        if (samples.length > 0) {
          // Downsample/interpolate to 26 bars
          const step = samples.length / targetBars;
          for (let i = 0; i < targetBars; i++) {
            const idx = Math.min(samples.length - 1, Math.floor(i * step));
            finalWaveform.push(Math.max(18, Math.min(100, samples[idx])));
          }
        } else {
          // Fallback sinusoidal speech wave
          finalWaveform = Array.from({ length: targetBars }, (_, i) => {
            const sinWave = Math.sin((i / targetBars) * Math.PI) * 55;
            return Math.min(100, Math.max(20, Math.floor(sinWave + Math.random() * 30 + 15)));
          });
        }
        return {
          duration: formattedDuration,
          durationSeconds: durationSecs,
          waveform: finalWaveform,
          audioUrl: recordedAudioUrlRef.current || undefined,
        };
      },
      []
    );

    // Stop recording and stage voice note for preview
    const stopMediaRecorder = useCallback(async () => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) throw new Error('No active voice recorder');
      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve, reject) => {
          const onStop = () => {
            recorder.removeEventListener('error', onError);
            resolve();
          };
          const onError = () => {
            recorder.removeEventListener('stop', onStop);
            reject(new Error('Voice recording failed'));
          };
          recorder.addEventListener('stop', onStop, { once: true });
          recorder.addEventListener('error', onError, { once: true });
          try {
            recorder.stop();
          } catch (error) {
            recorder.removeEventListener('stop', onStop);
            recorder.removeEventListener('error', onError);
            reject(error);
          }
        });
      }
      if (!audioChunksRef.current.some((chunk) => chunk.size > 0)) {
        throw new Error('The voice recording is empty');
      }
      cleanupAudio();
    }, [cleanupAudio]);

    const stopAndPreview = useCallback(async () => {
      try {
        await stopMediaRecorder();
        const voiceNote = finalizeWaveformData(Math.max(1, recordingSecondsRef.current));
        setIsRecording(false);
        setIsPushToTalk(false);
        isRecordingRef.current = false;
        isPushToTalkRef.current = false;
        setStagedVoiceNote(voiceNote);

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(30);
        }
      } catch {
        cleanupAudio();
        setIsRecording(false);
        setIsPushToTalk(false);
        isRecordingRef.current = false;
        isPushToTalkRef.current = false;
        setRecordingError(true);
      }
    }, [cleanupAudio, finalizeWaveformData, stopMediaRecorder]);

    // Direct send voice note
    const sendRecordingDirectly = useCallback(async () => {
      try {
        await stopMediaRecorder();
        const voiceNote = finalizeWaveformData(Math.max(1, recordingSecondsRef.current));
        setIsRecording(false);
        setIsPushToTalk(false);
        isRecordingRef.current = false;
        isPushToTalkRef.current = false;
        onSendVoiceMemo(voiceNote);

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50);
        }
      } catch {
        cleanupAudio();
        setIsRecording(false);
        setIsPushToTalk(false);
        isRecordingRef.current = false;
        isPushToTalkRef.current = false;
        setRecordingError(true);
      }
    }, [cleanupAudio, finalizeWaveformData, onSendVoiceMemo, stopMediaRecorder]);

    // Cancel recording
    const cancelRecording = useCallback(() => {
      recordingRequestRef.current += 1;
      cleanupAudio();
      setIsStarting(false);
      isStartingRef.current = false;
      setIsRecording(false);
      setIsPushToTalk(false);
      isRecordingRef.current = false;
      isPushToTalkRef.current = false;
      isLockedRef.current = false;
      setIsLocked(false);
      setIsSlidingUp(false);
      setRecordingSeconds(0);
      setStagedVoiceNote(null);
      setSlideOffset(0);
      setIsCanceling(false);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([30, 50, 30]);
      }
    }, [cleanupAudio]);

    // Expose handle for parent components
    useImperativeHandle(
      ref,
      () => ({
        startRecording: (pushToTalk = false) => startRecording(pushToTalk),
        stopAndPreview: () => stopAndPreview(),
        sendRecordingDirectly: () => sendRecordingDirectly(),
        cancelRecording: () => cancelRecording(),
      }),
      [startRecording, stopAndPreview, sendRecordingDirectly, cancelRecording]
    );

  // 1. STAGED REVIEW MODE: User stopped recording and can listen to the waveform
  useEffect(() => () => detachGestureListeners(), []);

  // One-handed gesture model:
  //  tap → hands-free recording · hold+release → send · hold+slide ↑ → lock · slide ← → cancel
  // Tracked on window listeners so it keeps working outside the mic button.
  function onWindowPointerMove(e: PointerEvent) {
    if (!pointerStartPosRef.current) return;
    const deltaX = e.clientX - pointerStartPosRef.current.x;
    const deltaY = pointerStartPosRef.current.y - e.clientY;

    if (!isRecordingRef.current) {
      // Still waiting for the hold threshold: release the pending start if the
      // finger travels too far (it is a scroll, not a hold).
      if (Math.abs(deltaX) > 14 || Math.abs(deltaY) > 14) {
        if (holdTimeoutRef.current) {
          clearTimeout(holdTimeoutRef.current);
          holdTimeoutRef.current = null;
        }
        pointerStartPosRef.current = null;
        detachGestureListeners();
      }
      return;
    }

    if (!isPushToTalkRef.current || isLockedRef.current) return;

    if (deltaX < 0) {
      const offset = Math.abs(deltaX);
      setSlideOffset(offset);
      const shouldCancel = offset >= CANCEL_DRAG_THRESHOLD;
      setIsCanceling(shouldCancel);
      isCancelingRef.current = shouldCancel;
    }

    const shouldShowLockHint = deltaY >= 12 && !isCancelingRef.current;
    setIsSlidingUp(shouldShowLockHint);

    if (deltaY >= LOCK_DRAG_THRESHOLD && !isCancelingRef.current) {
      // Slide up = keep recording hands-free after the thumb is lifted.
      isLockedRef.current = true;
      setIsLocked(true);
      setIsPushToTalk(false);
      isPushToTalkRef.current = false;
      setIsSlidingUp(false);
      setSlideOffset(0);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([15, 30, 15]);
      }
    }
  }

  function onWindowPointerUp() {
    holdTimeoutRef.current && clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
    detachGestureListeners();
    setIsSlidingUp(false);

    const wasHeld = isHeldRef.current;
    isHeldRef.current = false;
    pointerStartPosRef.current = null;

    if (isLockedRef.current) return;

    if (isStartingRef.current && isPushToTalkRef.current) {
      // Mic permission still pending and the thumb is gone: drop it silently.
      setIsPushToTalk(false);
      isPushToTalkRef.current = false;
      return;
    }

    if (isRecordingRef.current && isPushToTalkRef.current) {
      if (isCancelingRef.current) {
        cancelRecording();
      } else {
        void sendRecordingDirectly();
      }
      return;
    }

    // Quick tap: start hands-free recording mode.
    if (!wasHeld && !isRecordingRef.current && !isStartingRef.current) {
      void startRecording(false);
    }
  }

  function onWindowPointerCancel() {
    holdTimeoutRef.current && clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
    detachGestureListeners();
    setIsSlidingUp(false);
    pointerStartPosRef.current = null;
    isHeldRef.current = false;

    if (isLockedRef.current) return;

    if (isStartingRef.current && isPushToTalkRef.current) {
      setIsPushToTalk(false);
      isPushToTalkRef.current = false;
      return;
    }
    if (isRecordingRef.current && isPushToTalkRef.current) {
      cancelRecording();
    }
  }

  const detachGestureListeners = () => {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerCancel);
  };

  const beginPointerGesture = (e: React.PointerEvent) => {
    if (disabled || isRecordingRef.current || isStartingRef.current || isLockedRef.current) return;

    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    isHeldRef.current = false;
    setIsSlidingUp(false);

    // Classic mode records instantly on touch; lock mode waits a beat so a
    // quick tap can still mean "hands-free".
    const begin = () => {
      isHeldRef.current = true;
      void startRecording(true);
    };
    if (voiceSendMode === 'hold') {
      begin();
    } else {
      holdTimeoutRef.current = setTimeout(begin, 260);
    }

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
  };

  // 1. STAGED REVIEW MODE: User stopped recording and can listen to the waveform
  if (stagedVoiceNote) {
    return (
      <div className="flex items-center gap-2 animate-in fade-in duration-200 w-full select-none">
        {/* Delete button */}
        <button
          type="button"
          onClick={() => setStagedVoiceNote(null)}
          className="w-11 h-11 rounded-full bg-[#181920]/95 hover:bg-red-950/60 border border-white/10 hover:border-red-500/40 text-white/70 hover:text-red-400 flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0"
          title="Discard voice recording"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Staged Audio Waveform Player */}
        <div className="flex-1 bg-[#181920]/95 border border-[var(--nova-accent-color)]/45 rounded-full px-3.5 py-1.5 flex items-center justify-between shadow-lg shadow-black/50 min-w-0">
          <AudioWaveformPlayer
            voiceNote={stagedVoiceNote}
            isMe={true}
            compact={true}
            accentColor="#ff4e18"
          />
        </div>

        {/* Re-record button */}
        <button
          type="button"
          onClick={() => startRecording(false)}
          className="w-11 h-11 rounded-full bg-[#181920]/95 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0"
          title="Re-record voice note"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Send Button: tap sends now, long-press schedules */}
        <button
          type="button"
          aria-label={t('voiceMemo.send')}
          onClick={() => {
            onSendVoiceMemo(stagedVoiceNote);
            setStagedVoiceNote(null);
          }}
          onPointerDown={() => {
            holdTimeoutRef.current = setTimeout(() => {
              if (onScheduleVoiceMemo) {
                onScheduleVoiceMemo(stagedVoiceNote);
                setStagedVoiceNote(null);
              }
            }, 550);
          }}
          onPointerUp={() => {
            if (holdTimeoutRef.current) {
              clearTimeout(holdTimeoutRef.current);
              holdTimeoutRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (holdTimeoutRef.current) {
              clearTimeout(holdTimeoutRef.current);
              holdTimeoutRef.current = null;
            }
          }}
          onContextMenu={(e) => {
            if (onScheduleVoiceMemo) {
              e.preventDefault();
              onScheduleVoiceMemo(stagedVoiceNote);
              setStagedVoiceNote(null);
            }
          }}
          className="w-11 h-11 rounded-full bg-[var(--nova-accent-color)] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-[var(--nova-accent-color)]/40 transition cursor-pointer shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nova-accent-color)] touch-manipulation"
          title="Send voice note (hold to schedule)"
        >
          <Send className="w-4 h-4 ml-0.5" />
        </button>
      </div>
    );
  }



  if (isRecording) {
    return (
      <div
        className="flex items-center gap-2 animate-in fade-in duration-200 w-full select-none"
      >
        {/* Cancel / Trash Button */}
        <button
          type="button"
          onClick={cancelRecording}
          className={`w-11 h-11 rounded-full border flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md shrink-0 ${
            isCanceling
              ? 'bg-red-500 text-white border-red-500 scale-110'
              : 'bg-[#181920]/95 hover:bg-red-950/60 border-white/10 hover:border-red-500/40 text-white/70 hover:text-red-400'
          }`}
          title={t('voiceMemo.cancel', 'Cancel')}
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* Live Audio Frequency Waveform Console */}
        <div
          className={`flex-1 bg-[#181920]/95 border rounded-full px-4 py-2 flex items-center justify-between shadow-lg shadow-black/50 transition-colors min-w-0 ${
            isCanceling
              ? 'border-red-500/70 bg-red-950/30'
              : isLocked
                ? 'border-emerald-400/50'
                : 'border-[var(--nova-accent-color)]/50 focus-within:border-[var(--nova-accent-color)]'
          }`}
        >
          {/* Pulsing Beacon & Duration Counter */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative flex items-center justify-center">
              <span className={`w-2.5 h-2.5 rounded-full relative nova-rec-pulse ${isLocked ? 'bg-emerald-400' : 'bg-[var(--nova-accent-color)]'}`} />
            </div>
            <span className="text-xs font-mono font-semibold text-white tracking-wider">
              {formatTime(recordingSeconds)}
            </span>
          </div>

          {/* Real-time Responsive Audio Waveform (28 frequency bars) */}
          <div className="flex items-center gap-[2px] h-6 px-2 flex-1 justify-center max-w-[210px] overflow-hidden">
            {liveBars.map((height, idx) => (
              <span
                key={idx}
                style={{ height: `${height}%` }}
                className={`w-1 rounded-full transition-all duration-75 ${
                  isCanceling
                    ? 'bg-red-400'
                    : isLocked
                      ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
                      : 'bg-[var(--nova-accent-color)] shadow-[0_0_4px_rgba(255,78,24,0.5)]'
                }`}
              />
            ))}
          </div>

          {/* Slide guidance / locked label */}
          {isPushToTalk && !isLocked ? (
            <div
              className={`text-[10px] font-medium flex items-center gap-1 transition-opacity shrink-0 ${
                isCanceling ? 'text-red-400 font-bold' : 'text-white/60'
              }`}
            >
              <span>{isCanceling ? t('voiceMemo.releaseToCancel', 'Release to cancel') : t('voiceMemo.slideToCancelShort', '‹ cancel · lock ↑')}</span>
            </div>
          ) : (
            <span className={`text-[10.5px] font-medium shrink-0 flex items-center gap-1 ${isLocked ? 'text-emerald-300' : 'text-white/50'}`}>
              {isLocked && <Lock className="w-3 h-3" />}
              {isLocked ? t('voiceMemo.locked', 'Locked') : t('voiceMemo.recording')}
            </span>
          )}
        </div>

        {/* Hands-Free Controls: Pause/Preview and Direct Send */}
        {!isPushToTalk || isLocked ? (
          <>
            <button
              type="button"
              onClick={stopAndPreview}
              className="w-11 h-11 rounded-full bg-[#20222e] hover:bg-[#2b2d3c] border border-white/15 text-white flex items-center justify-center active:scale-90 transition cursor-pointer shadow-md shrink-0"
              title={t('voiceMemo.stopAndPreview', 'Stop and preview')}
            >
              <Square className="w-3.5 h-3.5 fill-white text-white" />
            </button>

            <button
              type="button"
              aria-label={t('voiceMemo.send')}
              onClick={sendRecordingDirectly}
              className="w-11 h-11 rounded-full bg-[var(--nova-accent-color)] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-[var(--nova-accent-color)]/40 transition cursor-pointer shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nova-accent-color)]"
              title={t('voiceMemo.sendNow', 'Send now')}
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </>
        ) : (
          /* While holding: the right slot doubles as the "slide up to lock" target */
          <div
            aria-hidden="true"
            className={`flex flex-col items-center justify-center w-11 h-11 rounded-full border shrink-0 transition-all duration-150 ${
              isSlidingUp
                ? 'bg-emerald-500 text-white border-emerald-400 scale-110 shadow-lg shadow-emerald-500/40'
                : 'bg-[#181920]/95 text-white/60 border-white/10'
            }`}
            title={t('voiceMemo.slideUpToLock', 'Slide up to lock')}
          >
            {isSlidingUp ? <Unlock className="w-4 h-4" /> : <ChevronUp className="w-4 h-4 animate-bounce" />}
          </div>
        )}
      </div>
    );
  }

    // 3. DEFAULT IDLE MICROPHONE BUTTON
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label={t('voiceMemo.tapToRecord')}
          aria-busy={isStarting}
          onPointerDown={beginPointerGesture}
          disabled={disabled || isStarting}
          className="w-11 h-11 rounded-full bg-[#181920]/95 hover:bg-[var(--nova-accent-color)] hover:text-white hover:shadow-lg hover:shadow-[var(--nova-accent-color)]/30 border border-white/10 text-white/80 flex items-center justify-center active:scale-90 transition cursor-pointer shadow-md group touch-manipulation disabled:opacity-60 disabled:cursor-wait"
          title={
            voiceSendMode === 'hold'
              ? t('voiceMemo.holdToRecord', 'Hold to record, release to send')
              : t('voiceMemo.oneHandHint', 'Tap to record · hold and slide up to lock · slide left to cancel')
          }
        >
          <Mic className="w-4 h-4 group-hover:scale-110 transition-transform text-[var(--nova-accent-color)] group-hover:text-white" />
        </button>
        {recordingError && (
          <span
            role="alert"
            className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border border-red-400/25 bg-red-950/95 px-3 py-2 text-xs leading-relaxed text-red-100 shadow-xl"
          >
            {t('voiceMemo.microphoneUnavailable')}
          </span>
        )}
      </div>
    );
  }
);

VoiceMemoInput.displayName = 'VoiceMemoInput';
