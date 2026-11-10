export type WallpaperCategory = 'all' | 'gradients' | 'geometric';

export type WallpaperId =
  // Abstract Gradients
  | 'neon-nebula'
  | 'emerald-aurora'
  | 'crimson-noir'
  | 'midnight-sapphire'
  | 'amethyst-void'
  | 'sunset-ember'
  | 'minimal-noir'
  // Geometric Patterns
  | 'honeycomb'
  | 'circuit'
  | 'topography'
  | 'constellation'
  | 'bauhaus-grid'
  | 'carbon-weave'
  | 'doodles'
  // Notebook / grid paper
  | 'notebook'
  | 'grid-paper';

export interface WallpaperOption {
  id: WallpaperId;
  name: string;
  subtitle: string;
  category: 'gradients' | 'geometric';
  gradientBg: string;
  accentColor: string;
  badge?: string;
  glowColors?: {
    primary: string;
    secondary?: string;
  };
}

export const WALLPAPER_STORAGE_KEY = 'nova_messenger_chat_wallpaper';
export const WALLPAPER_INTENSITY_KEY = 'nova_messenger_wallpaper_intensity';

export const WALLPAPER_OPTIONS: WallpaperOption[] = [
  // --- Dark Abstract Gradients ---
  {
    id: 'neon-nebula',
    name: 'Neon Nebula',
    subtitle: 'Deep cosmic violet with coral aura',
    category: 'gradients',
    gradientBg: 'from-[#0a0614] via-[#120e24] to-[#1e1026]',
    accentColor: '#ff4e18',
    badge: 'Popular',
    glowColors: {
      primary: '#ff4e18',
      secondary: '#8b5cf6',
    },
  },
  {
    id: 'emerald-aurora',
    name: 'Emerald Aurora',
    subtitle: 'Forest noir with glowing malachite mist',
    category: 'gradients',
    gradientBg: 'from-[#050f0d] via-[#0b1d19] to-[#040d0c]',
    accentColor: '#10b981',
    glowColors: {
      primary: '#10b981',
      secondary: '#06b6d4',
    },
  },
  {
    id: 'crimson-noir',
    name: 'Crimson Velvet',
    subtitle: 'Dark burgundy embers & obsidian shadows',
    category: 'gradients',
    gradientBg: 'from-[#14080a] via-[#1f0b10] to-[#0d0406]',
    accentColor: '#ef4444',
    glowColors: {
      primary: '#e11d48',
      secondary: '#f97316',
    },
  },
  {
    id: 'midnight-sapphire',
    name: 'Midnight Sapphire',
    subtitle: 'Royal ultramarine depth with cyan horizon',
    category: 'gradients',
    gradientBg: 'from-[#050c18] via-[#09162e] to-[#030812]',
    accentColor: '#38bdf8',
    glowColors: {
      primary: '#2563eb',
      secondary: '#38bdf8',
    },
  },
  {
    id: 'amethyst-void',
    name: 'Amethyst Void',
    subtitle: 'Atmospheric dark plum with ethereal glow',
    category: 'gradients',
    gradientBg: 'from-[#0e0717] via-[#190d29] to-[#090410]',
    accentColor: '#c084fc',
    glowColors: {
      primary: '#a855f7',
      secondary: '#ec4899',
    },
  },
  {
    id: 'sunset-ember',
    name: 'Smoked Ember',
    subtitle: 'Warm molten bronze and molten charcoal',
    category: 'gradients',
    gradientBg: 'from-[#150a04] via-[#221207] to-[#0c0502]',
    accentColor: '#f59e0b',
    glowColors: {
      primary: '#f59e0b',
      secondary: '#ea580c',
    },
  },
  {
    id: 'minimal-noir',
    name: 'Obsidian Minimal',
    subtitle: 'Velvety dark canvas with soft ambient glow',
    category: 'gradients',
    gradientBg: 'from-[#08090d] via-[#0f1118] to-[#07080b]',
    accentColor: '#94a3b8',
    glowColors: {
      primary: '#ffffff',
      secondary: '#ff4e18',
    },
  },

  // --- Geometric Patterns ---
  {
    id: 'honeycomb',
    name: 'Hex Luxury Mesh',
    subtitle: 'Isometric architectural hexagonal wireframe',
    category: 'geometric',
    gradientBg: 'from-[#0e1017] via-[#161822] to-[#0c0d12]',
    accentColor: '#f59e0b',
    badge: 'Geometric',
  },
  {
    id: 'circuit',
    name: 'Cyber Grid',
    subtitle: 'Isometric tech junctions & circuit paths',
    category: 'geometric',
    gradientBg: 'from-[#0c0e17] via-[#141826] to-[#0a0c13]',
    accentColor: '#a855f7',
  },
  {
    id: 'topography',
    name: 'Topographic Waves',
    subtitle: 'Organic elevation contour lines',
    category: 'geometric',
    gradientBg: 'from-[#0b0e14] via-[#121822] to-[#080a0f]',
    accentColor: '#10b981',
  },
  {
    id: 'constellation',
    name: 'Celestial Starfield',
    subtitle: 'Deep cosmic star maps & orbital nodes',
    category: 'geometric',
    gradientBg: 'from-[#090d18] via-[#10172b] to-[#060810]',
    accentColor: '#38bdf8',
  },
  {
    id: 'bauhaus-grid',
    name: 'Bauhaus Matrix',
    subtitle: 'Precision architectural blueprint & dots',
    category: 'geometric',
    gradientBg: 'from-[#0d0e14] via-[#151722] to-[#0a0b10]',
    accentColor: '#ff4e18',
  },
  {
    id: 'carbon-weave',
    name: 'Carbon Weave',
    subtitle: 'Interlocking diagonal woven fiber texture',
    category: 'geometric',
    gradientBg: 'from-[#0a0b0e] via-[#13141a] to-[#08090c]',
    accentColor: '#e2e8f0',
  },
  {
    id: 'doodles',
    name: 'Messenger Doodles',
    subtitle: 'Hand-drawn vector icons & sketches',
    category: 'geometric',
    gradientBg: 'from-[#0d0f15] via-[#161823] to-[#0a0b10]',
    accentColor: '#ff4e18',
    badge: 'Classic',
  },
  // --- Notebook / Grid Paper ---
  {
    id: 'notebook',
    name: 'Тетрадь',
    subtitle: 'Линейный лист с красным полем',
    category: 'geometric',
    gradientBg: 'from-[#0f1118] via-[#14151c] to-[#0e0f14]',
    accentColor: '#ef4444',
  },
  {
    id: 'grid-paper',
    name: 'Клетка',
    subtitle: 'Клетчатый лист в темных тонах',
    category: 'geometric',
    gradientBg: 'from-[#0d0e13] via-[#12131c] to-[#0c0d12]',
    accentColor: '#94a3b8',
  },
];
