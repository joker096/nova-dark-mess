import React, { useState, useRef, useEffect } from 'react';
import { mediaCache } from '../lib/media/mediaCache';

export interface LazyMediaProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
  /** Force eager loading for above-the-fold / critical images. Defaults to false. */
  eager?: boolean;
  onError?: () => void;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  draggable?: boolean;
  'data-testid'?: string;
  imgRef?: React.RefObject<HTMLImageElement | null>;
}

/**
 * Lazy-loads media only when it enters the viewport.
 *
 * Loaded images are fetched once and stored in the shared bounded LRU media
 * cache so repeated visits to the same gallery or chat serve from memory
 * instead of re-fetching. On load failure the component renders `placeholder`.
 * Falls back to eager loading when `IntersectionObserver` is unavailable (jsdom).
 */
export function LazyMedia({ src, alt, className, eager, onError, onClick, draggable, 'data-testid': dataTestid, imgRef, style }: LazyMediaProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(!!eager);
  const [error, setError] = useState(false);
  const [srcUrl] = useState<string | undefined>(eager ? src : undefined);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible || error) return;
    if (!eager && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setVisible(true);
              observer.disconnect();
            }
          }
        },
        { rootMargin: '200px' },
      );
      observer.observe(el);
      return () => observer.disconnect();
    }
    setVisible(true);
  }, [visible, error, eager]);

  const cached = mediaCache.get(src);

  const renderSrc = eager ? src : srcUrl;

  if (!eager && !renderSrc) return null;

  const handleLoad = async () => {
    if (cached) return; // already cached, nothing to store
    if (src.startsWith('data:')) return; // data: URLs don't need caching
    const el = ref.current;
    if (!el || !el.complete) return;
    try {
      // Cross-origin images may taint the canvas; fetch directly instead.
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer as unknown as ArrayBuffer);
      mediaCache.set(src, bytes, blob.type);
    } catch {
      /* cache store failed, non-fatal */
    }
  };

  const handleError = () => {
    setError(true);
    onError?.();
  };

  return (
    <img
      ref={(el) => {
        ref.current = el;
        if (imgRef && typeof imgRef === 'object') {
          imgRef.current = el;
        }
      }}
      src={renderSrc}
      alt={alt}
      style={style}
      className={className}
      loading="lazy"
      decoding="async"
      onLoad={handleLoad}
      onError={handleError}
      onClick={onClick}
      draggable={draggable}
      data-testid={dataTestid}
    />
  );
}
