import { mediaCache } from './mediaCache';

export interface PreloadOptions {
  priority?: 'high' | 'low' | 'auto';
  maxConcurrent?: number;
  prefetchOnly?: boolean;
}

interface PreloadTask {
  url: string;
  type: 'image' | 'video';
  priority: 'high' | 'low';
  resolve: (value: void) => void;
  reject: (reason: Error) => void;
  controller?: AbortController;
}

class MediaPreloader {
  private queue: PreloadTask[] = [];
  private active = 0;
  private maxConcurrent = 3;
  private prefetchLinks = new Set<string>();
  private completed = new Map<string, Promise<void>>();

  setMaxConcurrent(n: number) {
    this.maxConcurrent = Math.max(1, n);
    this.processQueue();
  }

  preload(url: string, type: 'image' | 'video', options: PreloadOptions = {}): Promise<void> {
    const { priority = 'auto', maxConcurrent, prefetchOnly = false } = options;

    if (this.completed.has(url)) {
      return this.completed.get(url)!;
    }

    if (prefetchOnly && this.prefetchLinks.has(url)) {
      return Promise.resolve();
    }

    if (prefetchOnly) {
      this.prefetchLinks.add(url);
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      link.as = type;
      document.head.appendChild(link);
      return Promise.resolve();
    }

    const promise = new Promise<void>((resolve, reject) => {
      const task: PreloadTask = { url, type, priority: priority === 'auto' ? 'low' : priority, resolve, reject };
      this.queue.push(task);
      this.queue.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1));
      this.processQueue();
    });

    this.completed.set(url, promise);
    return promise;
  }

  preloadAll(urls: Array<{ url: string; type: 'image' | 'video' }>, options: PreloadOptions = {}): Promise<void[]> {
    return Promise.all(urls.map(({ url, type }) => this.preload(url, type, options)));
  }

  preloadAdjacent(currentIndex: number, items: Array<{ url: string; type: 'image' | 'video' }>, radius = 2): Promise<void[]> {
    const toPreload: Array<{ url: string; type: 'image' | 'video' }> = [];
    for (let i = Math.max(0, currentIndex - radius); i <= Math.min(items.length - 1, currentIndex + radius); i++) {
      if (i !== currentIndex) toPreload.push(items[i]);
    }
    return this.preloadAll(toPreload, { priority: 'high' });
  }

  private async processQueue() {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.active++;
      this.executeTask(task).finally(() => {
        this.active--;
        this.processQueue();
      });
    }
  }

  private async executeTask(task: PreloadTask): Promise<void> {
    const { url, type, resolve, reject } = task;

    if (mediaCache.has(url)) {
      resolve();
      return;
    }

    task.controller = new AbortController();
    const { signal } = task.controller;

    try {
      if (type === 'image') {
        await this.preloadImage(url, signal);
      } else {
        await this.preloadVideo(url, signal);
      }
      resolve();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private preloadImage(url: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;

      signal.addEventListener('abort', () => {
        img.onload = null;
        img.onerror = null;
        img.src = '';
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  }

  private preloadVideo(url: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`Failed to load video: ${url}`));
      video.src = url;

      signal.addEventListener('abort', () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        video.src = '';
        video.remove();
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  }

  cancel(url?: string) {
    if (url) {
      this.queue = this.queue.filter((t) => {
        if (t.url === url) {
          t.controller?.abort();
          t.reject(new DOMException('Cancelled', 'AbortError'));
          return false;
        }
        return true;
      });
      this.completed.delete(url);
    } else {
      this.queue.forEach((t) => {
        t.controller?.abort();
        t.reject(new DOMException('Cancelled', 'AbortError'));
      });
      this.queue = [];
      this.completed.clear();
    }
  }

  clearCompleted() {
    this.completed.clear();
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      active: this.active,
      completed: this.completed.size,
      prefetched: this.prefetchLinks.size,
    };
  }
}

export const mediaPreloader = new MediaPreloader();

export function createMediaPreloader() {
  return new MediaPreloader();
}

export function useMediaPreload() {
  const preload = (url: string, type: 'image' | 'video', options?: PreloadOptions) => mediaPreloader.preload(url, type, options);
  const preloadAll = (urls: Array<{ url: string; type: 'image' | 'video' }>, options?: PreloadOptions) => mediaPreloader.preloadAll(urls, options);
  const preloadAdjacent = (currentIndex: number, items: Array<{ url: string; type: 'image' | 'video' }>, radius?: number) => mediaPreloader.preloadAdjacent(currentIndex, items, radius);
  const cancel = (url?: string) => mediaPreloader.cancel(url);
  return { preload, preloadAll, preloadAdjacent, cancel };
}