import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { VoiceNoteData } from '../types/messenger';

interface AudioWaveformPlayerProps {
  voiceNote: VoiceNoteData;
  isMe?: boolean;
  compact?: boolean;
  autoPlayOnMount?: boolean;
  onPlaybackEnd?: () => void;
  accentColor?: string;
  showSpeedButton?: boolean;
}

export const AudioWaveformPlayer: React.FC<AudioWaveformPlayerProps> = ({
  voiceNote,
  isMe = false,
  compact = false,
  autoPlayOnMount = false,
  onPlaybackEnd,
  accentColor = '#ff4e18',
  showSpeedButton = true,
}) => {
  const [isPlaying, setIsPlaying] = useState(autoPlayOnMount);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const duration = voiceNote.durationSeconds || 10;
  const waveform = useMemo(() => voiceNote.waveform && voiceNote.waveform.length > 0
    ? voiceNote.waveform
    : [20, 35, 50, 70, 90, 60, 40, 65, 80, 95, 60, 45, 30, 50, 75, 85, 60, 40, 25, 35],
  [voiceNote.waveform]);

  // Setup real audio if audioUrl is provided
  useEffect(() => {
    if (voiceNote.audioUrl) {
      const audio = new Audio(voiceNote.audioUrl);
      audio.playbackRate = playbackSpeed;
      audioElementRef.current = audio;
      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        onPlaybackEnd?.();
      };
      return () => {
        audio.pause();
        audioElementRef.current = null;
      };
    }
  }, [voiceNote.audioUrl, playbackSpeed, onPlaybackEnd]);

  // Soft synth sound generator when playing without audioUrl
  const startAudioTone = useCallback((progress: number) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      // Stop previous oscillator if any
      if (oscRef.current) {
        try {
          oscRef.current.stop();
          oscRef.current.disconnect();
        } catch {
          void 0;
        }
      }

      const barIndex = Math.min(
        waveform.length - 1,
        Math.floor(progress * waveform.length)
      );
      const barHeight = waveform[barIndex] || 50;

      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();

      osc.type = 'sine';
      // Harmonic pleasant frequencies (human vocal formant range 240Hz - 480Hz)
      osc.frequency.setValueAtTime(240 + barHeight * 2.2, audioCtxRef.current.currentTime);

      gain.gain.setValueAtTime(0.001, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, audioCtxRef.current.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);

      osc.start();
      oscRef.current = osc;
      gainRef.current = gain;
    } catch {
      // AudioContext may be restricted by browser policy before user interaction
    }
  }, [waveform]);

  const stopAudioTone = () => {
    try {
      if (gainRef.current && audioCtxRef.current) {
        gainRef.current.gain.exponentialRampToValueAtTime(
          0.0001,
          audioCtxRef.current.currentTime + 0.08
        );
      }
      if (oscRef.current) {
        setTimeout(() => {
          try {
            oscRef.current?.stop();
            oscRef.current?.disconnect();
            oscRef.current = null;
          } catch {
            void 0;
          }
        }, 100);
      }
    } catch {
      void 0;
    }
  };

  // Playback timer loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isPlaying) {
      if (audioElementRef.current) {
        audioElementRef.current.currentTime = currentTime;
        audioElementRef.current.playbackRate = playbackSpeed;
        audioElementRef.current.play().catch(() => {});
      } else {
        startAudioTone(currentTime / duration);
      }

      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (audioElementRef.current && !audioElementRef.current.paused) {
            return audioElementRef.current.currentTime;
          }

          const step = 0.1 * playbackSpeed;
          const next = prev + step;

          if (next >= duration) {
            setIsPlaying(false);
            stopAudioTone();
            if (onPlaybackEnd) onPlaybackEnd();
            return 0;
          }

          // Update tone frequency gently as progress moves across bars
          if (oscRef.current && audioCtxRef.current) {
            const barIndex = Math.min(
              waveform.length - 1,
              Math.floor((next / duration) * waveform.length)
            );
            const barHeight = waveform[barIndex] || 50;
            oscRef.current.frequency.setTargetAtTime(
              240 + barHeight * 2.2,
              audioCtxRef.current.currentTime,
              0.08
            );
          }

          return next;
        });
      }, 100);
    } else {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      stopAudioTone();
    }

    return () => {
      clearInterval(interval);
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      stopAudioTone();
    };
  }, [isPlaying, playbackSpeed, duration, waveform, currentTime, onPlaybackEnd, startAudioTone]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentTime >= duration - 0.2) {
        setCurrentTime(0);
      }
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const newProgress = index / waveform.length;
    const newTime = newProgress * duration;
    setCurrentTime(newTime);
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = newTime;
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playbackSpeed === 1) setPlaybackSpeed(1.5);
    else if (playbackSpeed === 1.5) setPlaybackSpeed(2);
    else setPlaybackSpeed(1);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressFraction = duration > 0 ? currentTime / duration : 0;
  const activeBarIndex = Math.floor(progressFraction * waveform.length);

  return (
    <div
      className={`flex min-w-0 max-w-full items-center gap-2.5 select-none ${
        compact ? 'py-0.5' : 'py-1'
      }`}
    >
      {/* Circular Play/Pause Button */}
      <button
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 cursor-pointer shadow-md ${
          isMe
            ? 'bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5f2b)] text-white shadow-[var(--nova-accent-color)]/25'
            : 'bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5f2b)] text-white shadow-black/40'
        }`}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-white" />
        ) : (
          <Play className="w-4 h-4 fill-white ml-0.5" />
        )}
      </button>

      {/* Waveform Bars & Time Info */}
      <div className="flex min-w-0 max-w-[260px] flex-1 flex-col justify-center">
        {/* Interactive Waveform Bar Visualizer */}
        <div
          className="flex items-center gap-[2px] h-7 cursor-pointer group py-1"
          title="Click to seek"
        >
          {waveform.map((height, i) => {
            const isPlayed = i <= activeBarIndex;
            // Normalize height between 18% and 100%
            const normalizedHeight = Math.max(18, Math.min(100, height));

            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={(e) => handleSeek(e, i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSeek(e as unknown as React.MouseEvent, i);
                  }
                }}
                className="flex-1 flex items-center justify-center h-full group-hover:opacity-90"
              >
                <div
                  style={{
                    height: `${normalizedHeight}%`,
                    backgroundColor: isPlayed ? accentColor : isMe ? 'rgba(255,255,255,0.22)' : '#2b2d38',
                  }}
                  className={`w-full rounded-full transition-colors duration-100 ${
                    isPlayed ? 'shadow-[0_0_6px_rgba(255,78,24,0.4)]' : ''
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Time Progress and Total Duration */}
        <div className="mt-0.5 flex items-center justify-between gap-2 px-0.5 font-mono text-[10px] text-white/50">
          <span className="whitespace-nowrap">
            {isPlaying || currentTime > 0
              ? formatTime(currentTime)
              : voiceNote.duration || formatTime(duration)}
          </span>
          <span className="whitespace-nowrap text-white/35">
            {voiceNote.duration || formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Speed Multiplier Pill (1x, 1.5x, 2x) */}
      {showSpeedButton && (
        <button
          onClick={cycleSpeed}
          className="min-w-6 min-h-6 px-1.5 py-0.5 rounded-full bg-white/10 hover:bg-white/15 text-[10px] font-semibold text-white/75 hover:text-white transition cursor-pointer shrink-0"
          title="Playback speed"
        >
          {playbackSpeed}x
        </button>
      )}
    </div>
  );
};
