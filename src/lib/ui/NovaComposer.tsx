import { forwardRef, type HTMLAttributes, useState, useRef, useEffect, useImperativeHandle } from 'react';
import { Paperclip, Send, Mic, Smile, X, ChevronDown } from 'lucide-react';

interface NovaComposerHandle {
  focus: () => void;
  blur: () => void;
}

interface NovaComposerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
  onEmojiClick?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxLines?: number;
  showVoice?: boolean;
  replyTo?: { id: string; name: string; text: string; isOwn?: boolean } | null;
  onCancelReply?: () => void;
  editingMessage?: { id: string; text: string } | null;
  onCancelEdit?: () => void;
}

export const NovaComposer = forwardRef<NovaComposerHandle, NovaComposerProps>(
  (
    {
      value,
      onChange,
      onSend,
      onAttach,
      onVoiceStart,
      onVoiceEnd,
      onEmojiClick,
      placeholder = 'Message',
      disabled = false,
      maxLines = 5,
      showVoice = true,
      replyTo,
      onCancelReply,
      editingMessage,
      onCancelEdit,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [height, setHeight] = useState(44);
    const [isRecording, setIsRecording] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      blur: () => textareaRef.current?.blur(),
    }));

    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        const newHeight = Math.min(textareaRef.current.scrollHeight, 44 * maxLines);
        setHeight(newHeight);
        textareaRef.current.style.height = `${newHeight}px`;
      }
    }, [value, maxLines]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (value.trim()) onSend();
      }
    };

    const handleVoiceStart = () => {
      if (onVoiceStart) {
        setIsRecording(true);
        onVoiceStart();
      }
    };

    const handleVoiceEnd = () => {
      if (onVoiceEnd) {
        setIsRecording(false);
        onVoiceEnd();
      }
    };

    const hasText = value.trim().length > 0;
    const isReplying = !!replyTo;
    const isEditing = !!editingMessage;

    return (
      <div
        className={`flex items-end gap-2 px-[var(--space-screen)] py-3 bg-[var(--bg-screen)] border-t border-[var(--border-divider)] ${className ?? ''}`}
        style={style}
        {...props}
      >
        {(isReplying || isEditing) && (
          <div className="flex-1 w-full mb-2">
            <div
              className="flex items-center justify-between p-2.5 rounded-[var(--radius-field)] bg-[var(--bg-field)] border border-[var(--border-divider)]"
              style={{ borderLeft: '3px solid var(--c-primary)' } as React.CSSProperties}
            >
              <div className="flex-1 min-w-0 mr-2">
                <div className="flex items-center gap-1.5 text-xs mb-1">
                  <ChevronDown className="w-3 h-3 text-[var(--c-primary)]" aria-hidden="true" />
                  <span className="font-medium text-[var(--c-primary)]">
                    {isEditing ? 'Editing' : 'Replying to'}
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {isEditing ? '' : (replyTo?.isOwn ? 'You' : replyTo?.name)}
                  </span>
                </div>
                <p className="text-[14px] text-[var(--text-primary)] truncate line-clamp-1">
                  {isEditing ? editingMessage?.text : replyTo?.text}
                </p>
              </div>
              <button
                type="button"
                onClick={isEditing ? onCancelEdit : onCancelReply}
                className="p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-soft)] transition-colors"
                aria-label={isEditing ? 'Cancel editing' : 'Cancel reply'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-1 relative">
          <button
            type="button"
            onClick={onAttach}
            disabled={disabled}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-control-primary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-field)] transition-colors active:scale-95 shrink-0"
            aria-label="Attach"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="w-full bg-[var(--bg-field)] rounded-[var(--radius-field)] px-4 py-2.5 pr-12 text-[16px] leading-[24px] text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus-visible:ring-0 resize-none transition-colors"
              style={{
                height: `${height}px`,
                maxHeight: `${44 * maxLines}px`,
              } as React.CSSProperties}
              aria-label={placeholder}
              data-inline-focus="true"
            />

            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1.5 rounded-full text-[var(--text-control-primary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-soft)] transition-colors"
                aria-label="Emoji"
              >
                <Smile className="w-5 h-5" />
              </button>
            </div>
          </div>

          {hasText || isRecording ? (
            <button
              type="button"
              onClick={onSend}
              disabled={disabled || !hasText}
              className="w-10 h-10 rounded-full bg-[var(--c-primary)] text-[var(--c-on-primary)] flex items-center justify-center transition-all duration-200 active:scale-95 shrink-0"
              aria-label="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          ) : showVoice ? (
            <button
              type="button"
              onMouseDown={handleVoiceStart}
              onMouseUp={handleVoiceEnd}
              onMouseLeave={handleVoiceEnd}
              onTouchStart={handleVoiceStart}
              onTouchEnd={handleVoiceEnd}
              disabled={disabled}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-control-primary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-field)] transition-colors active:scale-95 shrink-0"
              aria-label="Voice message"
            >
              <Mic className="w-5 h-5" />
            </button>
          ) : null}
        </div>

        {showEmojiPicker && (
          <div className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-[var(--bg-card)] border border-[var(--border-divider)] rounded-[var(--radius-card)] shadow-lg z-20">
            <div className="flex flex-wrap gap-1 justify-center">
              {['😀', '😂', '😍', '😎', '🤔', '😭', '😡', '👍', '👎', '❤️', '🔥', '🎉', '🙏', '🤝', '✅', '❌'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onChange(value + emoji);
                    textareaRef.current?.focus();
                  }}
                  className="w-10 h-10 rounded-full text-2xl bg-[var(--bg-field)] hover:scale-110 transition-transform"
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

NovaComposer.displayName = 'NovaComposer';

export type { NovaComposerProps };