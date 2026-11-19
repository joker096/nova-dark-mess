/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeThumbnailSize, createThumbnail, type ThumbnailOptions } from './imageThumbnail';

describe('computeThumbnailSize', () => {
  it('downscales a landscape image to fit within maxWidth/maxHeight', () => {
    const result = computeThumbnailSize(1600, 900, { maxWidth: 400, maxHeight: 400 });
    expect(result.width).toBe(400);
    expect(result.height).toBe(225);
  });

  it('downscales a portrait image to fit within maxWidth/maxHeight', () => {
    const result = computeThumbnailSize(900, 1600, { maxWidth: 400, maxHeight: 400 });
    expect(result.width).toBe(225);
    expect(result.height).toBe(400);
  });

  it('does not upscale a small image', () => {
    const result = computeThumbnailSize(100, 100, { maxWidth: 400, maxHeight: 400 });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('uses default caps when options are omitted', () => {
    const result = computeThumbnailSize(2000, 1000);
    expect(result.width).toBe(400);
    expect(result.height).toBe(200);
  });

  it('respects aspect ratio for non-square caps', () => {
    const result = computeThumbnailSize(1000, 500, { maxWidth: 200, maxHeight: 100 });
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it('returns default caps for zero-size source', () => {
    const result = computeThumbnailSize(0, 0, { maxWidth: 400, maxHeight: 400 });
    expect(result.width).toBe(400);
    expect(result.height).toBe(400);
  });
});

describe('createThumbnail', () => {
  let mockCanvas: HTMLCanvasElement;
  let mockContext: any;
  let mockImage: HTMLImageElement & { complete: boolean };
  let resolveImage: (() => void) | null = null;

  beforeEach(() => {
    mockContext = {
      drawImage: vi.fn(),
    };
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockContext),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,abc123'),
    } as unknown as HTMLCanvasElement;

    resolveImage = null;
    mockImage = {
      complete: false,
      naturalWidth: 800,
      naturalHeight: 600,
      onload: null as any,
      onerror: null as any,
      src: '',
    } as unknown as HTMLImageElement & { complete: boolean };

    vi.stubGlobal('HTMLImageElement', class {
      constructor() {
        return mockImage;
      }
    });
    vi.stubGlobal('Image', class {
      constructor() {
        return mockImage;
      }
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockCanvas),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function triggerLoad(): void {
    (mockImage as { complete: boolean }).complete = true;
    (mockImage.onload as any)?.();
  }

  function triggerError(): void {
    (mockImage.onerror as any)?.(new Event('error'));
  }

  it('creates a thumbnail from a data URL string', async () => {
    const promise = createThumbnail('data:image/png;base64=xxx', {
      maxWidth: 200,
      maxHeight: 200,
      quality: 0.5,
    });
    triggerLoad();
    const result = await promise;
    expect(mockContext.drawImage).toHaveBeenCalled();
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.5);
    expect(result).toBe('data:image/jpeg;base64,abc123');
  });

  it('passes thumbnail dimensions to canvas', async () => {
    const promise = createThumbnail('data:image/png;base64=xxx', { maxWidth: 100, maxHeight: 100 });
    triggerLoad();
    await promise;
    expect(mockCanvas.width).toBe(100);
    expect(mockCanvas.height).toBe(75); // 800x600 -> 100x75
  });

  it('rejects when canvas 2D context is unavailable', async () => {
    mockCanvas.getContext = vi.fn(() => null);
    const promise = createThumbnail('data:image/png;base64=xxx');
    triggerLoad();
    await expect(promise).rejects.toThrow('Canvas 2D context is unavailable');
  });

  it('rejects when image fails to load', async () => {
    const promise = createThumbnail('data:image/png;base64=xxx');
    triggerError();
    await expect(promise).rejects.toThrow('Failed to load image from');
  });
});
