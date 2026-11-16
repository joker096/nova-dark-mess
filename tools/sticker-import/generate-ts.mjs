import { mkdir, readdir, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RAW_DIR = join(__dirname, 'raw');
const OUT_DIR = join(__dirname, '..', '..', 'src', 'data', 'stickerPacks');

const PACK_META = {
  'basic-emotions': { id: 'basic-emotions', name: 'Basic Emotions', icon: '😀', description: 'Essential face emotions', category: 'emotions', sortOrder: 10, license: 'CC0' },
  'reactions': { id: 'reactions', name: 'Reactions', icon: '👍', description: 'Hand gesture reactions', category: 'reactions', sortOrder: 20, license: 'CC0' },
  'animals-memes': { id: 'animals-memes', name: 'Animals & Memes', icon: '🐱', description: 'Cute animals and meme faces', category: 'animals', sortOrder: 30, license: 'CC0' },
  'work-it': { id: 'work-it', name: 'Work & IT', icon: '💻', description: 'Tech, office and productivity', category: 'work', sortOrder: 40, license: 'CC0' },
  'holidays': { id: 'holidays', name: 'Holidays', icon: '🎄', description: 'Festive and seasonal', category: 'holidays', sortOrder: 50, license: 'CC0' },
};

const EMOJI_FALLBACK = {
  smile: '😊', laugh: '😂', 'heart-eyes': '😍', wink: '😉', thinking: '🤔',
  sad: '😢', angry: '😠', surprised: '😮', sleepy: '🥱', silly: '🤪',
  cool: '😎', kiss: '😘', money: '🤑', nerd: '🤓', party: '🥳',
  shocked: '😱', facepalm: '🤦', smirk: '😏',
  'thumbs-up': '👍', 'thumbs-down': '👎', clap: '👏', 'heart-hands': '🫶',
  prayer: '🙏', fist: '✊', peace: '✌️', 'point-up': '☝️',
  'crossed-arms': '🦲', pinching: '🤌', wave: '👋', ok: '👌',
  handshake: '🤝', 'call-me': '📞', sparkles: '✨', fire: '🔥',
  cat: '🐱', dog: '🐶', panda: '🐼', fox: '🦊', penguin: '🐧',
  frog: '🐸', unicorn: '🦄', 'penguin-dance': '🐧', shrimp: '🦐',
  octopus: '🐙', sloth: '🦥', 't-rex': '🦖', butterfly: '🦋',
  dango: '🍡', chicken: '🐔',
  laptop: '💻', bug: '🐛', terminal: '⌨️', coffee: '☕', rocket: '🚀',
  gear: '⚙️', brain: '🧠', flash: '⚡', chart: '📊',
  shield: '🛡️', wifi: '📶', phone: '📱', battery: '🔋',
  key: '🔑', clock: '⏰', document: '📄',
  tree: '🎄', gift: '🎁', santa: '🎅', snowman: '⛄', lights: '🎊',
  cake: '🎂', balloon: '🎈', egg: '🥚', firework: '🎇',
  heart: '❤️', candy: '🍬', halloween: '🎃', popcorn: '🍿', champagne: '🥂',
};

function capitalize(s) {
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const packs = (await readdir(RAW_DIR)).filter(p => PACK_META[p]).sort();
  const importLines = [];
  const exportLines = [];

  for (const packId of packs) {
    const meta = PACK_META[packId];
    const packPath = join(RAW_DIR, packId);
    const files = (await readdir(packPath)).filter(f => f.endsWith('.svg') || f.endsWith('.png')).sort();

    if (files.length === 0) continue;

    const stickers = files.map(f => {
      const id = f.split('.')[0];
      const emoji = EMOJI_FALLBACK[id] || '❓';
      const name = capitalize(id);
      return `  { id: '${id}', packId: '${packId}', packName: '${meta.name}', name: '${name}', emoji: '${emoji}', imageUrl: '/stickers/${packId}/${id}/full.webp', thumbUrl: '/stickers/${packId}/${id}/thumb.webp' },`;
    });

    const constName = packId.replace(/-/g, '_').toUpperCase();
    const ts = `import { StickerPack } from '../types/messenger.js';

export const ${constName}_PACK: StickerPack = {
  id: '${meta.id}',
  name: '${meta.name}',
  icon: '${meta.icon}',
  description: '${meta.description}',
  category: '${meta.category}',
  sortOrder: ${meta.sortOrder},
  license: '${meta.license}',
  stickers: [
${stickers.join('\n')}
  ],
};
`;
    await writeFile(join(OUT_DIR, `${packId}.ts`), ts, 'utf-8');
    importLines.push(`import { ${constName}_PACK } from './${packId}.js';`);
    exportLines.push(`  ${constName}_PACK,`);
    console.log(`  ${packId}.ts (${stickers.length} stickers)`);
  }

  const indexTs = `import { StickerPack } from '../types/messenger.js';
${importLines.join('\n')}

export const BUILT_STICKER_PACKS: StickerPack[] = [
${exportLines.join('\n')}
];
`;
  await writeFile(join(OUT_DIR, 'index.ts'), indexTs, 'utf-8');
  console.log('index.ts written');
}

main().catch(console.error);
