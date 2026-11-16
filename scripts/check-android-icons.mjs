#!/usr/bin/env node
/**
 * Validates the generated Android launcher icons.
 *
 * Adaptive-icon foregrounds must stay inside the 66dp safe zone of the 108dp
 * canvas, otherwise round/squircle launcher masks crop the logo. Legacy icons
 * must keep their background and the artwork centred. Also checks that the
 * adaptive-icon XML still declares foreground/background/monochrome layers and
 * that the manifest points at the round icon.
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RES = path.join(ROOT, 'src-tauri/gen/android/app/src/main/res');
const MANIFEST = path.join(
  ROOT,
  'src-tauri/gen/android/app/src/main/AndroidManifest.xml',
);
const DENSITIES = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};
const SAFE_ZONE_DP = 66;
const ADAPTIVE_DP = 108;
const LEGACY_DP = 48;
const CENTER_TOLERANCE = 2;

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

async function readPixels(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

function alphaAt({ data, info }, x, y) {
  return data[(y * info.width + x) * 4 + 3];
}

function alphaBBox({ data, info }) {
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
  if (right < 0) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Bounding box of non-white artwork, used for opaque legacy backgrounds. */
function artworkBBox({ data, info }) {
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const [r, g, b, a] = data.subarray(offset, offset + 4);
      if (a > 8 && (r < 240 || g < 240 || b < 240)) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function checkCentered(bbox, size, label) {
  const centreX = bbox.left + bbox.width / 2;
  const centreY = bbox.top + bbox.height / 2;
  check(
    Math.abs(centreX - size / 2) <= CENTER_TOLERANCE,
    `${label}: artwork is not horizontally centred`,
  );
  check(
    Math.abs(centreY - size / 2) <= CENTER_TOLERANCE,
    `${label}: artwork is not vertically centred`,
  );
}

async function checkDensity(density, factor) {
  const dir = path.join(RES, `mipmap-${density}`);
  const legacySize = Math.round(LEGACY_DP * factor);
  const adaptiveSize = Math.round(ADAPTIVE_DP * factor);
  const safePx = Math.ceil(SAFE_ZONE_DP * factor) + 1;

  const foregroundFile = path.join(dir, 'ic_launcher_foreground.png');
  const foreground = await readPixels(foregroundFile);
  const label = `mipmap-${density}/ic_launcher_foreground.png`;
  check(
    foreground.info.width === adaptiveSize && foreground.info.height === adaptiveSize,
    `${label}: expected ${adaptiveSize}x${adaptiveSize}, got ${foreground.info.width}x${foreground.info.height}`,
  );
  const fgBox = alphaBBox(foreground);
  check(Boolean(fgBox), `${label}: no visible pixels`);
  if (fgBox) {
    check(
      Math.max(fgBox.width, fgBox.height) <= safePx,
      `${label}: logo is ${Math.max(fgBox.width, fgBox.height)}px, outside the ${safePx}px safe zone`,
    );
    checkCentered(fgBox, adaptiveSize, label);
  }

  const squareFile = path.join(dir, 'ic_launcher.png');
  const square = await readPixels(squareFile);
  const squareLabel = `mipmap-${density}/ic_launcher.png`;
  check(
    square.info.width === legacySize && square.info.height === legacySize,
    `${squareLabel}: expected ${legacySize}x${legacySize}, got ${square.info.width}x${square.info.height}`,
  );
  check(
    [0, square.info.width - 1].every((x) =>
      [0, square.info.height - 1].every((y) => alphaAt(square, x, y) === 255),
    ),
    `${squareLabel}: legacy square icon must have an opaque background`,
  );
  const squareBox = artworkBBox(square);
  check(Boolean(squareBox), `${squareLabel}: no visible artwork`);
  if (squareBox) {
    check(
      Math.max(squareBox.width, squareBox.height) <= Math.round(0.86 * legacySize),
      `${squareLabel}: artwork is too large for the legacy icon`,
    );
    checkCentered(squareBox, legacySize, squareLabel);
  }

  const roundFile = path.join(dir, 'ic_launcher_round.png');
  const round = await readPixels(roundFile);
  const roundLabel = `mipmap-${density}/ic_launcher_round.png`;
  check(
    round.info.width === legacySize && round.info.height === legacySize,
    `${roundLabel}: expected ${legacySize}x${legacySize}, got ${round.info.width}x${round.info.height}`,
  );
  check(
    [
      [0, 0],
      [round.info.width - 1, 0],
      [0, round.info.height - 1],
      [round.info.width - 1, round.info.height - 1],
    ].every(([x, y]) => alphaAt(round, x, y) === 0),
    `${roundLabel}: round legacy icon must have transparent corners`,
  );
  check(
    alphaAt(round, Math.floor(round.info.width / 2), Math.floor(round.info.height / 2)) > 250,
    `${roundLabel}: round legacy icon has no opaque centre`,
  );
  const roundBox = artworkBBox(round);
  check(Boolean(roundBox), `${roundLabel}: no visible artwork`);
  if (roundBox) {
    check(
      Math.max(roundBox.width, roundBox.height) <= Math.round(0.66 * legacySize),
      `${roundLabel}: artwork is too large for the round legacy icon`,
    );
    checkCentered(roundBox, legacySize, roundLabel);
  }
}

function checkAdaptiveXml(xml, label) {
  for (const layer of ['foreground', 'background', 'monochrome']) {
    check(
      xml.includes(`<${layer}`),
      `${label}: missing <${layer}> layer`,
    );
  }
}

const manifest = await readFile(MANIFEST, 'utf8');
check(
  manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"'),
  'AndroidManifest.xml: missing android:roundIcon="@mipmap/ic_launcher_round"',
);

for (const file of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const xml = await readFile(path.join(RES, 'mipmap-anydpi-v26', file), 'utf8');
  checkAdaptiveXml(xml, `mipmap-anydpi-v26/${file}`);
}

const background = await readFile(
  path.join(RES, 'values/ic_launcher_background.xml'),
  'utf8',
);
check(
  background.includes('#FFFFFF'),
  'values/ic_launcher_background.xml: expected a white (#FFFFFF) background',
);

for (const [density, factor] of Object.entries(DENSITIES)) {
  await checkDensity(density, factor);
}

if (errors.length > 0) {
  console.error(`Android icon check failed (${errors.length}):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log(
  `Android icons OK: ${Object.keys(DENSITIES).length} densities, foreground within ${SAFE_ZONE_DP}/${ADAPTIVE_DP}dp safe zone.`,
);
