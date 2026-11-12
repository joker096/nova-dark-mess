import { StickerData } from '../types/messenger';

export interface StickerPack {
  id: string;
  name: string;
  icon: string;
  description: string;
  stickers: StickerData[];
}

export interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  category: string;
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: 'cyber',
    name: 'Nova Cyber',
    icon: '⚡',
    description: 'Futuristic neon stickers for cyber operatives',
    stickers: [
      {
        id: 'cyber-cat',
        packId: 'cyber',
        packName: 'Nova Cyber',
        name: 'Cyber Cat',
        emoji: '🐱',
        svgBadge: 'CYBER-NEKO',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <linearGradient id="cyberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ff4e18"/>
                <stop offset="100%" stop-color="#a855f7"/>
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <circle cx="60" cy="60" r="54" fill="#141522" stroke="url(#cyberGrad)" stroke-width="3" filter="url(#glow)"/>
            <!-- Ears -->
            <polygon points="30,42 42,16 54,34" fill="#ff4e18"/>
            <polygon points="66,34 78,16 90,42" fill="#ff4e18"/>
            <polygon points="36,40 44,24 50,34" fill="#a855f7"/>
            <polygon points="70,34 76,24 84,40" fill="#a855f7"/>
            <!-- Head -->
            <circle cx="60" cy="64" r="32" fill="#1d1e2e"/>
            <!-- Visor -->
            <rect x="36" y="52" width="48" height="15" rx="7" fill="#06b6d4" filter="url(#glow)"/>
            <line x1="40" y1="59" x2="80" y2="59" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
            <!-- Nose & Mouth -->
            <polygon points="58,74 62,74 60,77" fill="#ff4e18"/>
            <path d="M54,80 Q60,84 66,80" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round"/>
            <!-- Whiskers -->
            <line x1="28" y1="68" x2="40" y2="70" stroke="#06b6d4" stroke-width="1.5"/>
            <line x1="26" y1="74" x2="38" y2="74" stroke="#06b6d4" stroke-width="1.5"/>
            <line x1="92" y1="68" x2="80" y2="70" stroke="#06b6d4" stroke-width="1.5"/>
            <line x1="94" y1="74" x2="82" y2="74" stroke="#06b6d4" stroke-width="1.5"/>
            <text x="60" y="108" text-anchor="middle" fill="#06b6d4" font-family="monospace" font-size="9" font-weight="bold" letter-spacing="1">CYBER-NEKO</text>
          </svg>
        `)}`,
      },
      {
        id: 'cyber-skull',
        packId: 'cyber',
        packName: 'Nova Cyber',
        name: 'Neon Skull',
        emoji: '💀',
        svgBadge: 'GHOST-IN-SHELL',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <linearGradient id="skullGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#06b6d4"/>
                <stop offset="100%" stop-color="#10b981"/>
              </linearGradient>
              <filter id="neon" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <circle cx="60" cy="60" r="54" fill="#141522" stroke="url(#skullGrad)" stroke-width="3" filter="url(#neon)"/>
            <!-- Skull Dome -->
            <path d="M35,62 C35,36 85,36 85,62 C85,74 76,82 72,85 L48,85 C44,82 35,74 35,62 Z" fill="#1e2235" stroke="#06b6d4" stroke-width="2"/>
            <!-- Eye Sockets Glowing -->
            <ellipse cx="48" cy="56" rx="7" ry="9" fill="#10b981" filter="url(#neon)"/>
            <ellipse cx="72" cy="56" rx="7" ry="9" fill="#10b981" filter="url(#neon)"/>
            <circle cx="48" cy="56" r="3" fill="#ffffff"/>
            <circle cx="72" cy="56" r="3" fill="#ffffff"/>
            <!-- Nose -->
            <polygon points="60,67 56,74 64,74" fill="#06b6d4"/>
            <!-- Teeth -->
            <path d="M50,85 L50,91 M56,85 L56,91 M64,85 L64,91 M70,85 L70,91" stroke="#06b6d4" stroke-width="2"/>
            <rect x="46" y="85" width="28" height="6" fill="none" stroke="#06b6d4" stroke-width="1.5" rx="2"/>
            <text x="60" y="108" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="9" font-weight="bold">SYSTEM OVERRIDE</text>
          </svg>
        `)}`,
      },
      {
        id: 'cyber-rocket',
        packId: 'cyber',
        packName: 'Nova Cyber',
        name: 'Hyper Rocket',
        emoji: '🚀',
        svgBadge: 'TO-THE-MOON',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <linearGradient id="rocketFire" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#fde047"/>
                <stop offset="50%" stop-color="#ff4e18"/>
                <stop offset="100%" stop-color="#dc2626"/>
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="54" fill="#12131d" stroke="#ff4e18" stroke-width="2.5"/>
            <!-- Flame -->
            <polygon points="52,78 60,104 68,78" fill="url(#rocketFire)"/>
            <polygon points="56,78 60,94 64,78" fill="#ffffff"/>
            <!-- Rocket Body -->
            <path d="M60,22 C72,36 74,60 72,78 L48,78 C46,60 48,36 60,22 Z" fill="#e2e8f0"/>
            <!-- Fins -->
            <polygon points="48,64 36,78 48,78" fill="#ff4e18"/>
            <polygon points="72,64 84,78 72,78" fill="#ff4e18"/>
            <!-- Nosecone -->
            <path d="M60,22 C64,28 66,36 66,40 L54,40 C54,36 56,28 60,22 Z" fill="#ff4e18"/>
            <!-- Window -->
            <circle cx="60" cy="50" r="7" fill="#0284c7" stroke="#ffffff" stroke-width="2"/>
            <circle cx="58" cy="48" r="2.5" fill="#ffffff"/>
            <text x="60" y="112" text-anchor="middle" fill="#ff4e18" font-family="sans-serif" font-size="9" font-weight="900">LFG 🚀</text>
          </svg>
        `)}`,
      },
      {
        id: 'cyber-heart',
        packId: 'cyber',
        packName: 'Nova Cyber',
        name: 'Holo Heart',
        emoji: '💖',
        svgBadge: 'NEO-LOVE',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f43f5e"/>
                <stop offset="100%" stop-color="#ec4899"/>
              </linearGradient>
              <filter id="heartGlow">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <circle cx="60" cy="60" r="54" fill="#19131d" stroke="#f43f5e" stroke-width="2.5" filter="url(#heartGlow)"/>
            <path d="M60,86 C60,86 32,66 32,47 C32,35 41,27 52,27 C57,27 60,30 60,30 C60,30 63,27 68,27 C79,27 88,35 88,47 C88,66 60,86 60,86 Z" fill="url(#heartGrad)" filter="url(#heartGlow)"/>
            <!-- Glitch grid lines inside heart -->
            <line x1="42" y1="42" x2="78" y2="42" stroke="#ffffff" stroke-width="1.5" opacity="0.6"/>
            <line x1="38" y1="52" x2="82" y2="52" stroke="#ffffff" stroke-width="1.5" opacity="0.6"/>
            <line x1="46" y1="62" x2="74" y2="62" stroke="#ffffff" stroke-width="1.5" opacity="0.6"/>
            <text x="60" y="106" text-anchor="middle" fill="#fb7185" font-family="monospace" font-size="9" font-weight="bold">SYNCHRONIZED</text>
          </svg>
        `)}`,
      },
      {
        id: 'cyber-bot',
        packId: 'cyber',
        packName: 'Nova Cyber',
        name: 'AI Agent',
        emoji: '🤖',
        svgBadge: 'AI-CORE',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="54" fill="#131722" stroke="#38bdf8" stroke-width="2.5"/>
            <!-- Antenna -->
            <line x1="60" y1="20" x2="60" y2="34" stroke="#38bdf8" stroke-width="3"/>
            <circle cx="60" cy="18" r="4" fill="#ff4e18"/>
            <!-- Head -->
            <rect x="36" y="34" width="48" height="40" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
            <!-- Ears -->
            <rect x="30" y="46" width="6" height="16" rx="2" fill="#38bdf8"/>
            <rect x="84" y="46" width="6" height="16" rx="2" fill="#38bdf8"/>
            <!-- Screen -->
            <rect x="42" y="42" width="36" height="24" rx="6" fill="#0f172a"/>
            <!-- Eyes -->
            <circle cx="51" cy="52" r="4" fill="#38bdf8"/>
            <circle cx="69" cy="52" r="4" fill="#38bdf8"/>
            <!-- Smile -->
            <path d="M52,60 Q60,65 68,60" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
            <!-- Neck / Body top -->
            <rect x="52" y="74" width="16" height="6" fill="#334155"/>
            <path d="M40,80 L80,80 L86,92 L34,92 Z" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
            <text x="60" y="108" text-anchor="middle" fill="#38bdf8" font-family="monospace" font-size="9" font-weight="bold">AI OPERATIONAL</text>
          </svg>
        `)}`,
      },
      {
        id: 'cyber-lasereyes',
        packId: 'cyber',
        packName: 'Nova Cyber',
        name: 'Laser Eyes',
        emoji: '⚡',
        svgBadge: 'LASER-BEAM',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <linearGradient id="laserGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ff4e18"/>
                <stop offset="100%" stop-color="#fef08a"/>
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="54" fill="#141520" stroke="#f59e0b" stroke-width="2.5"/>
            <!-- Face -->
            <circle cx="60" cy="60" r="32" fill="#f59e0b"/>
            <!-- Sunglasses -->
            <path d="M38,50 L82,50 L78,64 L62,64 L60,56 L58,64 L42,64 Z" fill="#111827"/>
            <!-- Lasers shooting out -->
            <polygon points="46,55 0,51 0,61" fill="url(#laserGrad)"/>
            <polygon points="74,55 120,51 120,61" fill="url(#laserGrad)"/>
            <!-- Smirk -->
            <path d="M50,76 Q60,82 70,76" fill="none" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>
            <text x="60" y="108" text-anchor="middle" fill="#f59e0b" font-family="sans-serif" font-size="9" font-weight="bold">BULLISH ⚡</text>
          </svg>
        `)}`,
      },
    ],
  },
  {
    id: 'memes',
    name: 'Pepe & Internet',
    icon: '🐸',
    description: 'Iconic memes for peak group chat culture',
    stickers: [
      {
        id: 'pepe-chill',
        packId: 'memes',
        packName: 'Pepe & Internet',
        name: 'Feels Good Man',
        emoji: '🐸',
        svgBadge: 'FEELS-GOOD',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="54" fill="#141f17" stroke="#4ade80" stroke-width="2.5"/>
            <!-- Frog Face -->
            <ellipse cx="60" cy="64" rx="36" ry="28" fill="#4ade80"/>
            <!-- Big frog eyes -->
            <circle cx="45" cy="42" r="14" fill="#ffffff" stroke="#166534" stroke-width="3"/>
            <circle cx="75" cy="42" r="14" fill="#ffffff" stroke="#166534" stroke-width="3"/>
            <ellipse cx="48" cy="42" rx="6" ry="7" fill="#14532d"/>
            <ellipse cx="78" cy="42" rx="6" ry="7" fill="#14532d"/>
            <!-- Eyelids relaxed -->
            <path d="M31,38 Q45,30 59,38" fill="none" stroke="#166534" stroke-width="3"/>
            <path d="M61,38 Q75,30 89,38" fill="none" stroke="#166534" stroke-width="3"/>
            <!-- Iconic Wide Smile -->
            <path d="M32,68 C42,88 78,88 88,68 C76,76 44,76 32,68 Z" fill="#bbf7d0" stroke="#166534" stroke-width="2.5"/>
            <text x="60" y="108" text-anchor="middle" fill="#4ade80" font-family="sans-serif" font-size="9" font-weight="900">FEELS GOOD MAN</text>
          </svg>
        `)}`,
      },
      {
        id: 'meme-fine',
        packId: 'memes',
        packName: 'Pepe & Internet',
        name: 'This is Fine',
        emoji: '☕',
        svgBadge: 'THIS-IS-FINE',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="54" fill="#201511" stroke="#f97316" stroke-width="2.5"/>
            <!-- Flames in background -->
            <polygon points="25,90 32,55 42,90" fill="#ef4444"/>
            <polygon points="40,90 50,45 60,90" fill="#f97316"/>
            <polygon points="58,90 70,50 82,90" fill="#eab308"/>
            <polygon points="80,90 90,58 98,90" fill="#ef4444"/>
            <!-- Dog Head -->
            <ellipse cx="58" cy="65" rx="22" ry="18" fill="#d97706"/>
            <!-- Hat -->
            <rect x="46" y="44" width="24" height="6" fill="#1e293b"/>
            <rect x="50" y="34" width="16" height="10" fill="#1e293b"/>
            <!-- Dog Eye -->
            <circle cx="54" cy="62" r="4.5" fill="#ffffff" stroke="#78350f" stroke-width="1.5"/>
            <circle cx="55" cy="62" r="2" fill="#000000"/>
            <circle cx="68" cy="62" r="4.5" fill="#ffffff" stroke="#78350f" stroke-width="1.5"/>
            <circle cx="69" cy="62" r="2" fill="#000000"/>
            <!-- Calm smile -->
            <path d="M56,70 Q62,75 68,70" fill="none" stroke="#78350f" stroke-width="2" stroke-linecap="round"/>
            <!-- Coffee Mug -->
            <rect x="36" y="74" width="12" height="10" rx="2" fill="#ffffff"/>
            <text x="60" y="108" text-anchor="middle" fill="#f97316" font-family="sans-serif" font-size="9" font-weight="900">THIS IS FINE 🔥</text>
          </svg>
        `)}`,
      },
      {
        id: 'meme-brain',
        packId: 'memes',
        packName: 'Pepe & Internet',
        name: 'Galaxy Brain',
        emoji: '🧠',
        svgBadge: 'GALAXY-BRAIN',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <radialGradient id="brainGlow" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stop-color="#c084fc"/>
                <stop offset="50%" stop-color="#6366f1"/>
                <stop offset="100%" stop-color="#1e1b4b"/>
              </radialGradient>
            </defs>
            <circle cx="60" cy="60" r="54" fill="#0f0e1f" stroke="#818cf8" stroke-width="2.5"/>
            <!-- Cosmic glowing rays -->
            <line x1="60" y1="14" x2="60" y2="28" stroke="#c084fc" stroke-width="2.5"/>
            <line x1="32" y1="26" x2="42" y2="36" stroke="#c084fc" stroke-width="2.5"/>
            <line x1="88" y1="26" x2="78" y2="36" stroke="#c084fc" stroke-width="2.5"/>
            <line x1="20" y1="52" x2="34" y2="52" stroke="#c084fc" stroke-width="2.5"/>
            <line x1="100" y1="52" x2="86" y2="52" stroke="#c084fc" stroke-width="2.5"/>
            <!-- Glowing Brain -->
            <path d="M44,48 C36,44 36,60 44,66 C40,74 52,78 60,76 C68,78 80,74 76,66 C84,60 84,44 76,48 C76,36 68,36 60,40 C52,36 44,36 44,48 Z" fill="url(#brainGlow)" stroke="#e0e7ff" stroke-width="2"/>
            <path d="M60,40 L60,75" stroke="#e0e7ff" stroke-width="1.5" stroke-dasharray="3,2"/>
            <text x="60" y="104" text-anchor="middle" fill="#c084fc" font-family="sans-serif" font-size="9" font-weight="900">10,000 IQ 🧠</text>
          </svg>
        `)}`,
      },
      {
        id: 'meme-chad',
        packId: 'memes',
        packName: 'Pepe & Internet',
        name: 'Gigachad',
        emoji: '🗿',
        svgBadge: 'CHAD',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="54" fill="#18181b" stroke="#a1a1aa" stroke-width="2.5"/>
            <!-- Moai / Chad Head silhouette with chisel jaw -->
            <path d="M48,26 L72,26 L72,48 L82,62 L74,86 L58,88 L52,78 L48,50 Z" fill="#52525b" stroke="#d4d4d8" stroke-width="2"/>
            <!-- Heavy brow -->
            <rect x="52" y="38" width="22" height="6" fill="#27272a"/>
            <!-- Nose -->
            <polygon points="68,44 76,62 66,62" fill="#71717a"/>
            <!-- Jawline shadow -->
            <path d="M54,78 L74,86 L62,94 Z" fill="#27272a"/>
            <text x="60" y="108" text-anchor="middle" fill="#e4e4e7" font-family="sans-serif" font-size="9" font-weight="900">AVERAGE ENJOYER 🗿</text>
          </svg>
        `)}`,
      },
    ],
  },
  {
    id: 'reactions',
    name: 'Vibrant Reactions',
    icon: '✨',
    description: 'High energy animated reaction expressions',
    stickers: [
      {
        id: 'react-party',
        packId: 'reactions',
        packName: 'Vibrant Reactions',
        name: 'Party Time',
        emoji: '🎉',
        svgBadge: 'CELEBRATE',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="54" fill="#1c1626" stroke="#f43f5e" stroke-width="2.5"/>
            <!-- Confetti dots -->
            <circle cx="34" cy="30" r="3" fill="#fde047"/>
            <circle cx="82" cy="24" r="3.5" fill="#38bdf8"/>
            <circle cx="94" cy="52" r="2.5" fill="#4ade80"/>
            <circle cx="28" cy="64" r="3" fill="#ec4899"/>
            <circle cx="70" cy="36" r="2.5" fill="#a855f7"/>
            <!-- Party Horn / Popper -->
            <polygon points="36,88 84,40 76,32 28,80" fill="#f59e0b"/>
            <polygon points="84,40 76,32 88,28" fill="#ef4444"/>
            <!-- Streamers -->
            <path d="M84,36 Q96,20 102,34 Q108,46 114,32" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M78,44 Q90,56 104,50" fill="none" stroke="#ec4899" stroke-width="2.5" stroke-linecap="round"/>
            <text x="60" y="108" text-anchor="middle" fill="#f43f5e" font-family="sans-serif" font-size="9" font-weight="900">PARTY TIME! 🎉</text>
          </svg>
        `)}`,
      },
      {
        id: 'react-fire',
        packId: 'reactions',
        packName: 'Vibrant Reactions',
        name: 'Absolute Fire',
        emoji: '🔥',
        svgBadge: 'HOT',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stop-color="#ea580c"/>
                <stop offset="60%" stop-color="#f97316"/>
                <stop offset="100%" stop-color="#fde047"/>
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="54" fill="#1b120c" stroke="#f97316" stroke-width="2.5"/>
            <!-- Big Flame Outer -->
            <path d="M60,20 C68,36 88,52 88,72 C88,88 75,98 60,98 C45,98 32,88 32,72 C32,54 50,42 54,34 C56,44 64,48 64,48 C64,48 54,30 60,20 Z" fill="url(#fireGrad)"/>
            <!-- Inner Flame -->
            <path d="M60,54 C65,62 74,70 74,80 C74,88 68,92 60,92 C52,92 46,88 46,80 C46,72 54,64 58,60 Z" fill="#ffffff" opacity="0.9"/>
            <text x="60" y="110" text-anchor="middle" fill="#fb923c" font-family="sans-serif" font-size="9" font-weight="900">STRAIGHT FIRE 🔥</text>
          </svg>
        `)}`,
      },
      {
        id: 'react-love',
        packId: 'reactions',
        packName: 'Vibrant Reactions',
        name: 'Heart Eyes',
        emoji: '😍',
        svgBadge: 'LOVE',
        imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="54" fill="#1e131d" stroke="#f43f5e" stroke-width="2.5"/>
            <!-- Yellow face -->
            <circle cx="60" cy="60" r="34" fill="#facc15"/>
            <!-- Heart Eyes -->
            <path d="M46,54 C46,54 36,44 36,38 C36,33 40,30 44,30 C46,30 47,32 47,32 C47,32 48,30 50,30 C54,30 58,33 58,38 C58,44 46,54 46,54 Z" fill="#ef4444"/>
            <path d="M74,54 C74,54 64,44 64,38 C64,33 68,30 72,30 C74,30 75,32 75,32 C75,32 76,30 78,30 C82,30 86,33 86,38 C86,44 74,54 74,54 Z" fill="#ef4444"/>
            <!-- Big open smile -->
            <path d="M46,66 C46,78 74,78 74,66 Z" fill="#854d0e"/>
            <path d="M52,74 C56,76 64,76 68,74 Z" fill="#f87171"/>
            <text x="60" y="108" text-anchor="middle" fill="#f43f5e" font-family="sans-serif" font-size="9" font-weight="900">LOVING THIS 😍</text>
          </svg>
        `)}`,
      },
    ],
  },
];

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
