import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  IconX as X,
  IconCirclePlay as Play,
  IconPhoto as Photo,
  IconMovie as Movie,
  IconCalendar as Calendar,
  IconMessage2 as MessageSquare,
  IconSearch as Search,
  IconChevronLeft as ChevronLeft,
  IconChevronRight as ChevronRight,
  IconMaximize as Maximize,
  IconPlus as Plus,
  IconMinus as Minus,
  IconShare2 as Share2,
  IconSparkles as Sparkles,
  IconDownload as Download,
  IconCheck as Check,
  IconTrash as Trash,
  IconInfoCircle as Info,
  IconZoomIn as ZoomIn,
  IconZoomOut as ZoomOut,
  IconPictureInPicture as IconPictureInPicture,
} from '@tabler/icons-react';
import { ChatMessage, SharedMediaItem } from '../types/messenger';
import { KATIE_SHARED_MEDIA, CONTACT_PROFILES } from '../data/mockMessengerData';
import { LazyMedia } from './LazyMedia';
import { useLanguage } from '../context/LanguageContext';
import { createThumbnail } from '../lib/media/imageThumbnail';
import { mediaCache } from '../lib/media/mediaCache';
import { VideoPlayer } from './VideoPlayer';

interface SharedMediaSectionProps {
  messages: ChatMessage[];
  contactName?: string;
  contactId?: string;
  onClose: () => void;
  onJumpToMessage?: (messageId: string) => void;
  initialIndex?: number;
}

type MediaFilter = 'all' | 'photos' | 'videos';

interface ThumbnailData {
  url: string;
  blurDataUrl?: string;
  width?: number;
  height?: number;
}

export interface SharedMediaSectionHandle {
  focus: () => void;
  scrollToTop: () => void;
}

