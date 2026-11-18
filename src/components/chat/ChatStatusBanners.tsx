import React from 'react';
import { ChevronDown, ChevronUp, Clock, Forward, Reply, Search, X } from 'lucide-react';
import { ChatMessage, VoiceNoteData } from '../../types/messenger';
import { useLanguage } from '../../context/LanguageContext';

export interface ScheduledMessageItem {
  id: string;
  text?: string;
  voiceNote?: VoiceNoteData;
  targetTimestamp: number;
  formattedTime: string;
}

interface ChatStatusBannersProps {
  isSearchOpen: boolean;
  searchQuery: string;
  matchingMessages: ChatMessage[];
  activeMatchIndex: number;
  searchFilterMode: 'context' | 'filtered';
  handlePrevMatch: () => void;
  handleNextMatch: () => void;
  isForwardSelecting: boolean;
  forwardSelectedIds: Set<string>;
  handleOpenForwardModal: () => void;
  handleCancelForward: () => void;
  replyingTo: ChatMessage | null;
  setReplyingTo: (message: ChatMessage | null) => void;
  handleJumpToMessage: (msgId: string) => void;
  scheduledMessages: ScheduledMessageItem[];
  setScheduledMessages: React.Dispatch<React.SetStateAction<ScheduledMessageItem[]>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  triggerPinnedToast: (message: string) => void;
  profile: { name: string };
}

