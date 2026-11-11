export interface MediaPreset {
  id: string;
  label: string;
  url: string;
}

const svgPreset = (
  from: string,
  to: string,
  glow: string,
  curve: string,
): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient><radialGradient id="r" cx="28%" cy="18%" r="72%"><stop offset="0" stop-color="${glow}" stop-opacity="0.9"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs><rect width="800" height="1000" fill="url(#g)"/><rect width="800" height="1000" fill="url(#r)"/><path d="${curve}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/><circle cx="620" cy="210" r="120" fill="rgba(255,255,255,0.08)"/><circle cx="170" cy="780" r="190" fill="rgba(0,0,0,0.2)"/><circle cx="410" cy="500" r="250" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const MEDIA_PRESETS: MediaPreset[] = [
  {
    id: 'sunset',
    label: 'Golden hour',
    url: svgPreset(
      '#ff8a3d',
      '#3b1d4f',
      '#ffb347',
      'M0 720 C 180 600, 300 840, 480 700 S 720 560, 800 640',
    ),
  },
  {
    id: 'kyiv',
    label: 'Kyiv evening',
    url: svgPreset(
      '#1d4ed8',
      '#0b1026',
      '#60a5fa',
      'M0 640 C 140 540, 260 760, 420 620 S 680 480, 800 560',
    ),
  },
  {
    id: 'friends',
    label: 'Friends',
    url: svgPreset(
      '#db2777',
      '#1f1147',
      '#f472b6',
      'M0 780 C 200 700, 320 860, 500 740 S 700 620, 800 700',
    ),
  },
  {
    id: 'portrait',
    label: 'Portrait',
    url: svgPreset(
      '#f59e0b',
      '#451a03',
      '#fbbf24',
      'M0 600 C 180 500, 300 700, 460 580 S 680 440, 800 520',
    ),
  },
  {
    id: 'downtown',
    label: 'Downtown',
    url: svgPreset(
      '#0ea5e9',
      '#082f49',
      '#38bdf8',
      'M0 680 C 160 580, 280 800, 440 660 S 660 520, 800 600',
    ),
  },
  {
    id: 'coffee',
    label: 'Coffee break',
    url: svgPreset(
      '#92400e',
      '#1c1917',
      '#d97706',
      'M0 740 C 200 660, 340 820, 520 700 S 720 580, 800 660',
    ),
  },
  {
    id: 'music',
    label: 'Live music',
    url: svgPreset(
      '#7c3aed',
      '#140026',
      '#a855f7',
      'M0 620 C 160 520, 300 740, 460 600 S 680 460, 800 540',
    ),
  },
  {
    id: 'mountains',
    label: 'Mountain road',
    url: svgPreset(
      '#059669',
      '#022c22',
      '#34d399',
      'M0 800 C 180 680, 300 880, 480 740 S 700 620, 800 700',
    ),
  },
];
