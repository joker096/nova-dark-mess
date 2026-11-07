import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Play,
  Image as ImageIcon,
  Film,
  Calendar,
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Download,
  Share2,
  Sparkles,
} from 'lucide-react';
import { ChatMessage, SharedMediaItem } from '../types/messenger';
import { KATIE_SHARED_MEDIA, KATIE_PROFILE } from '../data/mockMessengerData';

interface SharedMediaSectionProps {
  messages: ChatMessage[];
  contactName?: string;
  onClose: () => void;
  onJumpToMessage?: (messageId: string) => void;
}

type MediaFilter = 'all' | 'photos' | 'videos';

export const SharedMediaSection: React.FC<SharedMediaSectionProps> = ({
  messages,
  contactName = KATIE_PROFILE.name,
  onClose,
  onJumpToMessage,
}) => {
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 2000);
  };

  // 1. Automatically populate and merge media from current chat messages + mock media
  const allMediaItems = useMemo<SharedMediaItem[]>(() => {
    const list: SharedMediaItem[] = [];
    const seenUrls = new Set<string>();

    // A. First extract any media explicitly shared in active messages
    messages.forEach((msg) => {
      if (msg.images && msg.images.length > 0) {
        msg.images.forEach((imgUrl, idx) => {
          if (!seenUrls.has(imgUrl)) {
            seenUrls.add(imgUrl);
            list.push({
              id: `chat-img-${msg.id}-${idx}`,
              type: 'image',
              url: imgUrl,
              date: msg.time ? `Today, ${msg.time}` : 'Today',
              monthGroup: 'Current Chat',
              caption: msg.text || 'Shared photo in chat',
              chatMessageSnippet: msg.text || 'Photo attachment',
              messageId: msg.id,
              senderId: msg.senderId,
            });
          }
        });
      }
    });

    // B. Merge with predefined shared media for Katie
    const baseSharedMedia = KATIE_PROFILE.sharedMedia || KATIE_SHARED_MEDIA;
    baseSharedMedia.forEach((item) => {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        // Find if this item corresponds to an existing message
        const matchedMsg = messages.find(
          (m) =>
            m.images?.includes(item.url) ||
            (m.text && item.chatMessageSnippet && m.text.includes(item.chatMessageSnippet.slice(0, 15)))
        );

        list.push({
          ...item,
          messageId: item.messageId || matchedMsg?.id || 'm2',
          senderId: item.senderId || 'other',
        });
      }
    });

    return list;
  }, [messages]);

  // 2. Filter by type (all / photos / videos) and search query
  const filteredMedia = useMemo(() => {
    return allMediaItems.filter((item) => {
      // Type filter
      if (filter === 'photos' && item.type !== 'image') return false;
      if (filter === 'videos' && item.type !== 'video') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchCaption = item.caption?.toLowerCase().includes(query);
        const matchSnippet = item.chatMessageSnippet?.toLowerCase().includes(query);
        const matchDate = item.date?.toLowerCase().includes(query);
        return matchCaption || matchSnippet || matchDate;
      }

      return true;
    });
  }, [allMediaItems, filter, searchQuery]);

  const photosCount = allMediaItems.filter((m) => m.type === 'image').length;
  const videosCount = allMediaItems.filter((m) => m.type === 'video').length;

  // 3. Group by month/timeline
  const groupedMedia = useMemo(() => {
    const groups: { [group: string]: SharedMediaItem[] } = {};
    filteredMedia.forEach((item) => {
      const g = item.monthGroup || 'Shared Media';
      if (!groups[g]) {
        groups[g] = [];
      }
      groups[g].push(item);
    });
    return groups;
  }, [filteredMedia]);

  // 4. Lightbox navigation
  const activeLightboxItem =
    lightboxIndex !== null && filteredMedia[lightboxIndex]
      ? filteredMedia[lightboxIndex]
      : null;

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : filteredMedia.length - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => (prev! < filteredMedia.length - 1 ? prev! + 1 : 0));
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, filteredMedia.length]);

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white relative z-20 select-none overflow-hidden animate-in fade-in duration-200">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-[#ff4e18]/50 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-3.5 h-3.5 text-[#ff4e18]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* GALLERY TOP SUB-HEADER BAR */}
      <div className="p-3 pb-2 shrink-0">
        <div className="bg-[#14151c]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col gap-2.5 shadow-xl shadow-black/60">
          {/* Top row: Title & Quick close */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#ff4e18]/20 border border-[#ff4e18]/30 flex items-center justify-center text-[#ff4e18]">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">
                  Shared Media
                </h2>
                <p className="text-[10px] text-white/50">
                  {allMediaItems.length} photos & videos with {contactName.split(' ')[0]}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition cursor-pointer active:scale-95"
              title="Return to chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Bar within Shared Media */}
          <div className="bg-[#1a1b26] border border-white/10 focus-within:border-[#ff4e18]/60 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-inner">
            <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by caption or message..."
              className="w-full bg-transparent text-xs text-white placeholder-white/40 focus:outline-none min-w-0"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-white/40 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-1 p-1 bg-[#181924] rounded-xl border border-white/5">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                filter === 'all'
                  ? 'bg-[#ff4e18] text-white shadow-sm shadow-[#ff4e18]/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>All ({allMediaItems.length})</span>
            </button>

            <button
              onClick={() => setFilter('photos')}
              className={`flex-1 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                filter === 'photos'
                  ? 'bg-[#ff4e18] text-white shadow-sm shadow-[#ff4e18]/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>Photos ({photosCount})</span>
            </button>

            <button
              onClick={() => setFilter('videos')}
              className={`flex-1 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                filter === 'videos'
                  ? 'bg-[#ff4e18] text-white shadow-sm shadow-[#ff4e18]/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-3 h-3" />
              <span>Videos ({videosCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* MEDIA GRID SCROLL AREA */}
      <div className="flex-1 overflow-y-auto px-3 pb-8 no-scrollbar space-y-5">
        {filteredMedia.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20 text-center text-white/50 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30">
              <ImageIcon className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/80">No media found</p>
              <p className="text-xs text-white/40 mt-0.5">
                {searchQuery
                  ? `No matches found for "${searchQuery}"`
                  : 'Photos and videos shared in this conversation will appear here'}
              </p>
            </div>
          </div>
        ) : (
          /* Grouped Media Lists */
          Object.entries(groupedMedia).map(([groupTitle, items]) => (
            <div key={groupTitle} className="space-y-2">
              {/* Timeline Header (Anti-slop clean text metadata with dot separator) */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
                  <Calendar className="w-3.5 h-3.5 text-[#ff4e18]" />
                  <span>{groupTitle}</span>
                  <span className="text-white/30" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-white/40 font-normal">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>

              {/* 3-Column Media Grid */}
              <div className="grid grid-cols-3 gap-1.5">
                {items.map((item) => {
                  const globalIndex = filteredMedia.findIndex((m) => m.id === item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setLightboxIndex(globalIndex)}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-[#181922] border border-white/5 hover:border-[#ff4e18]/60 cursor-pointer shadow-md transition-all duration-200 active:scale-[0.97]"
                    >
                      {/* Media Image / Thumbnail */}
                      <img
                        src={item.thumbnail || item.url}
                        alt={item.caption || 'Shared media'}
                        className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-300"
                        loading="lazy"
                      />

                      {/* Video Indicator Overlay */}
                      {item.type === 'video' && (
                        <>
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-black/60 group-hover:bg-[#ff4e18] backdrop-blur-md flex items-center justify-center text-white shadow-lg transition-colors">
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            </div>
                          </div>
                          {item.duration && (
                            <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-mono font-medium text-white/90">
                              {item.duration}
                            </div>
                          )}
                        </>
                      )}

                      {/* Hover subtle gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5 pointer-events-none">
                        <span className="text-[9px] text-white truncate font-medium">
                          {item.caption || item.date}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* FULL-SCREEN LIGHTBOX MODAL */}
      {activeLightboxItem && (
        <div
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between animate-in fade-in duration-200 select-none"
        >
          {/* Lightbox Header Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="p-4 flex items-center justify-between border-b border-white/10 bg-black/60 backdrop-blur-md relative z-10"
          >
            <div className="flex items-center gap-2.5">
              <div className="text-xs text-white/70 font-mono">
                {lightboxIndex! + 1} / {filteredMedia.length}
              </div>
              <span className="text-white/30" aria-hidden="true">
                ·
              </span>
              <span className="text-xs font-semibold text-white">
                {activeLightboxItem.type === 'video' ? 'Video' : 'Photo'}
              </span>
              <span className="text-[10px] text-white/50">
                ({activeLightboxItem.date})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(activeLightboxItem.url);
                  showToast('Media link copied to clipboard');
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title="Copy media URL"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(null);
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title="Close lightbox"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lightbox Main Media View */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex-1 relative flex items-center justify-center p-4 overflow-hidden"
          >
            {/* Prev Arrow */}
            <button
              onClick={handlePrev}
              className="absolute left-4 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-[#ff4e18] text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition active:scale-95 cursor-pointer shadow-xl"
              title="Previous media (Left Arrow)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Media Canvas */}
            <div className="max-w-4xl max-h-[75vh] w-full h-full flex items-center justify-center">
              {activeLightboxItem.type === 'video' ? (
                <div className="relative w-full max-h-[70vh] rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10">
                  <video
                    ref={videoRef}
                    src={activeLightboxItem.url}
                    poster={activeLightboxItem.thumbnail}
                    controls
                    autoPlay
                    className="w-full max-h-[70vh] object-contain rounded-2xl"
                  />
                </div>
              ) : (
                <img
                  src={activeLightboxItem.url}
                  alt={activeLightboxItem.caption || 'Shared photo'}
                  className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
                />
              )}
            </div>

            {/* Next Arrow */}
            <button
              onClick={handleNext}
              className="absolute right-4 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-[#ff4e18] text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition active:scale-95 cursor-pointer shadow-xl"
              title="Next media (Right Arrow)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* Lightbox Footer & Context Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="p-4 border-t border-white/10 bg-black/80 backdrop-blur-xl relative z-10 space-y-2.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  {activeLightboxItem.caption || 'Media file'}
                </p>
                {activeLightboxItem.chatMessageSnippet && (
                  <p className="text-xs text-white/60 italic mt-0.5">
                    "{activeLightboxItem.chatMessageSnippet}"
                  </p>
                )}
              </div>

              {/* Jump to Message in Chat button */}
              {activeLightboxItem.messageId && onJumpToMessage && (
                <button
                  onClick={() => {
                    const id = activeLightboxItem.messageId!;
                    setLightboxIndex(null);
                    onClose();
                    onJumpToMessage(id);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#ff4e18] hover:bg-[#ff5d2b] text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-[#ff4e18]/30 transition active:scale-95 cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>View in Chat</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
