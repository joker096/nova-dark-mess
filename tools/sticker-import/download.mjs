import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RAW_DIR = join(__dirname, 'raw');
const DATA_FILE = join(__dirname, '..', '..', 'src', 'data', 'stickers.ts');

const PACKS = [
  {
    id: 'basic-emotions',
    name: 'Basic Emotions',
    icon: '😀',
    description: 'Essential face emotions',
    category: 'emotions',
    sortOrder: 10,
    license: 'CC0',
    stickers: [
      { id: 'smile', name: 'Smile', emoji: '😊', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f60a.svg' },
      { id: 'laugh', name: 'Laugh', emoji: '😂', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f602.svg' },
      { id: 'heart-eyes', name: 'Heart Eyes', emoji: '😍', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f60d.svg' },
      { id: 'wink', name: 'Wink', emoji: '😉', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f609.svg' },
      { id: 'thinking', name: 'Thinking', emoji: '🤔', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f914.svg' },
      { id: 'sad', name: 'Sad', emoji: '😢', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f622.svg' },
      { id: 'angry', name: 'Angry', emoji: '😠', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f620.svg' },
      { id: 'surprised', name: 'Surprised', emoji: '😮', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f62e.svg' },
      { id: 'sleepy', name: 'Sleepy', emoji: '🥱', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f971.svg' },
      { id: 'silly', name: 'Silly', emoji: '🤪', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f92a.svg' },
      { id: 'cool', name: 'Cool', emoji: '😎', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f60e.svg' },
      { id: 'kiss', name: 'Kiss', emoji: '😘', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f618.svg' },
      { id: 'money', name: 'Money', emoji: '🤑', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f911.svg' },
      { id: 'nerd', name: 'Nerd', emoji: '🤓', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f913.svg' },
      { id: 'party', name: 'Party', emoji: '🥳', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f973.svg' },
      { id: 'shocked', name: 'Shocked', emoji: '😱', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f631.svg' },
      { id: 'facepalm', name: 'Facepalm', emoji: '🤦', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f926.svg' },
      { id: 'smirk', name: 'Smirk', emoji: '😏', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f60f.svg' },
    ],
  },
  {
    id: 'reactions',
    name: 'Reactions',
    icon: '👍',
    description: 'Hand gesture reactions',
    category: 'reactions',
    sortOrder: 20,
    license: 'CC0',
    stickers: [
      { id: 'thumbs-up', name: 'Thumbs Up', emoji: '👍', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f44d.svg' },
      { id: 'thumbs-down', name: 'Thumbs Down', emoji: '👎', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f44e.svg' },
      { id: 'clap', name: 'Clap', emoji: '👏', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f44f.svg' },
      { id: 'heart-hands', name: 'Heart Hands', emoji: '🫶', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1faf6.svg' },
      { id: 'prayer', name: 'Prayer', emoji: '🙏', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f64f.svg' },
      { id: 'fist', name: 'Fist', emoji: '✊', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/270a.svg' },
      { id: 'peace', name: 'Peace', emoji: '✌️', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/270c.svg' },
      { id: 'point-up', name: 'Point Up', emoji: '☝️', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/261d.svg' },
      { id: 'crossed-arms', name: 'Crossed Arms', emoji: '🦲', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f9b2.svg' },
      { id: 'pinching', name: 'Pinching Hand', emoji: '🤌', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f90c.svg' },
      { id: 'wave', name: 'Wave', emoji: '👋', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f44b.svg' },
      { id: 'ok', name: "OK", emoji: '👌', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f44c.svg' },
      { id: 'handshake', name: 'Handshake', emoji: '🤝', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f91d.svg' },
      { id: 'call-me', name: 'Call Me', emoji: '📞', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4de.svg' },
      { id: 'sparkles', name: 'Sparkles', emoji: '✨', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2728.svg' },
      { id: 'fire', name: 'Fire', emoji: '🔥', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f525.svg' },
    ],
  },
  {
    id: 'animals-memes',
    name: 'Animals & Memes',
    icon: '🐱',
    description: 'Cute animals and meme faces',
    category: 'animals',
    sortOrder: 30,
    license: 'CC0',
    stickers: [
      { id: 'cat', name: 'Cat', emoji: '🐱', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f431.svg' },
      { id: 'dog', name: 'Dog', emoji: '🐶', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f436.svg' },
      { id: 'panda', name: 'Panda', emoji: '🐼', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f43c.svg' },
      { id: 'fox', name: 'Fox', emoji: '🦊', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f98a.svg' },
      { id: 'penguin', name: 'Penguin', emoji: '🐧', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f427.svg' },
      { id: 'frog', name: 'Frog', emoji: '🐸', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f438.svg' },
      { id: 'unicorn', name: 'Unicorn', emoji: '🦄', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f984.svg' },
      { id: 'penguin-dance', name: 'Penguin Dance', emoji: '🐧', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f427.svg' },
      { id: 'shrimp', name: 'Shrimp', emoji: '🦐', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f990.svg' },
      { id: 'octopus', name: 'Octopus', emoji: '🐙', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f419.svg' },
      { id: 'sloth', name: 'Sloth', emoji: '🦥', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f9a5.svg' },
      { id: 't-rex', name: 'T-Rex', emoji: '🦖', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f996.svg' },
      { id: 'butterfly', name: 'Butterfly', emoji: '🦋', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f99b.svg' },
      { id: 'dango', name: 'Dango', emoji: '🍡', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f361.svg' },
      { id: 'chicken', name: 'Chicken', emoji: '🐔', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f414.svg' },
    ],
  },
  {
    id: 'work-it',
    name: 'Work & IT',
    icon: '💻',
    description: 'Tech, office and productivity',
    category: 'work',
    sortOrder: 40,
    license: 'CC0',
    stickers: [
      { id: 'laptop', name: 'Laptop', emoji: '💻', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4bb.svg' },
      { id: 'bug', name: 'Bug', emoji: '🐛', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f41b.svg' },
      { id: 'terminal', name: 'Terminal', emoji: '⌨️', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2328.svg' },
      { id: 'coffee', name: 'Coffee', emoji: '☕', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2615.svg' },
      { id: 'rocket', name: 'Rocket', emoji: '🚀', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f680.svg' },
      { id: 'gear', name: 'Gear', emoji: '⚙️', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2699.svg' },
      { id: 'brain', name: 'Brain', emoji: '🧠', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f9e0.svg' },
      { id: 'flash', name: 'Flash', emoji: '⚡', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/26a1.svg' },
      { id: 'chart', name: 'Chart', emoji: '📊', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4ca.svg' },
      { id: 'shield', name: 'Shield', emoji: '🛡️', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f6e1.svg' },
      { id: 'wifi', name: 'WiFi', emoji: '📶', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4f6.svg' },
      { id: 'phone', name: 'Phone', emoji: '📱', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4f1.svg' },
      { id: 'battery', name: 'Battery', emoji: '🔋', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f50b.svg' },
      { id: 'key', name: 'Key', emoji: '🔑', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f511.svg' },
      { id: 'clock', name: 'Clock', emoji: '⏰', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/23f0.svg' },
      { id: 'document', name: 'Document', emoji: '📄', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4c4.svg' },
    ],
  },
  {
    id: 'holidays',
    name: 'Holidays',
    icon: '🎄',
    description: 'Festive and seasonal',
    category: 'holidays',
    sortOrder: 50,
    license: 'CC0',
    stickers: [
      { id: 'tree', name: 'Christmas Tree', emoji: '🎄', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f384.svg' },
      { id: 'gift', name: 'Gift', emoji: '🎁', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f381.svg' },
      { id: 'santa', name: 'Santa', emoji: '🎅', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f385.svg' },
      { id: 'snowman', name: 'Snowman', emoji: '⛄', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/26c4.svg' },
      { id: 'lights', name: 'Lights', emoji: '🎊', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f38a.svg' },
      { id: 'cake', name: 'Cake', emoji: '🎂', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f382.svg' },
      { id: 'balloon', name: 'Balloon', emoji: '🎈', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f388.svg' },
      { id: 'egg', name: 'Easter Egg', emoji: '🥚', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f95a.svg' },
      { id: 'firework', name: 'Firework', emoji: '🎇', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f387.svg' },
      { id: 'heart', name: 'Heart', emoji: '❤️', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2764.svg' },
      { id: 'candy', name: 'Candy', emoji: '🍬', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f36c.svg' },
      { id: 'halloween', name: 'Halloween', emoji: '🎃', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f383.svg' },
      { id: 'popcorn', name: 'Popcorn', emoji: '🍿', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f37f.svg' },
      { id: 'champagne', name: 'Champagne', emoji: '🥂', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f9c2.svg' },
    ],
  },
];

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  for (const pack of PACKS) {
    const packDir = join(RAW_DIR, pack.id);
    await mkdir(packDir, { recursive: true });

    for (const sticker of pack.stickers) {
      const ext = sticker.url.split('.').pop();
      const rawFile = join(packDir, `${sticker.id}.${ext}`);

      try {
        const res = await fetch(sticker.url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!res.ok) {
          console.warn(`  SKIP ${sticker.id}: HTTP ${res.status}`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(rawFile, buf);
        console.log(`  OK ${sticker.id} (${buf.length}b)`);
      } catch (e) {
        console.warn(`  FAIL ${sticker.id}: ${e}`);
      }
    }
  }
  console.log('Done.');
}

main();
