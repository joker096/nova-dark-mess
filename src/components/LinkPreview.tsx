import React, { useState, useEffect, useRef } from 'react';
import { LazyMedia } from './LazyMedia';
import {IconExternalLink as ExternalLink, IconX as X} from '@tabler/icons-react';
import { cachedFetch } from '../lib/api';

interface LinkPreviewProps {
  url: string;
  onClose?: () => void;
}

interface LinkPreviewData {
  title: string;
  description: string;
  image?: string;
  siteName: string;
  favicon: string;
}

const FAVICON_CACHE = new Map<string, string>();

function getFaviconUrl(hostname: string): string {
  if (FAVICON_CACHE.has(hostname)) {
    return FAVICON_CACHE.get(hostname)!;
  }
  // Use Google's favicon service as fallback
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  FAVICON_CACHE.set(hostname, faviconUrl);
  return faviconUrl;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function LinkPreview({ url, onClose }: LinkPreviewProps) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const fetchPreview = async () => {
      try {
        const cacheKey = `linkpreview:${url}`;
        
        const data = await cachedFetch<{
          title: string;
          description: string;
          image?: string;
          siteName: string;
          favicon: string;
        }>(
          cacheKey,
          async () => {
            // Try to fetch the page and parse OpenGraph tags
            // Use textise dot iitty or a CORS proxy for client-side fetching
            const corsProxy = 'https://r.jina.ai/http://';
            const response = await fetch(`${corsProxy}${url}`, { signal });
            if (!response.ok) throw new Error('Failed to fetch');
            const html = await response.text();

            // Parse OpenGraph tags from HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const getMeta = (property: string) => {
              const meta = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
              return meta?.getAttribute('content') || '';
            };

            const title = getMeta('og:title') || doc.title || url;
            const description = getMeta('og:description') || getMeta('description') || '';
            const image = getMeta('og:image') || '';
            const siteName = getMeta('og:site_name') || extractDomain(url);
            const favicon = getFaviconUrl(extractDomain(url));

            return { title, description, image, siteName, favicon };
          },
          { ttl: 60_000, staleWhileRevalidate: true }
        );

        setData(data);
      } catch {
        // Fallback: just show URL with favicon
        const hostname = extractDomain(url);
        setData({
          title: url,
          description: '',
          image: undefined,
          siteName: hostname,
          favicon: getFaviconUrl(hostname),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();

    return () => {
      abortRef.current?.abort();
    };
  }, [url]);

  if (loading) {
    return (
      <div className="w-full max-w-xs mx-auto my-2 rounded-xl border border-white/10 bg-[#181922] overflow-hidden animate-pulse">
        <div className="aspect-video w-full bg-white/5" />
        <div className="p-3 space-y-2">
          <div className="h-3 w-1/3 bg-white/5 rounded" />
          <div className="h-4 w-3/4 bg-white/5 rounded" />
          <div className="h-3 w-full bg-white/5 rounded" />
          <div className="h-3 w-1/2 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const { title, description, image, siteName, favicon } = data;

  return (
    <div className="relative group w-full max-w-xs mx-auto my-2 rounded-xl border border-white/10 bg-[#181922] overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
      {onClose && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose?.(); }}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1 text-white/60 hover:text-white hover:bg-black/70 cursor-pointer opacity-0 group-hover:opacity-100 transition"
          aria-label="Remove link preview"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {image && (
        <div className="aspect-video w-full overflow-hidden">
          <LazyMedia
            src={image}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            eager
          />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center gap-2 text-[11px] text-white/50 mb-1.5">
          <img src={favicon} alt="" className="w-3 h-3 rounded" onError={(e) => { e.currentTarget.src = `https://www.google.com/s2/favicons?domain=${siteName}&sz=32`; }} />
          <span className="font-medium truncate">{siteName}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </div>
        <h4 className="font-semibold text-white text-[13px] line-clamp-2 mb-1">{title}</h4>
        {description && (
          <p className="text-white/70 text-[12px] line-clamp-3">{description}</p>
        )}
        <div className="mt-2 text-[10px] text-white/40 font-mono truncate">{url}</div>
      </div>
    </div>
  );
}

export function LinkPreviewList({ urls, onRemove }: { urls: string[]; onRemove?: (url: string) => void }) {
  return (
    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
      {urls.map((url) => (
        <LinkPreview key={url} url={url} onClose={() => onRemove?.(url)} />
      ))}
    </div>
  );
}

// URLs in free text, deduplicated in first-seen order.
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)];
}

// Hook to extract URLs from text
export function useLinkPreviews(text: string): string[] {
  return extractUrls(text);
}









