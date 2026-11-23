#!/usr/bin/env node
/**
 * deploy-3d-landing.js — Deploy the 3D landing page to the server.
 *
 * This script stages the 3D landing page and deploys it via SCP to the server.
 * The 3D landing is a fully static site (HTML + CSS + JS + 3D assets).
 *
 * Usage:
 *   node scripts/deploy-3d-landing.js                 # stage bundle locally
 *   node scripts/deploy-3d-landing.js --deploy <user@host>   # stage + scp deploy
 *   node scripts/deploy-3d-landing.js --dry-run       # show plan only
 *
 * Environment:
 *   LANDING_HOST       host to deploy to, e.g. "deploy@mess.cvr.name"
 *   LANDING_REMOTE     remote path, default "/var/www/mess.cvr.name"
 *   LANDING_SSH_PORT   default 22
 *   LANDING_SSH_KEY    path to SSH private key
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LANDING_3D = path.join(ROOT, 'landing-3d', 'landing');

const args = process.argv.slice(2);
const deployFlag = args.includes('--deploy');
const deployAt = args.indexOf('--deploy');
const dryRun = args.includes('--dry-run') ||
  process.env.npm_config_dry_run === 'true' ||
  process.env.npm_config_dry_run === '1';
const deployHost = deployFlag
  ? (args[deployAt + 1] || process.env.LANDING_HOST || null)
  : null;

if (dryRun && !deployFlag) {
  console.error('✗ --dry-run requires --deploy');
  process.exit(1);
}

const tempStageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mess-anger-3d-landing-'));
const OUT = path.join(tempStageRoot, 'bundle');
process.on('exit', () => fs.rmSync(tempStageRoot, { recursive: true, force: true }));

const fail = (msg) => {
  console.error('✗ ' + msg);
  process.exit(1);
};
const ok = (msg) => console.log('✓ ' + msg);

// ── 1. Validate assets referenced by index.html ─────────────────────
ok('Validating 3D landing assets…');
const html = fs.readFileSync(path.join(LANDING_3D, 'index.html'), 'utf8');

const refs = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const u = m[1];
  if (/^https?:/i.test(u) || u.startsWith('//') || u.startsWith('data:') ||
      u.startsWith('#') || u.startsWith('mailto:')) continue;
  refs.add(u.replace(/^\//, ''));
}

// Validate each local ref exists
for (const ref of [...refs]) {
  const p = path.join(LANDING_3D, ref);
  if (!fs.existsSync(p)) fail(`index.html references missing asset: ${ref}`);
}
ok(`Checked ${refs.size} local asset references`);

// Check critical files
const criticalFiles = ['assets/phone3d.js', 'assets/phone.glb', 'favicon.svg', 'apple-touch-icon.png', 'privacy.html'];
for (const f of criticalFiles) {
  if (!fs.existsSync(path.join(LANDING_3D, f))) {
    fail(`Missing critical file: ${f}`);
  }
}
ok('All critical files present');

// ── 2. Stage the bundle ──────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(LANDING_3D, path.join(OUT, 'landing'), { recursive: true });

// Pre-compressed siblings for nginx gzip_static/brotli_static
const COMPRESSIBLE = /\.(html|css|js|json|svg|webmanifest|glb|webp|png)$/;
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
const remote = (process.env.LANDING_REMOTE || '/var/www/mess.cvr.name').replace(/\/+$/, '');
const sshPort = process.env.LANDING_SSH_PORT || '22';
const sshKey = (process.env.LANDING_SSH_KEY || '').trim();

const posix = (p) => p.split(path.sep).join('/');
const q = (p) => `"${posix(p)}"`;
const sshKeyArg = sshKey ? `-i ${q(sshKey)}` : '';
const sshCmd = (inner) => `ssh ${sshKeyArg} -p ${sshPort} ${deployHost} ${JSON.stringify(inner)}`;
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

const copyLanding = `scp ${sshKeyArg} -P ${sshPort} -r ${q(path.join(OUT, 'landing'))} ${deployHost}:${remote}/`;
const verifyCmd = sshCmd(`test -f "${remote}/landing/index.html" && test -f "${remote}/landing/phone3d.js" && test -f "${remote}/landing/phone.glb"`);

if (!deployFlag) {
  console.log('\nBundle ready. To deploy manually:');
  console.log(`  scp -r ${q(path.join(OUT, 'landing'))} <user@host>:${remote}/`);
  console.log('\nOr run: node scripts/deploy-3d-landing.js --deploy <user@host>');
} else if (!deployHost) {
  fail('--deploy requires a host argument (user@host) or LANDING_HOST env');
} else {
  console.log('\nDeploy plan:');
  console.log('  1. ' + copyLanding);
  console.log('  2. ' + verifyCmd);

  if (dryRun || deployHost === 'dry-run') {
    ok('dry-run mode — nothing executed');
  } else {
    try {
      run(copyLanding);
      run(verifyCmd);
      ok(`3D landing uploaded to ${deployHost}:${remote}/landing`);
      ok('Remember to reload nginx if using gzip_static/brotli_static');
    } catch (e) {
      fail('Deploy failed: ' + e.message);
    }
  }
}