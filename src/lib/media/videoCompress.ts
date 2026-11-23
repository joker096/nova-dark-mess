/**
 * Client-side video compression before sending.
 *
 * Re-encodes a video file by playing it into an offscreen `<video>` element,
 * capturing frames via `canvas.captureStream()`, and recording them with
 * `MediaRecorder` into WebM at a bounded bitrate. Large 4K/1080p camera
 * recordings (tens of megabytes) shrink to a few megabytes, so they actually
 * complete over slow P2P links instead of timing out.
 *
 * Falls back to the original file when the browser lacks the required APIs
 * (no MediaRecorder / no canvas / non-video mime) so sending never breaks.
 */

export interface VideoCompressOptions {
  /** Max width/height of the output in pixels (longest side). Defaults to 720. */
  maxDimension?: number;
  /** Target average bitrate in bits per second. Defaults to 1_500_000 (1.5 Mbps). */
  bitrate?: number;
  /** Output framerate. Defaults to 30. */
  fps?: number;
  /** Output MIME type. Defaults to 'video/webm'. */
  mimeType?: string;
}

const DEFAULT_BITRATE = 1_500_000;
const DEFAULT_FPS = 30;
const DEFAULT_MAX_DIMENSION = 720;

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video file'));
    };
    video.preload = 'metadata';
  });
}

function computeOutputSize(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  const scale = Math.min(maxDimension / sourceWidth, maxDimension / sourceHeight, 1);
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}

export async function compressVideo(
  file: File,
  options: VideoCompressOptions = {},
): Promise<File> {
  if (!file.type.startsWith('video/')) return file;
  if (typeof MediaRecorder === 'undefined') return file;
  if (typeof document === 'undefined') return file;

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const bitrate = options.bitrate ?? DEFAULT_BITRATE;
  const fps = options.fps ?? DEFAULT_FPS;
  const mimeType = options.mimeType ?? 'video/webm';

  const video = await loadVideo(file);
  const { width, height } = computeOutputSize(
    video.videoWidth,
    video.videoHeight,
    maxDimension,
  );

  // No downscaling needed and no codec info available: return as-is to avoid
  // an expensive transcode that may produce a bigger file.
  if (width === video.videoWidth && height === video.videoHeight) {
    URL.revokeObjectURL(video.src);
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(video.src);
    return file;
  }

  const stream = canvas.captureStream(fps);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  } catch {
    // Some browsers reject unsupported mimeTypes; try the default WebM.
    try {
      recorder = new MediaRecorder(stream, { videoBitsPerSecond: bitrate });
    } catch {
      URL.revokeObjectURL(video.src);
      return file;
    }
  }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('Video compression failed'));
  });

  recorder.start();

  // Play the source frame-by-frame onto the canvas so MediaRecorder encodes it.
  await new Promise<void>((resolveFrame, rejectFrame) => {
    let cancelled = false;
    video.onerror = () => {
      cancelled = true;
      rejectFrame(new Error('Video playback failed'));
    };
    video.onseeked = drawFrame;
    video.onended = () => {
      if (!cancelled) {
        cancelled = true;
        recorder.stop();
        resolveFrame();
      }
    };

    function drawFrame() {
      if (cancelled) return;
      ctx.drawImage(video, 0, 0, width, height);
      if (video.currentTime < video.duration - 0.05) {
        video.currentTime += 1 / fps;
      } else {
        video.onended?.(new Event('ended'));
      }
    }

    video.currentTime = 0;
  });

  await finished;

  URL.revokeObjectURL(video.src);

  const blob = new Blob(chunks, { type: mimeType });
  // Never replace the original with a larger output.
  if (blob.size >= file.size) return file;

  return new File([blob], file.name, { type: mimeType });
}
