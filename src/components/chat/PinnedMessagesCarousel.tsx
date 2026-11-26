import React from 'react';
import {
  IconChevronLeft as ChevronLeft,
  IconChevronRight as ChevronRight,
  IconMicrophone as Microphone,
  IconPin as Pin,
  IconPinnedOff as PinnedOff,
  IconX as X,
  IconMicrophone as Mic,
  IconPinnedOff as PinOff,
} from '@tabler/icons-react';
import { ChatMessage } from '../../types/messenger';
import { useLanguage } from '../../context/LanguageContext';
import { LazyMedia } from '../LazyMedia';

interface PinnedMessagesCarouselProps {
  isPinnedCarouselOpen: boolean;
  pinnedMessages: ChatMessage[];
  currentPinIndex: number;
  setCurrentPinIndex: (index: number) => void;
  setIsPinnedCarouselOpen: (open: boolean) => void;
  handlePrevPin: (e: React.MouseEvent) => void;
  handleNextPin: (e: React.MouseEvent) => void;
  handleUnpinMessage: (msgId: string, e: React.MouseEvent) => void;
  handleJumpToMessage: (msgId: string) => void;
  profile: { name: string };
}

export const PinnedMessagesCarousel: React.FC<PinnedMessagesCarouselProps> = ({
  isPinnedCarouselOpen,
  pinnedMessages,
  currentPinIndex,
  setCurrentPinIndex,
  setIsPinnedCarouselOpen,
  handlePrevPin,
  handleNextPin,
  handleUnpinMessage,
  handleJumpToMessage,
  profile,
}) => {
  const { t } = useLanguage();

  const currentPinnedMsg =
    pinnedMessages.length > 0
      ? pinnedMessages[Math.min(currentPinIndex, pinnedMessages.length - 1)]
      : null;

  return (
<>
    {/* DISMISSIBLE PINNED MESSAGES CAROUSEL */}
    {isPinnedCarouselOpen && (
      <div className="px-3 -mt-1 mb-2 shrink-0 relative z-30 animate-in slide-in-from-top-2 fade-in duration-200">
        <div className="bg-[#151622]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 shadow-2xl shadow-black/70">
          {/* Header row of carousel */}
          <div className="flex items-center justify-between pb-1.5 border-b border-white/5 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)]">
                <Pin className="w-3 h-3 fill-current" />
              </div>
              <span className="text-xs font-bold text-white tracking-wide">
                Pinned Messages
              </span>
              {pinnedMessages.length > 0 && (
                <span className="text-[10px] text-white/50 px-1.5 py-0.2 rounded-full bg-white/5 font-mono">
                  {currentPinIndex + 1}/{pinnedMessages.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {pinnedMessages.length > 1 && (
                <>
                  <button
                    onClick={handlePrevPin}
                    className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                    title={t('common.previous')}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleNextPin}
                    className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                    title={t('common.next')}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={() => setIsPinnedCarouselOpen(false)}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer ml-1"
                title={t('common.close')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Current Pinned Message Card */}
          {currentPinnedMsg ? (
            <div
              onClick={() => handleJumpToMessage(currentPinnedMsg.id)}
              className="mt-2 p-2 rounded-xl bg-[#1b1c28]/90 hover:bg-[#202232] border border-white/5 transition cursor-pointer group flex items-start justify-between gap-2.5 active:scale-[0.99]"
              title={t('chat.replyingTo')}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                {currentPinnedMsg.images && currentPinnedMsg.images.length > 0 ? (
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/10">
                    <LazyMedia
                      src={currentPinnedMsg.images[0]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : currentPinnedMsg.voiceNote ? (
                  <div className="w-9 h-9 rounded-lg bg-[var(--nova-accent-color,#ff4e18)]/15 border border-[var(--nova-accent-color,#ff4e18)]/30 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0">
                    <Mic className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-[#252836] border border-white/5 flex items-center justify-center text-xs font-bold text-white/80 shrink-0">
                    {currentPinnedMsg.senderId === 'me' ? t('common.you') : profile.name}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-[var(--nova-accent-color,#ff4e18)]">
                      {currentPinnedMsg.senderId === 'me' ? t('common.you') : profile.name}
                    </span>
                    <span className="text-[10px] text-white/40">
                      {currentPinnedMsg.time}
                    </span>
                    {currentPinnedMsg.pinnedNote && (
                      <span className="text-[10px] text-white/50 truncate hidden sm:inline">
                        · {currentPinnedMsg.pinnedNote}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-white/90 truncate mt-0.5 font-normal">
                    {currentPinnedMsg.voiceNote
                      ? t('voiceMessage', { duration: currentPinnedMsg.voiceNote.duration })
                      : currentPinnedMsg.text || t('chat.photoAttachment')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 self-center">
                <button
                  onClick={(e) => handleUnpinMessage(currentPinnedMsg.id, e)}
                  className="p-1 rounded-md text-white/40 hover:text-red-400 hover:bg-white/5 transition cursor-pointer"
                  title={t('common.unpin')}
                >
                  <PinOff className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-[var(--nova-accent-color,#ff4e18)] font-medium group-hover:underline flex items-center gap-0.5">
                  Jump
                </span>
              </div>
            </div>
          ) : (
            <div className="py-3 text-center text-xs text-white/40">
              No pinned messages yet. Long-press any message to pin it.
            </div>
          )}

          {/* Pagination indicator dots */}
          {pinnedMessages.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              {pinnedMessages.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPinIndex(idx)}
                  className={`transition-all duration-200 cursor-pointer ${
                    idx === currentPinIndex
                      ? 'w-4 h-1 rounded-full bg-[var(--nova-accent-color,#ff4e18)]'
                      : 'w-1.5 h-1 rounded-full bg-white/20 hover:bg-white/40'
                  }`}
                  title={`Go to pinned message ${idx + 1}`}
                  aria-label={`Go to pinned message ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )}
</>
  );
};










