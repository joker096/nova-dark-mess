import { StickerAccess, StickerData } from '../types/messenger';
import { BUILT_STICKER_PACKS } from './stickerPacks';

export interface StickerPack {
  id: string;
  name: string;
  icon: string;
  description: string;
  stickers: StickerData[];
  access?: StickerAccess;
  sortOrder?: number;
  tags?: string[];
  category?: string;
  releaseDate?: string;
  animated?: boolean;
  license?: string;
  attribution?: string;
  imported?: boolean;
}

export interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  category: string;
}

export const STICKER_PACKS: StickerPack[] = BUILT_STICKER_PACKS;

export const MOCK_GIFS: GifItem[] = [
  {
    id: 'gif-hacker',
    title: 'Matrix Neon Hacker',
    category: 'Cyberpunk',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=500&auto=format&fit=crop&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'gif-city',
    title: 'Cyberpunk Neon City Night',
    category: 'Cyberpunk',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&auto=format&fit=crop&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'gif-cheers',
    title: 'Celebration Cheers & Drinks',
    category: 'Celebration',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'gif-beach',
    title: 'Tropical Sunset Vibes',
    category: 'Vibes',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'gif-party',
    title: 'Laser Festival Rave',
    category: 'Celebration',
    url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=500&auto=format&fit=crop&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: 'gif-retro',
    title: 'Synthwave Neon Grid Drive',
    category: 'Cyberpunk',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    previewUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&auto=format&fit=crop&q=80',
  },
];
