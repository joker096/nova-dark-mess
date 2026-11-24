import React, { useRef, useState, useEffect, useCallback } from 'react';
import { hapticLight } from '../../lib/ui/haptics';
import { Paperclip, Mic, Send, X, Smile, Image, Film, Paperclip as PaperclipIcon, Mic as MicIcon, Send as SendIcon } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

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
}) => {
  const { t } = useLanguage();
  const textareaRef = useRef<HTMLTextareaElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) onSend();
    }
  }, [draft, onSend]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextareaElement>) => {
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
    if (disabled || !draft.trim()) return;
    onSend();
    hapticLight();
  }, [disabled, draft, onSend]);

  return (
    <div className="flex items-end gap-2 p-3 bg-[var(--nova-surface)] border-t border-[var(--nova-border-subtle)]" style={{ paddingBottom: 'calc(0.75rem + max(var(--nova-safe-bottom), var(--keyboard-height, 0px)))' }}>
      <button
        type="button"
        onClick={onAttach}
        disabled={disabled}
        className="p-2 rounded-full text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer disabled:opacity-50"
        aria-label={t('chat.attach')}
      >
        <PaperclipIcon className="w-5 h-5" />
      </button>

      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={t('chat.messagePlaceholder', { defaultValue: 'Message…' })}
          className="w-full min-h-[44px] max-h-32 px-4 py-2.5 pr-12 rounded-2xl bg-[var(--nova-overlay-weak)] text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--nova-accent-color)] resize-none transition"
          rows={1}
        />

        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 rounded-full text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"
            aria-label={t('chat.emoji')}
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onOptionsToggle}
            className="p-2 rounded-full text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"
            aria-label={t('chat.sendOptions')}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || !draft.trim()}
        className="p-2.5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] hover:opacity-90 transition cursor-pointer disabled:opacity-50"
        aria-label={t('chat.send')}
      >
        <SendIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default Composer;