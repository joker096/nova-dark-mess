/**
 * Image thumbnail generation for Phase 8 performance.
 *
 * Downscales image sources (File, Blob, data URL, or HTMLImageElement) to a
 * bounded canvas and serializes the result as a data URL. Thumbnails reduce
 * memory bandwidth and cold-start cost when rendering media grids and message
 * bubbles, since the full-resolution payload never needs to be decoded for
 * preview display.
 *
 * All operations are pure functions over canvas; no network or disk access is
 * performed. Errors are surfaced as thrown exceptions so callers can fall back
 * to the original source.
 */

export interface ThumbnailOptions {
  /** Maximum width of the output thumbnail in pixels. Defaults to 400. */
  maxWidth?: number;
  /** Maximum height of the output thumbnail in pixels. Defaults to 400. */
  maxHeight?: number;
  /** JPEG/WebP quality from 0 to 1. Defaults to 0.8. */
  quality?: number;
  /** Output MIME type: 'image/jpeg' or 'image/webp'. Defaults to 'image/jpeg'. */
  type?: 'image/jpeg' | 'image/webp';
}

/**
 * Computes the thumbnail canvas dimensions preserving the source aspect ratio.
 * Neither dimension exceeds the corresponding cap.
 */
export function computeThumbnailSize(
  sourceWidth: number,
  sourceHeight: number,
  options: ThumbnailOptions = {},
): { width: number; height: number } {
  const maxWidth = options.maxWidth ?? 400;
  const maxHeight = options.maxHeight ?? 400;

  if (!sourceWidth || !sourceHeight) {
    return { width: maxWidth, height: maxHeight };
  }

  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}

/**
 * Creates an offscreen canvas and draws `source` onto it at thumbnail size,
 * then serializes to a data URL. `source` may be a File, Blob, data URL
 * string, or HTMLImageElement.
 *
 * Returns a Promise that resolves to a data URL string.
 */
export async function createThumbnail(
  source: File | Blob | string | HTMLImageElement,
  options: ThumbnailOptions = {},
): Promise<string> {
  const maxWidth = options.maxWidth ?? 400;
  const maxHeight = options.maxHeight ?? 400;
  const quality = options.quality ?? 0.8;
  const type = options.type ?? 'image/jpeg';

  const img = await loadImage(source);
  const { width, height } = computeThumbnailSize(img.naturalWidth, img.naturalHeight, {
    maxWidth,
    maxHeight,
    quality,
    type,
  });

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL(type, quality);
}

/**
 * Loads an image source into an HTMLImageElement. Accepts File, Blob, data
 * URL, or HTMLImageElement. Resolves when the image has decoded.
 */
function loadImage(source: File | Blob | string | HTMLImageElement): Promise<HTMLImageElement> {
  if (source instanceof HTMLImageElement) {
    if (source.complete && source.naturalWidth > 0) {
      return Promise.resolve(source);
    }
    return new Promise((resolve, reject) => {
      source.onload = () => resolve(source);
      source.onerror = () => reject(new Error('Failed to load image element'));
    });
  }

  const url =
    source instanceof File || source instanceof Blob
      ? URL.createObjectURL(source)
      : source;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (source instanceof File || source instanceof Blob) {
        URL.revokeObjectURL(url);
      }
      resolve(img);
    };
    img.onerror = () => {
      if (source instanceof File || source instanceof Blob) {
        URL.revokeObjectURL(url);
      }
      reject(new Error(`Failed to load image from ${typeof source === 'string' ? source : 'blob'}`));
    };
    img.src = url;
  });
}

/**
 * Creates an HTMLCanvasElement. In environments without a real DOM canvas,
 * this throws so callers can degrade gracefully.
 */
function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('createThumbnail requires a DOM environment');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
