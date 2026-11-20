import React from 'react';
import { Camera, FileText, MapPin, Mic, Paperclip, Send, Smile, Sparkles, X } from 'lucide-react';
import { NovaButton } from '../../lib/ui/NovaButton';
import { ScrollableRow } from '../../lib/ui/ScrollableRow';
import { ChatMessage, DocumentAttachment, VoiceNoteData } from '../../types/messenger';
import { useLanguage } from '../../context/LanguageContext';
import { VoiceMemoInput, VoiceMemoInputHandle } from '../VoiceMemoInput';
import { LazyMedia } from '../LazyMedia';

interface ChatComposerProps {
  isAttachmentMenuOpen: boolean;
  setIsAttachmentMenuOpen: (open: boolean) => void;
  attachmentMenuRef: React.RefObject<HTMLDivElement | null>;
  handleAttachItem: (type: 'photo' | 'location' | 'document' | 'voice') => void;
  isEmojiPickerOpen: boolean;
  setIsEmojiPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  emojiBarRef: React.RefObject<HTMLDivElement | null>;
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  mainInputRef: React.RefObject<HTMLInputElement | null>;
  shouldShowSmartReplies: boolean;
  smartReplies: string[];
  smartRepliesRef: React.RefObject<HTMLDivElement | null>;
  lastReceivedMessage: ChatMessage | undefined;
  setDismissedSmartReplyMsgId: (id: string | null) => void;
  stagedAttachment: { images?: string[]; document?: DocumentAttachment } | null;
  setStagedAttachment: (attachment: { images?: string[]; document?: DocumentAttachment } | null) => void;
  isFileModalOpen: boolean;
  setIsFileModalOpen: (open: boolean) => void;
  morseMode: boolean;
  setMorseMode: React.Dispatch<React.SetStateAction<boolean>>;
  replyingTo: ChatMessage | null;
  handleSendMessage: (customText?: string, forcedReplyTo?: ChatMessage | null) => void;
  handleSendPointerDown: (e: React.PointerEvent) => void;
  handleSendPointerUp: (e: React.PointerEvent) => void;
  handleSendPointerCancel: () => void;
  setIsScheduleModalOpen: (open: boolean) => void;
  voiceMemoRef: React.RefObject<VoiceMemoInputHandle | null>;
  handleSendVoiceNote: (note?: VoiceNoteData) => void;
  setRecordedVoiceNote: (note: VoiceNoteData | null) => void;
  isSearchOpen: boolean;
  profile: { name: string };
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  isAttachmentMenuOpen,
  setIsAttachmentMenuOpen,
  attachmentMenuRef,
  handleAttachItem,
  isEmojiPickerOpen,
  setIsEmojiPickerOpen,
  emojiBarRef,
  inputText,
  setInputText,
  mainInputRef,
  shouldShowSmartReplies,
  smartReplies,
  smartRepliesRef,
  lastReceivedMessage,
  setDismissedSmartReplyMsgId,
  stagedAttachment,
  setStagedAttachment,
  isFileModalOpen,
  setIsFileModalOpen,
  morseMode,
  setMorseMode,
  replyingTo,
  handleSendMessage,
  handleSendPointerDown,
  handleSendPointerUp,
  handleSendPointerCancel,
  setIsScheduleModalOpen,
  voiceMemoRef,
  handleSendVoiceNote,
  setRecordedVoiceNote,
  isSearchOpen,
  profile,
}) => {
  const { t } = useLanguage();

  return (
<>
    {/* BOTTOM INPUT AREA */}
    <div className="p-3 pt-1 relative z-20 shrink-0 space-y-2">
      {/* ATTACHMENT MENU DRAWER */}
      {isAttachmentMenuOpen && (
        <ScrollableRow ref={attachmentMenuRef} wheelScroll={true} gap="2" data-testid="attachment-menu" className="p-2 bg-[#141520]/95 backdrop-blur-xl border border-[var(--nova-accent-color,#ff4e18)]/30 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={() => handleAttachItem('photo')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
          >
            <Camera className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
            <span>Photo</span>
          </button>
          <button
            type="button"
            onClick={() => handleAttachItem('location')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>Location</span>
          </button>
          <button
            type="button"
            onClick={() => handleAttachItem('document')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Document</span>
          </button>
          <button
            type="button"
            onClick={() => handleAttachItem('voice')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)] text-white/80 hover:text-white transition cursor-pointer text-xs font-semibold shrink-0 active:scale-95 border border-white/5"
          >
            <Mic className="w-3.5 h-3.5 text-[var(--nova-accent-color,#ff4e18)]" />
            <span>Voice Memo</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAttachmentMenuOpen(false)}
            className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition ml-auto shrink-0"
            title={t('common.close')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </ScrollableRow>
      )}

      {/* EMOJI QUICK BAR */}
      {isEmojiPickerOpen && (
        <ScrollableRow ref={emojiBarRef} wheelScroll={true} gap="1.5" data-testid="emoji-bar" className="p-2 bg-[#141520]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-150">
          <span className="text-[10px] text-white/40 font-semibold px-1 shrink-0">Insert:</span>
          {['😊', '❤️', '🔥', '👍', '😂', '🎉', '🏖️', '✨', '🙌', '🍹', '😍', '👏'].map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setInputText((prev) => prev + emoji);
                mainInputRef.current?.focus();
              }}
              className="text-lg p-1 rounded-xl hover:bg-white/10 hover:scale-125 transition active:scale-90 cursor-pointer shrink-0"
              title={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
          onClick={() => setIsEmojiPickerOpen(false)}
          className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition ml-auto shrink-0"
          aria-label="Close emoji picker"
        >
            <X className="w-3.5 h-3.5" />
          </button>
        </ScrollableRow>
      )}

      {/* ROW OF SMART REPLY PILL BUTTONS */}
      {shouldShowSmartReplies && (
        <ScrollableRow ref={smartRepliesRef} wheelScroll={true} gap="1.5" data-testid="smart-replies" className="py-0.5 px-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none">
          <div className="flex items-center gap-1 text-[11px] text-[var(--nova-accent-color,#ff4e18)] font-semibold shrink-0 pl-1 pr-1">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span className="hidden sm:inline">Smart:</span>
          </div>

          {smartReplies.map((reply, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(reply, replyingTo ?? lastReceivedMessage)}
              className="rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-[#161723]/95 hover:bg-[var(--nova-accent-color,#ff4e18)] hover:text-white border border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)] text-white/90 shadow-sm backdrop-blur-md transition-all duration-150 active:scale-95 shrink-0 whitespace-nowrap cursor-pointer group flex items-center gap-1.5"
              title={`Tap to send: "${reply}"`}
            >
              <span>{reply}</span>
            </button>
          ))}

          <button
            onClick={() => {
              if (lastReceivedMessage) {
                setDismissedSmartReplyMsgId(lastReceivedMessage.id);
              }
            }}
            className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 text-white/40 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer ml-0.5"
            title="Dismiss smart replies"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </ScrollableRow>
      )}
      {/* STAGED ATTACHMENT PREVIEW CHIP */}
      {stagedAttachment && (
        <div className="flex items-center justify-between gap-2.5 p-2 bg-[#171825]/95 backdrop-blur-xl border border-[var(--nova-accent-color,#ff4e18)]/40 rounded-2xl shadow-xl animate-in slide-in-from-bottom-2 duration-150">
          {stagedAttachment.images && stagedAttachment.images.length > 0 && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center -space-x-2.5 overflow-hidden py-0.5 pl-1 shrink-0">
                {stagedAttachment.images.slice(0, 3).map((url, i) => (
                  <LazyMedia
                    key={i}
                    src={url}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover border-2 border-[#171825] shadow-md"
                  />
                ))}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white truncate">
                  {stagedAttachment.images.length}{' '}
                  {stagedAttachment.images.length === 1 ? 'photo attached' : 'photos attached'}
                </span>
                <span className="text-[10.5px] text-[#868b98]">Ready to send with your message</span>
              </div>
            </div>
          )}

          {stagedAttachment.document && (
            <div className="flex items-center gap-2.5 pl-1 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white truncate">
                  {stagedAttachment.document.name}
                </span>
                <span className="text-[10px] text-[#868b98]">{stagedAttachment.document.size}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setStagedAttachment(null)}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition cursor-pointer shrink-0 ml-auto"
            title="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Paperclip Button opening Simulated File Selection Menu */}
        <NovaButton
          variant={isFileModalOpen || stagedAttachment ? 'accent' : 'ghost'}
          size="lg"
          onClick={() => {
            setIsFileModalOpen(true);
            setIsEmojiPickerOpen(false);
            setIsAttachmentMenuOpen(false);
          }}
          title={t('common.attach')}
        >
          <Paperclip className="w-4 h-4" />
        </NovaButton>

        <div className="flex-1 bg-[#181920]/95 rounded-full border border-[color:var(--nova-border-color,rgba(255,255,255,0.08))] pl-4 pr-1.5 py-1.5 flex items-center transition shadow-md min-w-0 focus-within:border-[var(--nova-accent-color)]/35 focus-within:ring-2 focus-within:ring-[var(--nova-accent-color)]/25">
          <input
            ref={mainInputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMessage();
            }}
            placeholder={replyingTo ? t('chat.replyingToName', { name: replyingTo.senderId === 'me' ? t('common.you') : profile.name }) : t('chat.typeMessage')}
            data-inline-focus="true"
            className="w-full bg-transparent text-sm text-white placeholder-white/35 focus:outline-none py-1 min-w-0"
          />

          {/* Emoji Picker Button inside input field */}
          <NovaButton
            variant={isEmojiPickerOpen ? 'accent-ghost' : 'ghost'}
            size="sm"
            onClick={() => {
              setIsEmojiPickerOpen((prev) => !prev);
              setIsAttachmentMenuOpen(false);
            }}
            title={t('common.react')}
          >
            <Smile className="w-4 h-4" />
          </NovaButton>

          {/* Morse mode toggle */}
          <NovaButton
            variant={morseMode ? 'accent-ghost' : 'ghost'}
            size="sm"
            onClick={() => setMorseMode((prev) => !prev)}
            title={morseMode ? t('chat.morseEncode', 'Show text') : t('chat.morseDecode', 'Show Morse')}
          >
            <span className="text-[10px] font-mono">{morseMode ? 'T' : '•−'}</span>
          </NovaButton>
        </div>

        {inputText.trim() ? (
          <NovaButton
            variant="accent"
            type="button"
            onPointerDown={handleSendPointerDown}
            onPointerUp={handleSendPointerUp}
            onPointerLeave={handleSendPointerCancel}
            onPointerCancel={handleSendPointerCancel}
            onClick={(e) => {
              if (e.detail === 0) handleSendMessage();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setIsScheduleModalOpen(true);
            }}
            style={{ touchAction: 'manipulation' }}
            className="w-11 h-11 hover:bg-[var(--nova-accent-color,#ff5d2b)] active:scale-90 shadow-lg shadow-[var(--nova-accent-color,#ff4e18)]/30 relative group select-none shrink-0"
            title={t('common.send')}
          >
            <Send className="w-4 h-4 ml-0.5" />
            {/* Hold hint badge */}
            <div className="absolute -top-7 right-0 bg-[#1e202a] text-white text-[9px] px-2 py-0.5 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md">
              Hold to schedule 🕒
            </div>
          </NovaButton>
        ) : (
          <VoiceMemoInput
            ref={voiceMemoRef}
            onSendVoiceMemo={handleSendVoiceNote}
            onScheduleVoiceMemo={(note) => {
              setRecordedVoiceNote(note);
              setIsScheduleModalOpen(true);
            }}
            disabled={isSearchOpen}
          />
        )}
      </div>
    </div>
</>
  );
};
