import React from 'react';
import { StickerData } from '../../types/messenger';
import { LazyMedia } from '../LazyMedia';

export function isVideoStickerSource(url?: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:video/')) return true;
  return /\.(mp4|webm|mov|ogv)(?:[?#].*)?$/i.test(url);
}

interface StickerMediaProps {
  sticker: StickerData;
  className?: string;
  emojiClassName?: string;
}

/**
 * Renders a sticker from an animated/video source when available, falling back
 * to the static image and then to the emoji. Video stickers are always muted
 * and looped so they behave like a regular sticker in the picker and bubbles.
 */
export const StickerMedia: React.FC<StickerMediaProps> = ({
  sticker,
  className = '',
  emojiClassName = '',
}) => {
  if (sticker.animationUrl && isVideoStickerSource(sticker.animationUrl)) {
    return (
      <video
        src={sticker.animationUrl}
        autoPlay
        loop
        muted
        playsInline
        className={className}
        aria-label={sticker.name}
        data-testid={`sticker-video-${sticker.id}`}
      />
    );
  }

  const source = sticker.animationUrl || sticker.imageUrl || sticker.thumbUrl;
  if (source) {
    return (
      <LazyMedia
        src={source}
        alt={sticker.name}
        className={className}
        draggable={false}
        data-testid={`sticker-image-${sticker.id}`}
        eager
      />
    );
  }

  return <span className={emojiClassName}>{sticker.emoji}</span>;
};
