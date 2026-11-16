#!/usr/bin/env node
/**
 * Regenerates Android launcher icons from the master app icon.
 *
 * The adaptive-icon foreground must keep the artwork inside the 66dp safe zone
 * of the 108dp canvas, otherwise launchers crop it. Legacy icons get a solid
 * white background (square and round), and the foreground layer stays
 * transparent so the background color shows through the mask.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src-tauri/icons/app-icon.png');
const RES = path.join(ROOT, 'src-tauri/gen/android/app/src/main/res');
const DENSITIES = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function alphaBBox(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error(`No visible pixels in ${file}`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function renderPng(size, logo, maxRatio, shape) {
  const background =
    shape === 'none' || shape === 'round'
      ? { r: 0, g: 0, b: 0, alpha: 0 }
      : WHITE;
  let base = sharp({
    create: { width: size, height: size, channels: 4, background },
  }).png();
  if (shape === 'round') {
    const circle = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
    );
    base = sharp(await base.toBuffer()).composite([
      { input: circle, left: 0, top: 0 },
    ]);
  }

  const maxDim = Math.round(size * maxRatio);
  const scale = Math.min(maxDim / logo.width, maxDim / logo.height);
  const logoWidth = Math.max(1, Math.round(logo.width * scale));
  const logoHeight = Math.max(1, Math.round(logo.height * scale));
  const resized = await sharp(logo.buffer)
    .resize(logoWidth, logoHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  return base
    .composite([
      {
        input: resized,
        left: Math.round((size - logoWidth) / 2),
        top: Math.round((size - logoHeight) / 2),
      },
    ])
    .png()
    .toBuffer();
}

const bbox = await alphaBBox(SRC);
const logo = {
  ...bbox,
  buffer: await sharp(SRC).extract(bbox).png().toBuffer(),
};
console.log(
  `source logo ${bbox.width}x${bbox.height} from ${path.relative(ROOT, SRC)}`,
);

for (const [density, factor] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${density}`);
  await mkdir(dir, { recursive: true });

  const legacySize = Math.round(48 * factor);
  const adaptiveSize = Math.round(108 * factor);

  await writeFile(
    path.join(dir, 'ic_launcher.png'),
    await renderPng(legacySize, logo, 0.82, 'square'),
  );
  await writeFile(
    path.join(dir, 'ic_launcher_round.png'),
    await renderPng(legacySize, logo, 0.62, 'round'),
  );
  await writeFile(
    path.join(dir, 'ic_launcher_foreground.png'),
    await renderPng(adaptiveSize, logo, 0.56, 'none'),
  );
  console.log(`mipmap-${density}: legacy ${legacySize}px, adaptive ${adaptiveSize}px`);
}

// Round adaptive icon for launchers that request android:roundIcon.
const roundAdaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <background android:drawable="@color/ic_launcher_background"/>
  <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;
await mkdir(path.join(RES, 'mipmap-anydpi-v26'), { recursive: true });
await writeFile(
  path.join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'),
  roundAdaptive,
);

console.log('Android launcher icons regenerated.');
