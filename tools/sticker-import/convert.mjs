import sharp from 'sharp';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'fs/promises';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RAW_DIR = join(__dirname, 'raw');
const OUT_DIR = join(__dirname, '..', '..', 'src', 'assets', 'stickers');
const FULL_SIZE = 512;
const THUMB_SIZE = 128;

async function processSticker(rawPath, outDir, id, animated) {
  const dir = join(outDir, id);
  await mkdir(dir, { recursive: true });

  const base = basename(rawPath, '.' + basename(rawPath).split('.').pop());

  if (animated) {
    await copyFile(rawPath, join(dir, 'full.webp'));
    console.log(`  ${id}/full.webp (copied)`);
    return;
  }

  const meta = await sharp(rawPath).metadata();

  if (meta.format === 'svg') {
    await sharp(rawPath, { density: 300 })
      .resize(FULL_SIZE, FULL_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toFile(join(dir, 'full.webp'));

    await sharp(rawPath, { density: 300 })
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toFile(join(dir, 'thumb.webp'));

    console.log(`  ${id}/full.webp + thumb.webp`);
  } else {
    await sharp(rawPath)
      .resize(FULL_SIZE, FULL_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toFile(join(dir, 'full.webp'));

    await sharp(rawPath)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toFile(join(dir, 'thumb.webp'));

    console.log(`  ${id}/full.webp + thumb.webp`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const packs = await readdir(RAW_DIR, { recursive: true });

  for (const entry of packs) {
    const fullPath = join(RAW_DIR, entry);
    const stat = await import('fs/promises').then(m => m.stat(fullPath));
    if (!stat.isDirectory()) continue;

    const files = await readdir(fullPath);
    for (const file of files) {
      if (!file.endsWith('.svg') && !file.endsWith('.png') && !file.endsWith('.webp') && !file.endsWith('.apng')) continue;
      const id = file.split('.')[0];
      await processSticker(join(fullPath, file), OUT_DIR, id, file.endsWith('.apng') || file.endsWith('.webp'));
    }
  }

  console.log(`\nAll stickers in: ${OUT_DIR}`);
}

main().catch(console.error);