export const SharedMediaSection = forwardRef<SharedMediaSectionHandle, SharedMediaSectionProps>(
  (
    {
      messages,
      contactName,
      contactId,
      onClose,
      onJumpToMessage,
      initialIndex = 0,
    },
    forwardedRef
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const lightboxRef = useRef<HTMLDivElement>(null);
    const thumbnailStripRef = useRef<HTMLDivElement>(null);
    const videoPlayerRef = useRef<React.ComponentRef<typeof VideoPlayer>>(null);

    const { t } = useLanguage();
    const profile = contactId ? (CONTACT_PROFILES[contactId] || CONTACT_PROFILES['katie']) : CONTACT_PROFILES['katie'];
    const displayName = contactName || profile.name;

    const [filter, setFilter] = useState<MediaFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(initialIndex >= 0 ? initialIndex : null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [thumbnailCache, setThumbnailCache] = useState<Map<string, ThumbnailData>>(new Map());

    const showToast = useCallback((text: string) => {
      setToastMessage(text);
      setTimeout(() => setToastMessage(null), 2000);
    }, []);

    const allMediaItems = useMemo<SharedMediaItem[]>(() => {
      const list: SharedMediaItem[] = [];
      const seenUrls = new Set<string>();

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

      const baseSharedMedia = profile.sharedMedia || KATIE_SHARED_MEDIA;
      baseSharedMedia.forEach((item) => {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
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

    useEffect(() => {
      let cancelled = false;
      const thumbnailRefs = new Map<string, HTMLImageElement>();

      const generateThumbnails = async () => {
        for (const item of allMediaItems) {
          if (cancelled) return;
          if (item.type !== 'image' || item.thumbnail) continue;
          if (thumbnailCache.has(item.url)) continue;
          if (thumbnailRefs.has(item.url)) continue;

          try {
            const cached = mediaCache.get(item.url);
            if (cached) {
              const blob = new Blob([new Uint8Array(cached.data)], { type: cached.mime });
              const thumb = await createThumbnail(blob, { maxWidth: 200, maxHeight: 200, quality: 0.6 });
              if (!cancelled) {
                setThumbnailCache((prev) => new Map(prev).set(item.url, { url: thumb }));
              }
              continue;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = item.url;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error('Failed to load'));
            });
            thumbnailRefs.set(item.url, img);

            const thumb = await createThumbnail(img, { maxWidth: 200, maxHeight: 200, quality: 0.6 });
            if (!cancelled) {
              setThumbnailCache((prev) => new Map(prev).set(item.url, { url: thumb, width: img.naturalWidth, height: img.naturalHeight }));

              const response = await fetch(item.url);
              if (response.ok) {
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                mediaCache.set(item.url, bytes, blob.type);
              }
            }
          } catch {
            // Fallback handled in render
          }
        }
      };

      generateThumbnails();
      return () => {
        cancelled = true;
        thumbnailRefs.forEach((img) => {
          img.onload = null;
          img.onerror = null;
        });
      };
    }, [allMediaItems, thumbnailCache]);

    const getThumbnailUrl = useCallback(
      (item: SharedMediaItem) => {
        const cached = thumbnailCache.get(item.url);
        if (cached?.url) return cached.url;
        return item.thumbnail ?? item.url;
      },
      [thumbnailCache]
    );

    const getBlurDataUrl = useCallback(
      async (item: SharedMediaItem): Promise<string | undefined> => {
        const cached = thumbnailCache.get(item.url);
        if (cached?.blurDataUrl) return cached.blurDataUrl;

        try {
          const thumbUrl = getThumbnailUrl(item);
          const smallThumb = await createThumbnail(thumbUrl, { maxWidth: 20, maxHeight: 20, quality: 0.1, type: 'image/jpeg' });
          setThumbnailCache((prev) => {
            const next = new Map(prev);
            const existing = next.get(item.url) || { url: thumbUrl };
            next.set(item.url, { ...existing, blurDataUrl: smallThumb });
            return next;
          });
          return smallThumb;
        } catch {
          return undefined;
        }
      },
      [thumbnailCache, getThumbnailUrl]
    );

    const filteredMedia = useMemo(() => {
      return allMediaItems.filter((item) => {
        if (filter === 'photos' && item.type !== 'image') return false;
        if (filter === 'videos' && item.type !== 'video') return false;

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

    const groupedMedia = useMemo(() => {
      const groups: { [group: string]: SharedMediaItem[] } = {};
      filteredMedia.forEach((item) => {
        const g = item.monthGroup || 'Shared Media';
        if (!groups[g]) groups[g] = [];
        groups[g].push(item);
      });
      return groups;
    }, [filteredMedia]);

    const activeLightboxItem = lightboxIndex !== null && filteredMedia[lightboxIndex] ? filteredMedia[lightboxIndex] : null;

    const handlePrev = useCallback(() => {
      if (lightboxIndex === null) return;
      setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : filteredMedia.length - 1));
    }, [lightboxIndex, filteredMedia.length]);

    const handleNext = useCallback(() => {
      if (lightboxIndex === null) return;
      setLightboxIndex((prev) => (prev! < filteredMedia.length - 1 ? prev! + 1 : 0));
    }, [lightboxIndex, filteredMedia.length]);

    const handleSavePhoto = useCallback(() => {
      const img = imgRef.current;
      if (img) {
        const a = document.createElement('a');
        a.href = img.src || activeLightboxItem?.url || '';
        a.download = `photo-${Date.now()}`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Photo saved');
      }
    }, [activeLightboxItem, showToast]);

    const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0, velocityX: 0, velocityY: 0 });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const dragPos = useRef({ x: 0, y: 0 });
    const imgRef = useRef<HTMLImageElement>(null);
    const containerLightboxRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const lastTouchDistance = useRef(0);
    const lastTouchCenter = useRef({ x: 0, y: 0 });
    const isPinching = useRef(false);

    const clampScale = useCallback((value: number) => Math.min(4, Math.max(1, Math.round(value * 4) / 4)), []);

    const setZoomScale = useCallback((value: number) => {
      const scale = clampScale(value);
      setZoom({ scale, x: 0, y: 0, velocityX: 0, velocityY: 0 });
    }, [clampScale]);

    const clampPosition = useCallback(
      (scale: number, x: number, y: number) => {
        if (scale <= 1) return { x: 0, y: 0 };
        const container = containerLightboxRef.current;
        const img = imgRef.current;
        if (!container || !img) return { x: 0, y: 0 };
        const cr = container.getBoundingClientRect();
        const ir = img.getBoundingClientRect();
        const maxX = Math.max(0, (ir.width * scale - cr.width) / 2);
        const maxY = Math.max(0, (ir.height * scale - cr.height) / 2);
        return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
      },
      []
    );

    const applyMomentum = useCallback(() => {
      setZoom((prev) => {
        if (Math.abs(prev.velocityX) < 0.1 && Math.abs(prev.velocityY) < 0.1) {
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          return { ...prev, velocityX: 0, velocityY: 0 };
        }
        const friction = 0.95;
        const nextX = prev.x + prev.velocityX;
        const nextY = prev.y + prev.velocityY;
        const clamped = clampPosition(prev.scale, nextX, nextY);
        animationFrameRef.current = requestAnimationFrame(applyMomentum);
        return { ...prev, x: clamped.x, y: clamped.y, velocityX: prev.velocityX * friction, velocityY: prev.velocityY * friction };
      });
    }, [clampPosition]);

    const handleZoomWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      if (activeLightboxItem?.type !== 'image') return;
      setZoom((prev) => {
        const scale = clampScale(prev.scale - e.deltaY * 0.002);
        const clamped = clampPosition(scale, 0, 0);
        return { scale, x: clamped.x, y: clamped.y, velocityX: 0, velocityY: 0 };
      });
    }, [activeLightboxItem, clampScale, clampPosition]);

    const handleZoomDblClick = useCallback(() => {
      if (activeLightboxItem?.type !== 'image') return;
      setZoom((prev) =>
        prev.scale > 1
          ? { scale: 1, x: 0, y: 0, velocityX: 0, velocityY: 0 }
          : { scale: 2, x: 0, y: 0, velocityX: 0, velocityY: 0 }
      );
    }, [activeLightboxItem]);

    const handleZoomPointerDown = useCallback((e: React.PointerEvent) => {
      if (activeLightboxItem?.type !== 'image' || zoom.scale <= 1) return;
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      dragPos.current = { x: zoom.x, y: zoom.y };
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      e.target instanceof Element && e.target.setPointerCapture(e.pointerId);
    }, [activeLightboxItem, zoom.scale, zoom.x, zoom.y]);

    const handleZoomPointerMove = useCallback((e: React.PointerEvent) => {
      if (!dragging) return;
      const next = clampPosition(zoom.scale, dragPos.current.x + e.clientX - dragStart.current.x, dragPos.current.y + e.clientY - dragStart.current.y);
      const velocityX = next.x - dragPos.current.x;
      const velocityY = next.y - dragPos.current.y;
      dragPos.current = next;
      setZoom((prev) => ({ ...prev, x: next.x, y: next.y, velocityX, velocityY }));
    }, [dragging, dragPos, dragStart, zoom.scale, clampPosition]);

    const handleZoomPointerUp = useCallback(() => {
      setDragging(false);
      applyMomentum();
    }, [applyMomentum]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      if (activeLightboxItem?.type !== 'image') return;
      if (e.touches.length === 2) {
        isPinching.current = true;
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        lastTouchDistance.current = distance;
        lastTouchCenter.current = { x: (touch1.clientX + touch2.clientX) / 2, y: (touch1.clientY + touch2.clientY) / 2 };
      } else if (e.touches.length === 1 && zoom.scale > 1) {
        setDragging(true);
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragPos.current = { x: zoom.x, y: zoom.y };
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      }
    }, [activeLightboxItem, zoom.scale, zoom.x, zoom.y]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if (activeLightboxItem?.type !== 'image') return;
      if (e.touches.length === 2 && isPinching.current) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        const scaleChange = distance / lastTouchDistance.current;
        const newScale = clampScale(zoom.scale * scaleChange);

        const dx = centerX - lastTouchCenter.current.x;
        const dy = centerY - lastTouchCenter.current.y;

        setZoom((prev) => {
          const clamped = clampPosition(newScale, prev.x + dx, prev.y + dy);
          return { ...prev, scale: newScale, x: clamped.x, y: clamped.y };
        });

        lastTouchDistance.current = distance;
        lastTouchCenter.current = { x: centerX, y: centerY };
      } else if (e.touches.length === 1 && dragging) {
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;
        const next = clampPosition(zoom.scale, dragPos.current.x + dx, dragPos.current.y + dy);
        const velocityX = next.x - dragPos.current.x;
        const velocityY = next.y - dragPos.current.y;
        dragPos.current = next;
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        setZoom((prev) => ({ ...prev, x: next.x, y: next.y, velocityX, velocityY }));
      }
    }, [activeLightboxItem, zoom.scale, zoom.x, zoom.y, dragging, dragPos, dragStart, clampScale, clampPosition]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
      if (e.touches.length < 2) isPinching.current = false;
      if (e.touches.length === 0 && dragging) {
        setDragging(false);
        applyMomentum();
      }
    }, [dragging, applyMomentum]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (lightboxIndex === null) return;
        if (selectionMode) {
          if (e.key === 'Escape') setSelectionMode(false);
          return;
        }
        if (e.key === 'Escape') setLightboxIndex(null);
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'ArrowRight') handleNext();
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (activeLightboxItem) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.add(activeLightboxItem.id);
              return next;
            });
            setSelectionMode(true);
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxIndex, selectionMode, activeLightboxItem, handlePrev, handleNext]);

    useEffect(() => {
      if (lightboxIndex !== null) {
        const nextIndex = Math.min(lightboxIndex + 1, filteredMedia.length - 1);
        const prevIndex = Math.max(lightboxIndex - 1, 0);
        [nextIndex, prevIndex].forEach((idx) => {
          const item = filteredMedia[idx];
          if (item && item.type === 'image') {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = item.url;
            document.head.appendChild(link);
          }
        });
      }
    }, [lightboxIndex, filteredMedia]);

    const toggleSelection = useCallback((id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);

    const selectAll = useCallback(() => {
      setSelectedIds(new Set(filteredMedia.map((m) => m.id)));
    }, [filteredMedia]);

    const clearSelection = useCallback(() => {
      setSelectedIds(new Set());
      setSelectionMode(false);
    }, []);

    const handleShareSelected = useCallback(async () => {
      if (selectedIds.size === 0) return;
      const urls = filteredMedia.filter((m) => selectedIds.has(m.id)).map((m) => m.url);
      if (navigator.share && urls.length === 1) {
        await navigator.share({ title: 'Media', url: urls[0] });
      } else {
        await navigator.clipboard.writeText(urls.join('\n'));
        showToast(`${urls.length} link${urls.length > 1 ? 's' : ''} copied`);
      }
      clearSelection();
    }, [selectedIds, filteredMedia, showToast, clearSelection]);

    const handleDeleteSelected = useCallback(() => {
      showToast(`${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''} deleted (demo)`);
      clearSelection();
    }, [selectedIds.size, showToast, clearSelection]);

    const handleJumpToChat = useCallback(() => {
      if (activeLightboxItem?.messageId && onJumpToMessage) {
        const id = activeLightboxItem.messageId;
        setLightboxIndex(null);
        onClose();
        onJumpToMessage(id);
      }
    }, [activeLightboxItem, onJumpToMessage, onClose]);

    useImperativeHandle(forwardedRef, () => ({
      focus: () => containerRef.current?.focus(),
      scrollToTop: () => gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' }),
    }), []);

    return (
      <div
        ref={containerRef}
        className="flex flex-col h-full bg-[var(--nova-canvas)] text-[var(--nova-text-primary)] relative z-20 select-none overflow-hidden animate-in fade-in duration-200"
        tabIndex={0}
      >
        {toastMessage && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[var(--nova-surface-high)]/95 border border-[var(--nova-accent-color)]/50 text-[var(--nova-text-primary)] text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <Sparkles className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
            <span>{toastMessage}</span>
          </div>
        )}

        {selectionMode && (
          <div className="fixed top-0 left-0 right-0 z-30 bg-[var(--nova-accent-color)] px-4 py-3 flex items-center justify-between shadow-xl animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <span className="text-white font-medium">{selectedIds.size} selected</span>
              <button onClick={selectAll} className="text-white/80 hover:text-white text-sm underline">Select all</button>
              <button onClick={clearSelection} className="text-white/80 hover:text-white text-sm">Deselect</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleShareSelected} className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium flex items-center gap-1.5 transition-colors">
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
              <button onClick={handleDeleteSelected} className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium flex items-center gap-1.5 transition-colors">
                <Trash className="w-3.5 h-3.5" />
                Delete
              </button>
              <button onClick={clearSelection} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors" aria-label="Close selection">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className={`p-3 pb-2 shrink-0 ${selectionMode ? 'pt-16' : ''}`}>
          <div className="bg-[var(--nova-surface-raised)]/90 backdrop-blur-xl border border-[var(--nova-border-color)] rounded-2xl p-3 flex flex-col gap-2.5 shadow-xl shadow-black/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/30 flex items-center justify-center text-[var(--nova-accent-color)]">
                  <Photo className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--nova-text-primary)] leading-tight">Shared Media</h2>
                  <p className="text-[10px] text-[var(--nova-text-primary)]/50">
                    {allMediaItems.length} photos & videos with {displayName.split(' ')[0]}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {selectionMode && (
                  <button onClick={clearSelection} className="px-3 py-1.5 text-xs font-medium text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/10 rounded-lg transition-colors">
                    Done
                  </button>
                )}
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)]/70 hover:text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer active:scale-95" title={t('a11y.returnToChat')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-[var(--nova-surface-high)] border border-[var(--nova-border-color)] focus-within:border-[var(--nova-accent-color)]/60 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-inner">
              <Search className="w-3.5 h-3.5 text-[var(--nova-text-primary)]/40 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by caption or message..."
                className="w-full bg-transparent text-xs text-[var(--nova-text-primary)] placeholder-[var(--nova-text-secondary)]/40 focus:outline-none min-w-0"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[var(--nova-text-primary)]/40 hover:text-[var(--nova-text-primary)] text-xs cursor-pointer" aria-label="Clear media search">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-[var(--nova-surface-high)] rounded-xl border border-[var(--nova-border-color)]">
              <button onClick={() => setFilter('all')} className={`flex-1 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${filter === 'all' ? 'bg-[var(--nova-accent-color)] text-white shadow-sm shadow-[var(--nova-accent-color)]/30' : 'text-[var(--nova-text-primary)]/60 hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)]'}`}>
                <span>All ({allMediaItems.length})</span>
              </button>
              <button onClick={() => setFilter('photos')} className={`flex-1 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${filter === 'photos' ? 'bg-[var(--nova-accent-color)] text-white shadow-sm shadow-[var(--nova-accent-color)]/30' : 'text-[var(--nova-text-primary)]/60 hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)]'}`}>
                <Photo className="w-3 h-3" />
                <span>Photos ({photosCount})</span>
              </button>
              <button onClick={() => setFilter('videos')} className={`flex-1 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${filter === 'videos' ? 'bg-[var(--nova-accent-color)] text-white shadow-sm shadow-[var(--nova-accent-color)]/30' : 'text-[var(--nova-text-primary)]/60 hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)]'}`}>
                <Movie className="w-3 h-3" />
                <span>Videos ({videosCount})</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-8 no-scrollbar space-y-5" ref={gridRef}>
          {filteredMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-[var(--nova-text-primary)]/50 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-color)] flex items-center justify-center text-[var(--nova-text-primary)]/30">
                <Photo className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--nova-text-primary)]/80">No media found</p>
                <p className="text-xs text-[var(--nova-text-primary)]/40 mt-0.5">
                  {searchQuery ? `No matches found for "${searchQuery}"` : 'Photos and videos shared in this conversation will appear here'}
                </p>
              </div>
            </div>
          ) : (
            Object.entries(groupedMedia).map(([groupTitle, items]) => (
              <div key={groupTitle} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--nova-text-primary)]/70">
                    <Calendar className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
                    <span>{groupTitle}</span>
                    <span className="text-[var(--nova-text-primary)]/30" aria-hidden="true">·</span>
                    <span className="text-[var(--nova-text-primary)]/40 font-normal">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5" role="list">
                  {items.map((item) => {
                    const globalIndex = filteredMedia.findIndex((m) => m.id === item.id);
                    const isSelected = selectedIds.has(item.id);

                    return (
                      <div
                        key={item.id}
                        onClick={() => selectionMode ? toggleSelection(item.id) : setLightboxIndex(globalIndex)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!selectionMode) {
                            setSelectionMode(true);
                            toggleSelection(item.id);
                          }
                        }}
                        className={`group relative aspect-square rounded-xl overflow-hidden bg-[#181922] border border-white/5 cursor-pointer shadow-md transition-all duration-200 active:scale-[0.97] ${isSelected ? 'ring-2 ring-[var(--nova-accent-color)] ring-offset-2 ring-offset-black' : 'hover:border-[var(--nova-accent-color)]/60'}`}
                        role="listitem"
                        aria-selected={isSelected}
                        aria-label={`${item.type === 'image' ? 'Photo' : 'Video'}, ${item.caption || item.date}`}
                      >
                        <LazyMedia
                          src={getThumbnailUrl(item)}
                          alt={item.caption || 'Shared media'}
                          className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-300"
                          eager={isSelected}
                        />

                        {item.type === 'video' && (
                          <>
                            <div className="absolute inset-0 bg-[var(--nova-canvas)]/30 group-hover:bg-[var(--nova-canvas)]/10 transition-colors" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full bg-[var(--nova-canvas)]/60 group-hover:bg-[var(--nova-accent-color)] backdrop-blur-md flex items-center justify-center text-[var(--nova-text-primary)] shadow-lg transition-colors">
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              </div>
                            </div>
                            {item.duration && (
                              <div className="absolute bottom-1 right-1 bg-[var(--nova-canvas)]/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-mono font-medium text-[var(--nova-text-primary)]/90">
                                {item.duration}
                              </div>
                            )}
                          </>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--nova-canvas)]/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5 pointer-events-none">
                          <span className="text-[9px] text-[var(--nova-text-primary)] truncate font-medium">{item.caption || item.date}</span>
                        </div>

                        {item.type === 'image' && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-[var(--nova-canvas)]/60 backdrop-blur-md flex items-center justify-center text-[var(--nova-text-primary)] shadow-lg">
                              <Maximize className="w-4 h-4" />
                            </div>
                          </div>
                        )}

                        {isSelected && (
                          <div className="absolute top-1 right-1 z-10">
                            <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)] flex items-center justify-center text-white shadow-lg">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {activeLightboxItem && (
          <div onClick={() => !selectionMode && setLightboxIndex(null)} className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between animate-in fade-in duration-200 select-none" role="dialog" aria-modal="true" aria-label={activeLightboxItem.type === 'image' ? 'Photo viewer' : 'Video viewer'}>
            <div onClick={(e) => e.stopPropagation()} className="p-4 flex items-center justify-between border-b border-[var(--nova-border-color)] bg-[var(--nova-canvas)]/60 backdrop-blur-md relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="text-xs text-[var(--nova-text-primary)]/70 font-mono">{lightboxIndex! + 1} / {filteredMedia.length}</div>
                <span className="text-[var(--nova-text-primary)]/30" aria-hidden="true">·</span>
                <span className="text-xs font-semibold text-[var(--nova-text-primary)]">{activeLightboxItem.type === 'video' ? 'Video' : 'Photo'}</span>
                <span className="text-[10px] text-[var(--nova-text-primary)]/50">({activeLightboxItem.date})</span>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(activeLightboxItem.url); showToast('Media link copied to clipboard'); }} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer" title={t('a11y.copyMediaUrl')}>
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = activeLightboxItem.url; a.download = `media-${Date.now()}`; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); showToast('Download started'); }} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer" title="Download">
                  <Download className="w-3.5 h-3.5" />
                </button>
                {selectionMode ? null : (
                  <button onClick={(e) => { e.stopPropagation(); setSelectionMode(true); toggleSelection(activeLightboxItem.id); }} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer" title="Select" aria-label="Select">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); setZoom({ scale: 1, x: 0, y: 0, velocityX: 0, velocityY: 0 }); }} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer" title={t('a11y.closeLightbox')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div onClick={(e) => e.stopPropagation()} className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
              <button onClick={handlePrev} className="absolute left-4 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-[var(--nova-accent-color)] text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition active:scale-95 cursor-pointer shadow-xl" title={t('a11y.previousMediaArrow')}>
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div ref={containerLightboxRef} onWheel={handleZoomWheel} onDoubleClick={handleZoomDblClick} onPointerDown={handleZoomPointerDown} onPointerMove={handleZoomPointerMove} onPointerUp={handleZoomPointerUp} onPointerLeave={handleZoomPointerUp} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} className="max-w-4xl max-h-[75vh] w-full h-full flex items-center justify-center" style={{ touchAction: zoom.scale > 1 ? 'none' : 'auto' }}>
                {activeLightboxItem.type === 'video' ? (
                  <div className="relative w-full max-h-[70vh] rounded-2xl overflow-hidden shadow-2xl bg-[var(--nova-canvas)] border border-[var(--nova-border-color)]">
                    <VideoPlayer
                      ref={videoPlayerRef}
                      src={activeLightboxItem.url}
                      poster={activeLightboxItem.thumbnail}
                      autoPlay
                      playsInline
                      className="w-full max-h-[70vh]"
                    />
                  </div>
                ) : (
                  <div ref={imgRef} style={{ transform: `scale(${zoom.scale}) translate(${zoom.x}px, ${zoom.y}px)`, transformOrigin: 'center center', transition: dragging || zoom.scale > 1 ? 'none' : 'transform 0.2s ease', cursor: zoom.scale > 1 ? 'grabbing' : zoom.scale === 1 ? 'zoom-in' : 'grab' }} className="flex items-center justify-center">
                    <LazyMedia
                      src={activeLightboxItem.url}
                      alt={activeLightboxItem.caption || 'Shared photo'}
                      eager
                      className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
                    />
                  </div>
                )}
              </div>

              <button onClick={handleNext} className="absolute right-4 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-[var(--nova-accent-color)] text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition active:scale-95 cursor-pointer shadow-xl" title={t('a11y.nextMediaArrow')}>
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            <div onClick={(e) => e.stopPropagation()} className="p-4 border-t border-[var(--nova-border-color)] bg-[var(--nova-canvas)]/80 backdrop-blur-xl relative z-10 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {activeLightboxItem.type === 'image' && (
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setZoomScale(zoom.scale - 0.25); }} disabled={zoom.scale <= 1} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" title={t('a11y.zoomOut')}>
                      <ZoomOut className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setZoomScale(zoom.scale + 0.25); }} disabled={zoom.scale >= 4} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" title={t('a11y.zoomIn')}>
                      <ZoomIn className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setZoomScale(1); }} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer" title={t('a11y.resetZoom')}>
                      <Maximize className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] text-[var(--nova-text-primary)]/50">{Math.round(zoom.scale * 100)}%</span>
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold text-[var(--nova-text-primary)]">{activeLightboxItem.caption || 'Media file'}</p>
                  {activeLightboxItem.chatMessageSnippet && (
                    <p className="text-xs text-[var(--nova-text-primary)]/60 italic mt-0.5">"{activeLightboxItem.chatMessageSnippet}"</p>
                  )}
                </div>

                {activeLightboxItem.type === 'image' && (
                  <button onClick={handleSavePhoto} className="px-3 py-1.5 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0">
                    <Download className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                )}

                {activeLightboxItem.type === 'video' && videoPlayerRef.current && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => { void videoPlayerRef.current?.requestPictureInPicture?.().catch(() => {}); }} disabled={!document.pictureInPictureEnabled} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-primary)] flex items-center justify-center transition cursor-pointer disabled:opacity-40" title="Picture-in-Picture">
                      <IconPictureInPicture className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {activeLightboxItem.messageId && onJumpToMessage && (
                  <button onClick={handleJumpToChat} className="px-4 py-2 rounded-xl bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5d2b)] text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-[var(--nova-accent-color)]/30 transition active:scale-95 cursor-pointer shrink-0 self-start sm:self-auto">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>View in Chat</span>
                  </button>
                )}
              </div>

              <div className="h-16 flex items-center justify-center px-4 overflow-x-auto no-scrollbar pb-2" ref={thumbnailStripRef}>
                {filteredMedia.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => { setLightboxIndex(idx); setZoom({ scale: 1, x: 0, y: 0, velocityX: 0, velocityY: 0 }); }}
                    className={`flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all duration-150 ${idx === lightboxIndex ? 'border-[var(--nova-accent-color)] scale-105 shadow-lg' : 'border-transparent hover:border-white/20'}`}
                    aria-label={`${idx + 1} of ${filteredMedia.length}`}
                    aria-current={idx === lightboxIndex}
                  >
                    <LazyMedia src={getThumbnailUrl(item)} alt="" className="w-full h-full object-cover" />
                    {item.type === 'video' && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Play className="w-5 h-5 text-white" /></div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

SharedMediaSection.displayName = 'SharedMediaSection';

export default SharedMediaSection;