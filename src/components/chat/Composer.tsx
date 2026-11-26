import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  createPortal } from 'react-dom';
import { hapticLight } from '../../lib/ui/haptics';
import {IconClock as Clock,
  IconEye as Eye,
  IconMicrophone as Microphone,
  IconMoodSmile as MoodSmile,
  IconPaperclip as Paperclip,
  IconSend as Send,
  IconVolumeOff as VolumeOff,
  IconMicrophone as MicIcon,
  IconPaperclip as PaperclipIcon,
  IconSend as SendIcon,
  IconVolumeOff as VolumeX,
} from '@tabler/icons-react';
import { useLanguage } from '../../context/LanguageContext';
import { NovaTooltip } from '../../lib/ui';

interface ComposerProps {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  onAttach: () => void;
  onVoiceStart: () => void;
  onVoiceEnd: () => void;
  isRecording: boolean;
  disabled?: boolean;
  showOptions?: boolean;
  onOptionsToggle?: () => void;
  hasAttachment?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  draft,
  onDraftChange,
  onSend,
  onAttach,
  onVoiceStart,
  onVoiceEnd,
  isRecording,
  disabled = false,
  showOptions = false,
  onOptionsToggle,
  hasAttachment = false,
}) => {
  const { t } = useLanguage();
  const textareaRef = useRef<globalThis.HTMLTextAreaElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);

  const hasContent = draft.trim().length > 0 || hasAttachment;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (hasContent) onSend();
    }
  }, [hasContent, onSend]);

  const handleInput = useCallback((e: React.ChangeEvent<globalThis.HTMLTextAreaElement>) => {
    onDraftChange(e.target.value);
  }, [onDraftChange]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Virtual keyboard avoidance - keep composer above on-screen keyboard
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleResize = () => {
      const keyboardHeight = window.innerHeight - visualViewport.height;
      if (keyboardHeight > 150) {
        document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
      } else {
        document.documentElement.style.removeProperty('--keyboard-height');
      }
    };

    visualViewport.addEventListener('resize', handleResize);
    visualViewport.addEventListener('scroll', handleResize);

    handleResize();

    return () => {
      visualViewport.removeEventListener('resize', handleResize);
      visualViewport.removeEventListener('scroll', handleResize);
      document.documentElement.style.removeProperty('--keyboard-height');
    };
  }, []);

  // Haptic feedback on send
  const handleSend = useCallback(() => {
    if (disabled || !hasContent) return;
    onSend();
    hapticLight();
  }, [disabled, hasContent, onSend]);

  // Handle long press / right click on send button for send options
  const handleSendContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowSendOptions(true);
  }, []);

  const handleSendMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return; // Right click handled by contextMenu
    const timer = setTimeout(() => {
      setShowSendOptions(true);
    }, 400);
    const cleanup = () => clearTimeout(timer);
    window.addEventListener('mouseup', cleanup, { once: true });
    window.addEventListener('mouseleave', cleanup, { once: true });
  }, []);

  // Send options menu portal
  const sendOptionsMenu = showSendOptions && sendButtonRef.current && createPortal(
    <div
      className="fixed z-[80] bg-[var(--nova-surface)] border border-[var(--nova-border-color)] rounded-2xl px-1 py-1.5 shadow-xl shadow-black/80 animate-in fade-in-10 zoom-in-95 duration-150 min-w-[180px]"
      style={{
        bottom: sendButtonRef.current.getBoundingClientRect().bottom + 8,
        left: sendButtonRef.current.getBoundingClientRect().left - 160,
      }}
      role="menu"
      aria-label={t('chat.sendOptions')}
    >
      <button
        role="menuitem"
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:bg-[var(--nova-overlay-strong)] transition cursor-pointer"
        onClick={() => {
          setShowSendOptions(false);
          // TODO: Implement silent send
        }}
      >
        <VolumeX className="w-5 h-5 text-[var(--nova-text-secondary)]" />
        <span>{t('chat.sendSilent')}</span>
      </button>
      <button
        role="menuitem"
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:bg-[var(--nova-overlay-strong)] transition cursor-pointer"
        onClick={() => {
          setShowSendOptions(false);
          // TODO: Implement schedule send
        }}
      >
        <Clock className="w-5 h-5 text-[var(--nova-text-secondary)]" />
        <span>{t('chat.scheduleSend')}</span>
      </button>
      <button
        role="menuitem"
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] active:bg-[var(--nova-overlay-strong)] transition cursor-pointer"
        onClick={() => {
          setShowSendOptions(false);
          // TODO: Implement view once
        }}
      >
        <Eye className="w-5 h-5 text-[var(--nova-text-secondary)]" />
        <span>{t('chat.viewOnce')}</span>
      </button>
    </div>,
    document.body,
  );

  // Close send options on outside click
  useEffect(() => {
    if (!showSendOptions) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (sendButtonRef.current && !sendButtonRef.current.contains(event.target as Node)) {
        setShowSendOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSendOptions]);

  return (
    <div className="flex items-end gap-1.5 p-2.5 bg-[var(--nova-surface)] border-t border-[var(--nova-border-subtle)]" style={{ paddingBottom: 'calc(0.625rem + max(var(--nova-safe-bottom), var(--keyboard-height, 0px)))' }}>
      <button
        type="button"
        onClick={onAttach}
        disabled={disabled}
        className="p-1.5 rounded-full text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)] active:bg-[var(--nova-overlay-medium)] transition cursor-pointer disabled:opacity-50"
        aria-label={t('chat.attach')}
      >
        <PaperclipIcon className="w-4.5 h-4.5" />
      </button>

      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={t('chat.messagePlaceholder', { defaultValue: 'Message…' })}
          className="w-full min-h-[40px] max-h-28 px-3 py-2 pr-10 rounded-xl bg-[var(--nova-overlay-weak)] text-sm text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--nova-accent-color)] resize-none transition"
          rows={1}
        />

        <div className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 rounded-full text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)] active:bg-[var(--nova-overlay-medium)] transition cursor-pointer"
            aria-label={t('chat.emoji')}
          >
            <MoodSmile className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Dynamic Mic ↔ Send button */}
      <div className="relative">
        {hasContent ? (
          <>
            <button
              ref={sendButtonRef}
              type="button"
              onClick={handleSend}
              onContextMenu={handleSendContextMenu}
              onMouseDown={handleSendMouseDown}
              disabled={disabled}
              className="p-2 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] hover:opacity-90 active:brightness-95 transition cursor-pointer disabled:opacity-50"
              aria-label={t('chat.send')}
              aria-haspopup="menu"
              aria-expanded={showSendOptions}
            >
              <SendIcon className="w-4.5 h-4.5" />
            </button>
            {sendOptionsMenu}
          </>
        ) : (
          <button
            type="button"
            onMouseDown={onVoiceStart}
            onMouseUp={onVoiceEnd}
            onMouseLeave={onVoiceEnd}
            onTouchStart={onVoiceStart}
            onTouchEnd={onVoiceEnd}
            disabled={disabled || isRecording}
            className="p-2 rounded-full bg-[var(--nova-overlay-weak)] text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/20 active:bg-[var(--nova-accent-color)]/30 transition cursor-pointer disabled:opacity-50"
            aria-label={t('chat.voiceMessage')}
          >
            <MicIcon className="w-4.5 h-4.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Composer;


