export const ChatStatusBanners: React.FC<ChatStatusBannersProps> = ({
  isSearchOpen,
  searchQuery,
  matchingMessages,
  activeMatchIndex,
  searchFilterMode,
  handlePrevMatch,
  handleNextMatch,
  isForwardSelecting,
  forwardSelectedIds,
  handleOpenForwardModal,
  handleCancelForward,
  replyingTo,
  setReplyingTo,
  handleJumpToMessage,
  scheduledMessages,
  setScheduledMessages,
  setMessages,
  triggerPinnedToast,
  profile,
}) => {
  const { t } = useLanguage();

  return (
<>
    {/* FLOATING IN-CHAT SEARCH MATCH NAVIGATOR */}
    {isSearchOpen && searchQuery.trim() && matchingMessages.length > 0 && (
      <div className="mx-4 mb-2 z-20 flex items-center justify-between bg-[#151622]/95 backdrop-blur-xl border border-[var(--nova-accent-color, #ff4e18)]/40 rounded-2xl px-3.5 py-2 shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-bottom-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)] shrink-0">
            <Search className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-white truncate">
              Word: <span className="text-[var(--nova-accent-color, #ff4e18)]">&quot;{searchQuery}&quot;</span>
            </span>
            <span className="text-[10px] text-[#8e93a0]">
              Match {activeMatchIndex + 1} of {matchingMessages.length} •{' '}
              {searchFilterMode === 'filtered' ? 'Filtered view' : 'In conversation stream'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handlePrevMatch}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/80 hover:text-white flex items-center gap-1 text-xs font-medium transition cursor-pointer active:scale-95"
            title={t('common.previous')}
          >
            <ChevronUp className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)]" />
            <span className="text-[11px] font-semibold">Prev</span>
          </button>
          <button
            onClick={handleNextMatch}
            className="px-2 py-1 rounded-lg bg-[var(--nova-accent-color, #ff4e18)]/20 hover:bg-[var(--nova-accent-color, #ff4e18)]/30 border border-[var(--nova-accent-color, #ff4e18)]/40 text-[var(--nova-accent-color, #ff4e18)] flex items-center gap-1 text-xs font-medium transition cursor-pointer active:scale-95"
            title={t('common.next')}
          >
            <span className="text-[11px] font-semibold">Next</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )}

    {/* FORWARD SELECTION TOOLBAR */}
    {isForwardSelecting && (
      <div className="px-4 py-2.5 bg-[#161724]/95 border-t border-b border-[var(--nova-accent-color, #ff4e18)]/40 flex items-center justify-between z-20 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-150">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)] shrink-0 border border-[var(--nova-accent-color, #ff4e18)]/30">
            <Forward className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-white">
              {forwardSelectedIds.size} message{forwardSelectedIds.size > 1 ? 's' : ''} selected
            </span>
            <p className="text-[10px] text-[#868b98]">Tap messages to select or deselect</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenForwardModal}
            className="px-3 py-1.5 rounded-full bg-[var(--nova-accent-color, #ff4e18)] hover:bg-[var(--nova-accent-color, #ff5d2b)] text-white text-xs font-semibold transition cursor-pointer shadow-md shadow-[var(--nova-accent-color, #ff4e18)]/30 active:scale-95 flex items-center gap-1.5"
          >
            <Forward className="w-3.5 h-3.5" />
            <span>Forward</span>
          </button>
          <button
            onClick={handleCancelForward}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition flex items-center gap-1 text-[11px] font-semibold cursor-pointer active:scale-95"
            title={t('common.cancel')}
          >
            <X className="w-3.5 h-3.5 text-white/60" />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    )}

    {/* Reply Preview Banner */}
    {replyingTo && (
      <div className="px-4 py-2 bg-[#161724]/95 border-t border-b border-[var(--nova-accent-color, #ff4e18)]/40 flex items-center justify-between text-xs z-20 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-150">
        <div
          onClick={() => handleJumpToMessage(replyingTo.id)}
          className="flex items-center gap-2.5 truncate cursor-pointer group flex-1 mr-2"
          title={t('chat.replyingTo')}
        >
          <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color, #ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color, #ff4e18)] shrink-0 border border-[var(--nova-accent-color, #ff4e18)]/30">
            <Reply className="w-3.5 h-3.5" />
          </div>
          <div className="truncate flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--nova-accent-color, #ff4e18)] font-bold text-[11px] group-hover:underline">
                Replying to {replyingTo.senderId === 'me' ? t('chat.yourself') : profile.name}
              </span>
              <span className="text-[10px] text-white/40">· Click to jump</span>
            </div>
            <p className="text-[#868b98] truncate text-[11px] mt-0.5 font-normal">
              {replyingTo.text || (replyingTo.voiceNote ? t('voiceMessage', { duration: replyingTo.voiceNote.duration }) : t('chat.photoAttachment'))}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setReplyingTo(null);
            triggerPinnedToast('Reply cancelled');
          }}
          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition flex items-center gap-1 text-[11px] font-semibold cursor-pointer shrink-0 active:scale-95"
          title={t('common.cancel')}
        >
          <X className="w-3.5 h-3.5 text-white/60" />
          <span>Cancel</span>
        </button>
      </div>
    )}

    {/* SCHEDULED MESSAGES QUEUE BANNER */}
    {scheduledMessages.length > 0 && (
      <div className="px-4 py-1.5 bg-[#181926]/95 backdrop-blur-md border-t border-[var(--nova-accent-color, #ff4e18)]/30 flex items-center justify-between text-xs z-20 animate-in fade-in slide-in-from-bottom-1">
        <div className="flex items-center gap-2 truncate">
          <Clock className="w-3.5 h-3.5 text-[var(--nova-accent-color, #ff4e18)] shrink-0 animate-pulse" />
          <span className="text-white/85 truncate text-[11px]">
            <strong className="text-[var(--nova-accent-color, #ff4e18)] font-semibold">
              {scheduledMessages.length}
            </strong>{' '}
            {scheduledMessages.length === 1 ? 'message scheduled' : 'messages scheduled'} (
            {scheduledMessages[0].formattedTime})
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              const item = scheduledMessages[0];
              setScheduledMessages((prev) => prev.slice(1));
              const newMsg: ChatMessage = {
                id: 'm-' + Date.now(),
                senderId: 'me',
                text: item.text,
                voiceNote: item.voiceNote,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isRead: true,
              };
              setMessages((msgs) => [...msgs, newMsg]);
              triggerPinnedToast('Sent scheduled message now');
            }}
            className="text-[10px] text-[var(--nova-accent-color, #ff4e18)] hover:text-[#ff6e38] font-semibold hover:underline cursor-pointer"
          >
            Send Now
          </button>
          <button
            onClick={() => {
              setScheduledMessages([]);
              triggerPinnedToast('Scheduled messages cancelled');
            }}
            className="text-white/40 hover:text-white p-0.5 cursor-pointer text-xs"
            title={t('common.cancel')}
          >
            ✕
          </button>
        </div>
      </div>
    )}
</>
  );
};
