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
  ChevronLeft,
  Volume2,
  RefreshCw,
} from 'lucide-react';
import { VoiceNoteData } from '../types/messenger';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';

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
    const [isPushToTalk, setIsPushToTalk] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [slideOffset, setSlideOffset] = useState(0);
    const [isCanceling, setIsCanceling] = useState(false);
    const [stagedVoiceNote, setStagedVoiceNote] = useState<VoiceNoteData | null>(null);

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

    const CANCEL_DRAG_THRESHOLD = 80; // px to the left to cancel

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
        } catch {}
      }

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }

      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close();
        } catch {}
        audioCtxRef.current = null;
      }
    }, []);

    useEffect(() => {
      return () => {
        cleanupAudio();
      };
    }, [cleanupAudio]);

    // Start Voice Recording
    const startRecording = useCallback(
      async (pushToTalkMode = false) => {
        cleanupAudio();
        setStagedVoiceNote(null);
        setRecordingSeconds(0);
        setSlideOffset(0);
        setIsCanceling(false);
        setIsPushToTalk(pushToTalkMode);
        setIsRecording(true);
        accumulatedSamplesRef.current = [];
        audioChunksRef.current = [];
        recordedAudioUrlRef.current = null;

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(40);
        }

        // Timer counter
        timerIntervalRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);

        // Try real microphone access
        let micSucceeded = false;
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;

            // Initialize Web Audio API Analyser
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
            const audioCtx = new AudioCtx();
            audioCtxRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            analyserRef.current = analyser;

            // Setup MediaRecorder
            try {
              const mediaRecorder = new MediaRecorder(stream);
              mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
              };
              mediaRecorder.start(100);
              mediaRecorderRef.current = mediaRecorder;
            } catch {}

            // Live visual frequency loop
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateRealWaveform = () => {
              if (!analyserRef.current) return;
              analyserRef.current.getByteFrequencyData(dataArray);

              // Sample average volume
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avgVolume = Math.min(100, Math.max(15, Math.floor((sum / dataArray.length) * 1.5)));
              accumulatedSamplesRef.current.push(avgVolume);

              // Update the 28 live bars
              setLiveBars((prev) => {
                const nextHeight = Math.max(
                  18,
                  Math.min(100, avgVolume + Math.floor(Math.random() * 15))
                );
                return [...prev.slice(1), nextHeight];
              });

              animFrameRef.current = requestAnimationFrame(updateRealWaveform);
            };

            micSucceeded = true;
            animFrameRef.current = requestAnimationFrame(updateRealWaveform);
          }
        } catch {
          // Microphone was denied or unsupported, fallback smoothly to organic speech simulation
          micSucceeded = false;
        }

        // Fallback speech frequency simulation
        if (!micSucceeded) {
          simWaveformIntervalRef.current = setInterval(() => {
            // Natural human speech cadence: pauses, syllables, and voice bursts
            const timeFactor = Date.now() / 180;
            const baseWave = Math.sin(timeFactor) * 35;
            const modulation = Math.sin(timeFactor * 2.3) * 20;
            const jitter = Math.floor(Math.random() * 30);
            const height = Math.min(
              100,
              Math.max(18, Math.floor(45 + baseWave + modulation + jitter))
            );

            accumulatedSamplesRef.current.push(height);

            setLiveBars((prev) => {
              return [...prev.slice(1), height];
            });
          }, 80);
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
          try {
            const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
            const blob = new Blob(audioChunksRef.current, { type: mime });
            recordedAudioUrlRef.current = URL.createObjectURL(blob);
          } catch {}
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
    const stopAndPreview = useCallback(() => {
      const duration = Math.max(1, recordingSeconds);
      cleanupAudio();
      setIsRecording(false);
      setIsPushToTalk(false);

      const voiceNote = finalizeWaveformData(duration);
      setStagedVoiceNote(voiceNote);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
      }
    }, [cleanupAudio, finalizeWaveformData, recordingSeconds]);

    // Direct send voice note
    const sendRecordingDirectly = useCallback(() => {
      const duration = Math.max(1, recordingSeconds);
      cleanupAudio();
      setIsRecording(false);
      setIsPushToTalk(false);

      const voiceNote = finalizeWaveformData(duration);
      onSendVoiceMemo(voiceNote);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, [cleanupAudio, finalizeWaveformData, onSendVoiceMemo, recordingSeconds]);

    // Cancel recording
    const cancelRecording = useCallback(() => {
      cleanupAudio();
      setIsRecording(false);
      setIsPushToTalk(false);
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

    // Pointer Handlers for Push-to-Talk (Hold-to-record & Slide-to-cancel)
    const handlePointerDown = (e: React.PointerEvent) => {
      if (disabled || isRecording || stagedVoiceNote) return;

      pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
      isHeldRef.current = false;

      // After 300ms of hold, start push-to-talk recording
      holdTimeoutRef.current = setTimeout(() => {
        isHeldRef.current = true;
        startRecording(true);
      }, 300);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!isRecording || !isPushToTalk || !pointerStartPosRef.current) return;

      const deltaX = e.clientX - pointerStartPosRef.current.x;
      if (deltaX < 0) {
        const offset = Math.abs(deltaX);
        setSlideOffset(offset);
        if (offset >= CANCEL_DRAG_THRESHOLD) {
          setIsCanceling(true);
        } else {
          setIsCanceling(false);
        }
      }
    };

    const handlePointerUp = () => {
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }

      if (!isHeldRef.current) {
        // Just a quick tap: start hands-free recording mode!
        if (!isRecording && !stagedVoiceNote) {
          startRecording(false);
        }
        return;
      }

      // Released from Push-to-Talk
      if (isRecording && isPushToTalk) {
        if (isCanceling || slideOffset >= CANCEL_DRAG_THRESHOLD) {
          cancelRecording();
        } else {
          sendRecordingDirectly();
        }
      }

      isHeldRef.current = false;
      pointerStartPosRef.current = null;
    };

    const handlePointerCancel = () => {
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
      if (isRecording && isPushToTalk) {
        cancelRecording();
      }
      isHeldRef.current = false;
      pointerStartPosRef.current = null;
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
          <div className="flex-1 bg-[#181920]/95 border border-[#ff4e18]/45 rounded-full px-3.5 py-1.5 flex items-center justify-between shadow-lg shadow-black/50 min-w-0">
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

          {/* Send Button */}
          <button
            type="button"
            onClick={() => {
              onSendVoiceMemo(stagedVoiceNote);
              setStagedVoiceNote(null);
            }}
            onContextMenu={(e) => {
              if (onScheduleVoiceMemo) {
                e.preventDefault();
                onScheduleVoiceMemo(stagedVoiceNote);
                setStagedVoiceNote(null);
              }
            }}
            className="w-11 h-11 rounded-full bg-[#ff4e18] hover:bg-[#ff5d2b] active:scale-90 text-white flex items-center justify-center shadow-lg shadow-[#ff4e18]/40 transition cursor-pointer shrink-0"
            title="Send voice note (right click to schedule)"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      );
    }

    // 2. ACTIVE RECORDING MODE (Either Hands-free or Push-to-Talk)
    if (isRecording) {
      return (
        <div
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
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
            title="Cancel recording"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Live Audio Frequency Waveform Console */}
          <div
            className={`flex-1 bg-[#181920]/95 border rounded-full px-4 py-2 flex items-center justify-between shadow-lg shadow-black/50 transition-colors min-w-0 ${
              isCanceling
                ? 'border-red-500/70 bg-red-950/30'
                : 'border-[#ff4e18]/50 focus-within:border-[#ff4e18]'
            }`}
          >
            {/* Pulsing Beacon & Duration Counter */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="relative flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff4e18] animate-ping absolute opacity-80" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff4e18] relative" />
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
                      : 'bg-[#ff4e18] shadow-[0_0_4px_rgba(255,78,24,0.5)]'
                  }`}
                />
              ))}
            </div>

            {/* Slide-to-cancel guidance or Recording Label */}
            {isPushToTalk ? (
              <div
                className={`text-[10px] font-medium flex items-center gap-1 transition-opacity shrink-0 ${
                  isCanceling ? 'text-red-400 font-bold' : 'text-white/60'
                }`}
              >
                <ChevronLeft className="w-3 h-3 animate-pulse" />
                <span>{isCanceling ? 'Release to cancel' : 'Slide to cancel'}</span>
              </div>
            ) : (
              <span className="text-[10.5px] text-white/50 font-medium shrink-0">
                Recording...
              </span>
            )}
          </div>

          {/* Hands-Free Controls: Pause/Preview and Direct Send */}
          {!isPushToTalk ? (
            <>
              <button
                type="button"
                onClick={stopAndPreview}
                className="w-11 h-11 rounded-full bg-[#20222e] hover:bg-[#2b2d3c] border border-white/15 text-white flex items-center justify-center active:scale-90 transition cursor-pointer shadow-md shrink-0"
                title="Stop and preview voice waveform"
              >
                <Square className="w-3.5 h-3.5 fill-white text-white" />
              </button>

              <button
                type="button"
                onClick={sendRecordingDirectly}
                className="w-11 h-11 rounded-full bg-[#ff4e18] hover:bg-[#ff5d2b] active:scale-90 text-white flex items-center justify-center shadow-lg shadow-[#ff4e18]/40 transition cursor-pointer shrink-0"
                title="Send voice memo now"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </>
          ) : (
            /* Push-to-Talk Send Button */
            <div
              className="w-11 h-11 rounded-full bg-[#ff4e18] text-white flex items-center justify-center shadow-xl shadow-[#ff4e18]/50 animate-pulse shrink-0"
              title="Recording in progress"
            >
              <Mic className="w-4 h-4" />
            </div>
          )}
        </div>
      );
    }

    // 3. DEFAULT IDLE MICROPHONE BUTTON
    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        disabled={disabled}
        className="w-11 h-11 rounded-full bg-[#181920]/95 hover:bg-[#ff4e18] hover:text-white hover:shadow-lg hover:shadow-[#ff4e18]/30 border border-white/10 text-white/80 flex items-center justify-center active:scale-90 transition cursor-pointer shadow-md group shrink-0 touch-manipulation relative"
        title="Tap to record or hold for push-to-talk voice memo"
      >
        <Mic className="w-4 h-4 group-hover:scale-110 transition-transform text-[#ff4e18] group-hover:text-white" />
      </button>
    );
  }
);

VoiceMemoInput.displayName = 'VoiceMemoInput';
