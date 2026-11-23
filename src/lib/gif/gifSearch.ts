/**
 * GIF Search Service
 * Supports Giphy API (primary) and Tenor API (fallback)
 * Configure API keys in localStorage or environment
 */

export interface GifResult {
  id: string;
  title: string;
  url: string;           // Direct GIF URL (original size)
  previewUrl: string;    // Preview/small GIF URL
  previewWebp?: string;  // WebP preview for performance
  width: number;
  height: number;
  source: 'giphy' | 'tenor';
}

export interface GifSearchResponse {
  gifs: GifResult[];
  pagination: {
    totalCount: number;
    count: number;
    offset: number;
  };
}

const GIPHY_API_BASE = 'https://api.giphy.com/v1/gifs';
const TENOR_API_BASE = 'https://tenor.googleapis.com/v2';

const CACHE_KEY = 'nova_gif_search_cache_v1';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getGiphyApiKey(): string | null {
  try {
    return localStorage.getItem('nova_giphy_api_key');
  } catch {
    return null;
  }
}

function getTenorApiKey(): string | null {
  try {
    return localStorage.getItem('nova_tenor_api_key');
  } catch {
    return null;
  }
}

function setGiphyApiKey(key: string): void {
  try {
    localStorage.setItem('nova_giphy_api_key', key);
  } catch {
    void 0;
  }
}

function setTenorApiKey(key: string): void {
  try {
    localStorage.setItem('nova_tenor_api_key', key);
  } catch {
    void 0;
  }
}

function getCache(): Record<string, { data: GifSearchResponse; timestamp: number }> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setCache(cache: Record<string, { data: GifSearchResponse; timestamp: number }>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    void 0;
  }
}

async function fetchGiphy(query: string, offset = 0, limit = 20): Promise<GifSearchResponse | null> {
  const apiKey = getGiphyApiKey();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    api_key: apiKey,
    q: query,
    limit: String(limit),
    offset: String(offset),
    rating: 'g',
    lang: 'en',
    bundle: 'messaging_non_clips',
  });

  try {
    const response = await fetch(`${GIPHY_API_BASE}/search?${params}`);
    if (!response.ok) throw new Error(`Giphy API error: ${response.status}`);
    const data = await response.json();

    const gifs: GifResult[] = data.data.map((item: any) => ({
      id: `giphy-${item.id}`,
      title: item.title || 'GIF',
      url: item.images.original?.url || item.images.downsized?.url,
      previewUrl: item.images.fixed_height_small?.url || item.images.preview_gif?.url,
      previewWebp: item.images.fixed_height_small?.webp,
      width: item.images.original?.width ? parseInt(item.images.original.width) : 300,
      height: item.images.original?.height ? parseInt(item.images.original.height) : 300,
      source: 'giphy',
    }));

    return {
      gifs,
      pagination: {
        totalCount: data.pagination.total_count,
        count: data.pagination.count,
        offset: data.pagination.offset,
      },
    };
  } catch (error) {
    console.warn('Giphy search failed:', error);
    return null;
  }
}

async function fetchTenor(query: string, offset = 0, limit = 20): Promise<GifSearchResponse | null> {
  const apiKey = getTenorApiKey();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    limit: String(limit),
    pos: String(offset),
    media_filter: 'basic',
    contentfilter: 'low',
  });

  try {
    const response = await fetch(`${TENOR_API_BASE}/search?${params}`);
    if (!response.ok) throw new Error(`Tenor API error: ${response.status}`);
    const data = await response.json();

    const gifs: GifResult[] = (data.results || []).map((item: any) => {
      const gif = item.media_formats?.gif || item.media_formats?.tinygif || item.media_formats?.nanogif;
      const preview = item.media_formats?.tinygif || item.media_formats?.nanogif || item.media_formats?.gif;
      return {
        id: `tenor-${item.id}`,
        title: item.content_description || 'GIF',
        url: gif?.url,
        previewUrl: preview?.url,
        width: gif?.dims?.[0] || 300,
        height: gif?.dims?.[1] || 300,
        source: 'tenor',
      };
    }).filter((g: GifResult) => g.url);

    return {
      gifs,
      pagination: {
        totalCount: data.total ?? gifs.length,
        count: gifs.length,
        offset,
      },
    };
  } catch (error) {
    console.warn('Tenor search failed:', error);
    return null;
  }
}

