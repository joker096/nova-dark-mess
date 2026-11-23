/**
 * Регрессионная проверка: не должно остаться захардкоженных цветов вне
 * `src/theme/tokens.css`. Цвета только через семантические CSS-переменные.
 * Исключения: цвет бренд-логотипа, эмодзи/иллюстрации, `currentColor`,
 * переменные `--nova-*` (уже токены) и `rgba(0,0,0,0)`/`transparent`.
 *
 * Запуск:  npx tsx scripts/check-hardcoded-colors.ts
 *          или  npm run lint:colors
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const TOKENS_FILE = path.join(ROOT, 'theme', 'tokens.css');

// Регулярки для захардкоженных цветов в CSS/TSX.
const HEX_COLOR = /#([0-9a-fA-F]{3,8})\b/;
const RGBA_COLOR = /rgba?\(/i;
const HSLA_COLOR = /hsla?\(/i;
const TEXT_WHITE = /\btext-(white|#fff|#ffffff)\b/;
const BG_WHITE = /\bbg-(white|#fff|#ffffff)\b/;
const BORDER_WHITE = /\bborder-(white|#fff|#ffffff)\b/;
const TEXT_HEX = /\btext-#([0-9a-fA-F]{3,8})\b/;
const BG_HEX = /\bbg-#([0-9a-fA-F]{3,8})\b/;

// Свойства, где цвет недопустим хардкодом.
const COLOR_PROP = /(color|background(-color)?|border(-color)?|fill|stroke|outline|caret-color)\s*:/i;

// Разрешённые цвета бренда (логотип, эмодзи, иллюстрации) — через NOVA_ALLOWED_COLORS.
const ALLOWED_HEX = new Set(
  process.env.NOVA_ALLOWED_COLORS?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) ?? []
);

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git']);
const EXCLUDED_FILES = new Set(['tokens.css', 'index.css', 'miniApp.ts']);

let failed = false;

function checkFile(filePath: string, relPath: string): void {
  // Пропускаем тесты, снимки, токены, глобальный remapping и miniApp мета-конфиг.
  if (
    /\.test\.(tsx?|spec\.tsx?)$/.test(relPath) ||
    /__visual__/.test(relPath) ||
    EXCLUDED_FILES.has(path.basename(relPath))
  ) {
    return;
  }
  if (!/\.(tsx?|css|scss)$/.test(relPath)) return;

  let src: string;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Пропускаем комментарии (// и /* ... */).
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    // Пропускаем строки с currentColor / transparent / переменные.
    if (
      /currentColor/.test(line) ||
      /transparent/.test(line) ||
      /var\(/.test(line) ||
      /--nova-/.test(line) ||
      /rgba\(0,0,0,0\)/.test(line)
    ) {
      continue;
    }

    // Hex-цвет в значении свойства.
    if (COLOR_PROP.test(line) && HEX_COLOR.test(line)) {
      const m = line.match(HEX_COLOR);
      if (m && !ALLOWED_HEX.has(m[1].toLowerCase())) {
        report(relPath, i + 1, `hardcoded hex color #${m[1]}: ${line.trim()}`);
        failed = true;
      }
      continue;
    }

    // rgba()/hsla() в значении свойства.
    if (COLOR_PROP.test(line) && (RGBA_COLOR.test(line) || HSLA_COLOR.test(line))) {
      if (/color-mix|var\(/.test(line)) continue;
      report(relPath, i + 1, `hardcoded rgba/hsla color: ${line.trim()}`);
      failed = true;
      continue;
    }

    // text-white / bg-white / border-white (хардкод белого).
    if (TEXT_WHITE.test(line) || BG_WHITE.test(line) || BORDER_WHITE.test(line)) {
      report(relPath, i + 1, `hardcoded white color utility: ${line.trim()}`);
      failed = true;
      continue;
    }

    // text-#hex / bg-#hex.
    if (TEXT_HEX.test(line) || BG_HEX.test(line)) {
      const m = line.match(TEXT_HEX ?? BG_HEX);
      if (m && !ALLOWED_HEX.has(m[1].toLowerCase())) {
        report(relPath, i + 1, `hardcoded hex color utility: ${line.trim()}`);
        failed = true;
      }
      continue;
    }
  }
}

function report(file: string, line: number, msg: string): void {
  console.error(`${file}:${line}: ${msg}`);
}

function walk(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walk(full);
    } else {
      checkFile(full, path.relative(ROOT, full));
    }
  }
}

walk(ROOT);

if (failed) {
  console.error('\nFAIL: найдены захардкоженные цвета вне src/theme/tokens.css');
  console.error('Исправьте их через семантические переменные (var(--...)) или укажите NOVA_ALLOWED_COLORS.');
  process.exit(1);
}

console.log('OK: нет захардкоженных цветов вне src/theme/tokens.css');
process.exit(0);
