import React from 'react';
import { WallpaperId, WALLPAPER_OPTIONS } from '../data/wallpapers';

interface DoodleBackgroundProps {
  className?: string;
  wallpaperId?: WallpaperId;
  intensity?: number; // 20 to 100, default 70
}

export const DoodleBackground: React.FC<DoodleBackgroundProps> = ({
  className = '',
  wallpaperId = 'neon-nebula',
  intensity = 70,
}) => {
  const selectedConfig =
    WALLPAPER_OPTIONS.find((w) => w.id === wallpaperId) || WALLPAPER_OPTIONS[0];

  // Opacity factor based on intensity (0.2 to 1.0)
  const factor = Math.max(0.2, Math.min(1.0, intensity / 100));
  const svgPatternOpacity = (0.045 * factor * 1.4).toFixed(3);
  const glowOpacity = (0.16 * factor).toFixed(3);

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none transition-colors duration-700 ${className}`}
      aria-hidden="true"
    >
      {/* 1. Underlying Dark Gradient Layer */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${selectedConfig.gradientBg} transition-all duration-700`}
      />

      {/* 2. Abstract Gradient Glow Orbs (Fluid Ambient Lighting) */}
      {selectedConfig.category === 'gradients' && selectedConfig.glowColors && (
        <div className="absolute inset-0 overflow-hidden transition-opacity duration-700">
          {/* Primary Top-Left / Center Glow */}
          <div
            className="absolute -top-20 -left-20 w-96 h-96 rounded-full blur-[95px] transition-all duration-700"
            style={{
              backgroundColor: selectedConfig.glowColors.primary,
              opacity: glowOpacity,
            }}
          />

          {/* Secondary Bottom-Right Glow */}
          {selectedConfig.glowColors.secondary && (
            <div
              className="absolute -bottom-24 -right-16 w-[420px] h-[420px] rounded-full blur-[110px] transition-all duration-700"
              style={{
                backgroundColor: selectedConfig.glowColors.secondary,
                opacity: (parseFloat(glowOpacity) * 0.85).toFixed(3),
              }}
            />
          )}

          {/* Central Subtle Ambient Mesh */}
          <div
            className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full blur-[100px] transition-all duration-700"
            style={{
              backgroundColor: selectedConfig.accentColor,
              opacity: (parseFloat(glowOpacity) * 0.45).toFixed(3),
            }}
          />

          {/* Fluid Curved Contour Waves for Abstract Gradients */}
          <svg
            className="w-full h-full absolute inset-0 transition-opacity duration-700"
            style={{ opacity: (0.035 * factor * 1.5).toFixed(3) }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="fluid-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
                <stop offset="100%" stopColor={selectedConfig.accentColor} stopOpacity="0.3" />
              </linearGradient>
            </defs>
            <path
              d="M -50 120 Q 120 40 220 180 T 450 140 T 600 240"
              fill="none"
              stroke="url(#fluid-grad)"
              strokeWidth="2.5"
            />
            <path
              d="M -30 260 Q 140 180 260 310 T 520 280 T 700 390"
              fill="none"
              stroke="url(#fluid-grad)"
              strokeWidth="2"
            />
            <path
              d="M -80 440 Q 90 360 210 500 T 480 460 T 640 580"
              fill="none"
              stroke="url(#fluid-grad)"
              strokeWidth="2.5"
            />
            <circle cx="180" cy="190" r="120" fill="none" stroke="url(#fluid-grad)" strokeWidth="1" strokeDasharray="6 6" />
            <circle cx="340" cy="460" r="160" fill="none" stroke="url(#fluid-grad)" strokeWidth="1" strokeDasharray="8 8" />
          </svg>
        </div>
      )}

      {/* 3. Geometric Pattern SVGs */}

      {/* A. DOODLES */}
      {wallpaperId === 'doodles' && (
        <svg
          className="w-full h-full text-white transition-opacity duration-500"
          style={{ opacity: svgPatternOpacity }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="messenger-doodles"
              width="140"
              height="140"
              patternUnits="userSpaceOnUse"
            >
              {/* Paper plane */}
              <path
                d="M15 15 L32 20 L22 24 L20 32 Z M22 24 L15 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Heart */}
              <path
                d="M75 18 C72 13 65 14 65 20 C65 26 75 32 75 32 C75 32 85 26 85 20 C85 14 78 13 75 18 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Star */}
              <polygon
                points="115,18 118,25 125,25 120,29 122,36 115,32 108,36 110,29 105,25 112,25"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              {/* Coffee mug */}
              <path
                d="M20 70 L20 82 A 5 5 0 0 0 25 87 L33 87 A 5 5 0 0 0 38 82 L38 70 Z M38 74 L42 74 A 2.5 2.5 0 0 1 42 79 L38 79"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              {/* Chat bubble */}
              <path
                d="M70 65 C62 65 58 70 58 76 C58 80 61 84 66 86 L64 91 L71 88 C76 88 82 85 82 76 C82 70 76 65 70 65 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Sparkle */}
              <path
                d="M118 70 L118 84 M111 77 L125 77"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              {/* Headphones */}
              <path
                d="M18 115 A 10 10 0 0 1 38 115 M18 115 L18 123 M38 115 L38 123"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              {/* Gamepad */}
              <path
                d="M62 118 C62 114 65 112 70 112 L80 112 C85 112 88 114 88 118 L86 128 C85 131 82 131 80 128 L76 124 L74 124 L70 128 C68 131 65 131 64 128 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              {/* Camera */}
              <rect
                x="108"
                y="112"
                width="20"
                height="15"
                rx="3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle
                cx="118"
                cy="120"
                r="3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#messenger-doodles)" />
        </svg>
      )}

      {/* B. CONSTELLATION */}
      {wallpaperId === 'constellation' && (
        <svg
          className="w-full h-full text-white transition-opacity duration-500"
          style={{ opacity: svgPatternOpacity }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="constellation-pattern"
              width="150"
              height="150"
              patternUnits="userSpaceOnUse"
            >
              <line x1="20" y1="30" x2="60" y2="25" stroke="currentColor" strokeWidth="1" />
              <line x1="60" y1="25" x2="90" y2="55" stroke="currentColor" strokeWidth="1" />
              <line x1="90" y1="55" x2="120" y2="40" stroke="currentColor" strokeWidth="1" />
              <line x1="60" y1="25" x2="70" y2="85" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
              
              <circle cx="20" cy="30" r="2.5" fill="currentColor" />
              <circle cx="60" cy="25" r="3" fill="currentColor" />
              <circle cx="90" cy="55" r="2" fill="currentColor" />
              <circle cx="120" cy="40" r="2.5" fill="currentColor" />
              <circle cx="70" cy="85" r="3" fill="currentColor" />

              <circle
                cx="70"
                cy="85"
                r="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeDasharray="4 4"
              />

              <line x1="25" y1="110" x2="55" y2="135" stroke="currentColor" strokeWidth="1" />
              <line x1="55" y1="135" x2="105" y2="120" stroke="currentColor" strokeWidth="1" />
              <circle cx="25" cy="110" r="2" fill="currentColor" />
              <circle cx="55" cy="135" r="2.5" fill="currentColor" />
              <circle cx="105" cy="120" r="3" fill="currentColor" />

              <circle cx="135" cy="95" r="1.5" fill="currentColor" />
              <circle cx="45" cy="70" r="1.2" fill="currentColor" />
              <circle cx="110" cy="15" r="1.5" fill="currentColor" />
              <polygon
                points="138,135 140,140 145,140 141,143 143,148 138,145 133,148 135,143 131,140 136,140"
                fill="currentColor"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#constellation-pattern)" />
        </svg>
      )}

      {/* C. TOPOGRAPHY */}
      {wallpaperId === 'topography' && (
        <svg
          className="w-full h-full text-white transition-opacity duration-500"
          style={{ opacity: svgPatternOpacity }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="topography-pattern"
              width="200"
              height="200"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M -20,40 C 30,10 70,80 130,50 C 180,20 200,90 230,70"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M -20,65 C 30,35 70,105 130,75 C 180,45 200,115 230,95"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M -20,90 C 30,60 70,130 130,100 C 180,70 200,140 230,120"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M -20,115 C 30,85 70,155 130,125 C 180,95 200,165 230,145"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M -20,140 C 30,110 70,180 130,150 C 180,120 200,190 230,170"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M -20,165 C 30,135 70,205 130,175 C 180,145 200,215 230,195"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle
                cx="85"
                cy="145"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle
                cx="85"
                cy="145"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#topography-pattern)" />
        </svg>
      )}

      {/* D. CIRCUIT */}
      {wallpaperId === 'circuit' && (
        <svg
          className="w-full h-full text-white transition-opacity duration-500"
          style={{ opacity: svgPatternOpacity }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="circuit-pattern"
              width="120"
              height="120"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 10,10 L 40,10 L 60,30 L 100,30"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="10" cy="10" r="2.5" fill="currentColor" />
              <circle cx="100" cy="30" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />

              <path
                d="M 20,50 L 50,50 L 70,70 L 70,110"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="20" cy="50" r="2.5" fill="currentColor" />
              <circle cx="70" cy="110" r="2.5" fill="currentColor" />

              <path
                d="M 90,60 L 90,90 L 110,110"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="90" cy="60" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="110" cy="110" r="2.5" fill="currentColor" />

              <rect
                x="40"
                y="80"
                width="16"
                height="16"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
              <line x1="36" y1="84" x2="40" y2="84" stroke="currentColor" strokeWidth="1" />
              <line x1="36" y1="88" x2="40" y2="88" stroke="currentColor" strokeWidth="1" />
              <line x1="36" y1="92" x2="40" y2="92" stroke="currentColor" strokeWidth="1" />
              <line x1="56" y1="84" x2="60" y2="84" stroke="currentColor" strokeWidth="1" />
              <line x1="56" y1="88" x2="60" y2="88" stroke="currentColor" strokeWidth="1" />
              <line x1="56" y1="92" x2="60" y2="92" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#circuit-pattern)" />
        </svg>
      )}

      {/* E. HONEYCOMB */}
      {wallpaperId === 'honeycomb' && (
        <svg
          className="w-full h-full text-white transition-opacity duration-500"
          style={{ opacity: svgPatternOpacity }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="honeycomb-pattern"
              width="56"
              height="96"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 28 0 L 56 16 L 56 48 L 28 64 L 0 48 L 0 16 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M 28 48 L 56 64 L 56 96 L 28 112 L 0 96 L 0 64 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M -28 48 L 0 64 L 0 96 L -28 112 L -56 96 L -56 64 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M 56 0 L 84 16 L 84 48 L 56 64 L 28 48 L 28 16 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="28" cy="32" r="1.5" fill="currentColor" opacity="0.6" />
              <circle cx="28" cy="80" r="1.5" fill="currentColor" opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#honeycomb-pattern)" />
        </svg>
      )}

      {/* F. BAUHAUS MATRIX */}
      {wallpaperId === 'bauhaus-grid' && (
        <svg
          className="w-full h-full text-white transition-opacity duration-500"
          style={{ opacity: svgPatternOpacity }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="bauhaus-pattern"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              {/* Dot matrix grid */}
              <circle cx="30" cy="30" r="1.2" fill="currentColor" />
              <circle cx="0" cy="0" r="1" fill="currentColor" />
              <circle cx="60" cy="0" r="1" fill="currentColor" />
              <circle cx="0" cy="60" r="1" fill="currentColor" />
              <circle cx="60" cy="60" r="1" fill="currentColor" />

              {/* Crosshairs */}
              <line x1="26" y1="30" x2="34" y2="30" stroke="currentColor" strokeWidth="0.8" />
              <line x1="30" y1="26" x2="30" y2="34" stroke="currentColor" strokeWidth="0.8" />

              {/* Faint border bounds */}
              <line x1="0" y1="30" x2="60" y2="30" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 6" />
              <line x1="30" y1="0" x2="30" y2="60" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bauhaus-pattern)" />
        </svg>
      )}

      {/* G. CARBON WEAVE */}
      {wallpaperId === 'carbon-weave' && (
        <svg
          className="w-full h-full text-white transition-opacity duration-500"
          style={{ opacity: svgPatternOpacity }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="carbon-pattern"
              width="16"
              height="16"
              patternUnits="userSpaceOnUse"
            >
              <rect x="0" y="0" width="8" height="8" fill="currentColor" fillOpacity="0.25" />
              <rect x="8" y="8" width="8" height="8" fill="currentColor" fillOpacity="0.25" />
              <line x1="0" y1="0" x2="16" y2="16" stroke="currentColor" strokeWidth="0.8" />
              <line x1="0" y1="8" x2="8" y2="0" stroke="currentColor" strokeWidth="0.8" />
              <line x1="8" y1="16" x2="16" y2="8" stroke="currentColor" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#carbon-pattern)" />
        </svg>
      )}

      {/* 4. Protective Edge Vignette & Top/Bottom Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0c10]/35 via-transparent to-[#0b0c10]/60 pointer-events-none" />
    </div>
  );
};
