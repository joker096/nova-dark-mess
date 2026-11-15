#!/usr/bin/env node
/**
 * publish-landing.js — Publish the Mess&Anger promo landing.
 *
 * The landing is a fully static site (HTML + CSS + JS + i18n JSON). In
 * production it is served from the site ROOT (https://mess.cvr.name/) by the
 * `server.js` Express app (which also handles PaymentO IPN + receipts).
 *
 * This script prepares a deploy bundle:
 *   1. Validates every referenced asset + lang JSON exists.
 *   2. Stages the landing into `landing-deploy/` (a copy of `landing/` plus
 *      `server.js` + `package.json` + `.env.example`) ready to copy to the host.
 *   3. Prints a copy-ready rsync/scp command for the host.
 *
 * Usage:
 *   node scripts/publish-landing.js                 # stage bundle
 *   node scripts/publish-landing.js --deploy <user@host>   # stage + scp
 *
 * Environment (optional):
 *   LANDING_HOST       host to deploy to, e.g. "deploy@1.2.3.4"
 *   LANDING_REMOTE     remote path, default "/var/www/mess-anger"
 *   LANDING_SSH_PORT   default 22
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LANDING = path.join(ROOT, 'landing');
const OUT = path.join(ROOT, 'landing-deploy');

const args = process.argv.slice(2);
const deployFlag = args.includes('--deploy');
const deployAt = args.indexOf('--deploy');
const deployHost = deployFlag
  ? (args[deployAt + 1] || process.env.LANDING_HOST || null)
  : null;

const fail = (msg) => {
  console.error('✗ ' + msg);
  process.exit(1);
};
const ok = (msg) => console.log('✓ ' + msg);

// ── 1. Validate assets referenced by index.html ─────────────────────
ok('Validating landing assets…');
const html = fs.readFileSync(path.join(LANDING, 'index.html'), 'utf8');

// Local asset references (strip absolute https and protocol-relative).
const refs = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const u = m[1];
  if (/^https?:/i.test(u) || u.startsWith('//') || u.startsWith('data:') ||
      u.startsWith('#') || u.startsWith('mailto:')) continue;
  refs.add(u.replace(/^\//, ''));
}
// i18n lang files
const langDir = path.join(LANDING, 'lang');
for (const f of fs.readdirSync(langDir)) {
  if (!f.endsWith('.json')) continue;
  try {
    JSON.parse(fs.readFileSync(path.join(langDir, f), 'utf8'));
  } catch (e) {
    fail(`lang/${f} is not valid JSON: ${e.message}`);
  }
}
// releases manifest
try {
  JSON.parse(fs.readFileSync(path.join(LANDING, 'releases', 'releases.json'), 'utf8'));
  ok('releases/releases.json valid');
} catch (e) {
  fail(`releases/releases.json invalid: ${e.message}`);
}
// Validate each local ref exists (skip dynamic JS files which are in LANDING).
for (const ref of [...refs]) {
  const p = path.join(LANDING, ref);
  if (!fs.existsSync(p)) fail(`index.html references missing asset: ${ref}`);
}
ok(`Checked ${refs.size} local asset references`);

// ── 2. Stage the bundle ──────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(LANDING, path.join(OUT, 'landing'), { recursive: true });
// Privacy policy must always ship: Google Play validates this exact URL.
// It lives one level above landing/ on the host; stage it into the bundle too.
const privacySrc = path.join(ROOT, 'landing', 'privacy.html');
if (fs.existsSync(privacySrc)) {
  fs.copyFileSync(privacySrc, path.join(OUT, 'landing', 'privacy.html'));
} else {
  fail('landing/privacy.html is missing — Google Play requires it');
}
fs.copyFileSync(path.join(ROOT, 'server.js'), path.join(OUT, 'server.js'));
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(OUT, 'package.json'));
fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(OUT, '.env.example'));

// package.json for the bundle should be minimal (express + dotenv only).
const pkg = JSON.parse(fs.readFileSync(path.join(OUT, 'package.json'), 'utf8'));
pkg.name = 'mess-anger-landing';
pkg.private = true;
pkg.scripts = {
  ...pkg.scripts,
  start: 'node server.js',
};
pkg.dependencies = {
  express: pkg.dependencies?.express || '4.19.0',
  dotenv: pkg.dependencies?.dotenv || '16.4.0',
};
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

// Pre-compressed siblings (served by nginx gzip_static/brotli_static when on)
// must be rebuilt from the fresh sources — copying landing/ would ship stale
// HTML/CSS/JS inside the .gz/.br files.
const COMPRESSIBLE = /\.(html|css|js|json|svg|webmanifest)$/;
const TEXT_ASSETS = ['index.html', 'styles.css', 'app.js', 'releaseUrls.js', 'paymento.js', 'manifest.json'];
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
let compressed = 0;
for (const file of walk(path.join(OUT, 'landing'))) {
  const rel = path.relative(path.join(OUT, 'landing'), file).split(path.sep).join('/');
  if (!COMPRESSIBLE.test(file)) continue;
  const hasSibling = fs.existsSync(file + '.gz') || fs.existsSync(file + '.br');
  if (!hasSibling && !TEXT_ASSETS.includes(rel)) continue;
  const buf = fs.readFileSync(file);
  fs.writeFileSync(file + '.gz', zlib.gzipSync(buf, { level: 9 }));
  fs.writeFileSync(file + '.br', zlib.brotliCompressSync(buf, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
    },
  }));
  compressed++;
}
ok(`Regenerated .gz/.br for ${compressed} files`);

ok(`Bundle staged at ${OUT}`);
const count = fs.readdirSync(OUT).length;
ok(`Staged ${count} top-level entries`);

// ── 3. Deploy ────────────────────────────────────────────────────────
if (deployFlag) {
  if (!deployHost) {
    fail('--deploy requires a host argument (user@host) or LANDING_HOST env');
  }
  const remote = process.env.LANDING_REMOTE || '/var/www/mess-anger';
  const port = process.env.LANDING_SSH_PORT || '22';
  const cmd = `scp -P ${port} -r ${JSON.stringify(OUT)} ${deployHost}:${remote}`;
  ok(`Deploy command:\n  ${cmd}\n  ssh -p ${port} ${deployHost} 'cd ${remote} && npm install --omit=dev && pm2 restart mess-anger-landing'`);
  if (deployHost === 'dry-run') {
    ok('dry-run mode — command printed, not executed');
  } else {
    try {
      execSync(cmd, { stdio: 'inherit' });
      ok('Deployed.');
    } catch (e) {
      fail('Deploy failed: ' + e.message);
    }
  }
} else {
  console.log('\nBundle ready. To deploy manually:');
  console.log('  scp -r ' + OUT + ' <user@host>:/var/www/mess-anger');
  console.log('  ssh <user@host> "cd /var/www/mess-anger && npm install --omit=dev && pm2 restart mess-anger-landing"');
  console.log('\nOr run: node scripts/publish-landing.js --deploy <user@host>');
}