export async function searchGifs(
  query: string,
  options: { offset?: number; limit?: number } = {}
): Promise<GifSearchResponse> {
  const cacheKey = `${query}:${options.offset || 0}:${options.limit || 20}`;
  const cache = getCache();
  const cached = cache[cacheKey];

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Try Giphy first, then Tenor as fallback
  let result = await fetchGiphy(query, options.offset, options.limit);
  if (!result || result.gifs.length === 0) {
    result = await fetchTenor(query, options.offset, options.limit);
  }

  if (!result) {
    // Fallback to empty result
    result = { gifs: [], pagination: { totalCount: 0, count: 0, offset: options.offset || 0 } };
  }

  // Cache the result
  cache[cacheKey] = { data: result, timestamp: Date.now() };
  setCache(cache);

  return result;
}

export async function getTrendingGifs(options: { offset?: number; limit?: number } = {}): Promise<GifSearchResponse> {
  const apiKey = getGiphyApiKey();
  if (!apiKey) return { gifs: [], pagination: { totalCount: 0, count: 0, offset: 0 } };

  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(options.limit || 20),
    offset: String(options.offset || 0),
    rating: 'g',
  });

  try {
    const response = await fetch(`${GIPHY_API_BASE}/trending?${params}`);
    if (!response.ok) throw new Error(`Giphy trending error: ${response.status}`);
    const data = await response.json();

    const gifs: GifResult[] = data.data.map((item: any) => ({
      id: `giphy-${item.id}`,
      title: item.title || 'Trending',
      url: item.images.original?.url || item.images.downsized?.url,
      previewUrl: item.images.fixed_height_small?.url || item.images.preview_gif?.url,
      previewWebp: item.images.fixed_height_small?.webp,
      width: item.images.original?.width ? parseInt(item.images.original.width) : 300,
      height: item.images.original?.height ? parseInt(item.images.original.height) : 300,
      source: 'giphy',
    }));

    return {
      gifs,
      pagination: {
        totalCount: data.pagination.total_count,
        count: data.pagination.count,
        offset: data.pagination.offset,
      },
    };
  } catch (error) {
    console.warn('Giphy trending failed:', error);
    return { gifs: [], pagination: { totalCount: 0, count: 0, offset: 0 } };
  }
}

export function configureGifApiKeys(giphy?: string, tenor?: string): void {
  if (giphy) setGiphyApiKey(giphy);
  if (tenor) setTenorApiKey(tenor);
}

export function getConfiguredGifApis(): { giphy: boolean; tenor: boolean } {
  return {
    giphy: !!getGiphyApiKey(),
    tenor: !!getTenorApiKey(),
  };
}

// Default trending categories for quick access
export const GIF_CATEGORIES = [
  { id: 'trending', label: 'Trending', emoji: '🔥' },
  { id: 'reactions', label: 'Reactions', emoji: '😂', query: 'reaction' },
  { id: 'celebrate', label: 'Celebrate', emoji: '🎉', query: 'celebration' },
  { id: 'love', label: 'Love', emoji: '❤️', query: 'love' },
  { id: 'funny', label: 'Funny', emoji: '😆', query: 'funny' },
  { id: 'animals', label: 'Animals', emoji: '🐱', query: 'cute animals' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮', query: 'gaming' },
  { id: 'anime', label: 'Anime', emoji: '✨', query: 'anime' },
  { id: 'memes', label: 'Memes', emoji: '🤡', query: 'meme' },
];

export function clearGifCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    void 0;
  }
}