#!/usr/bin/env node
/**
 * publish-landing.js — Publish the Mess&Anger promo landing.
 *
 * The landing is a fully static site (HTML + CSS + JS + i18n JSON). In
 * production it is served from the site ROOT (https://mess.cvr.name/) by the
 * `server.js` Express app (which also handles PaymentO IPN + receipts).
 *
 * The full mode stages the landing with the backend into `landing-deploy/`.
 * Static-only mode stages a temporary landing-only bundle and does not restart
 * the API.
 *
 * Usage:
 *   node scripts/publish-landing.js                 # stage bundle
 *   node scripts/publish-landing.js --deploy <user@host>   # stage + scp
 *   node scripts/publish-landing.js --static-only [--dry-run]
 *
 * Environment (optional):
 *   LANDING_HOST       host to deploy to, e.g. "deploy@1.2.3.4"
 *   LANDING_REMOTE     remote path, default "/var/www/mess.cvr.name"
 *   LANDING_SSH_PORT   default 22
 *   Static-only deploy defaults to the local SSH alias "prod".
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LANDING = path.join(ROOT, 'landing');

const args = process.argv.slice(2);
const deployFlag = args.includes('--deploy');
const deployAt = args.indexOf('--deploy');
const staticOnly = args.includes('--static-only');
const dryRun = args.includes('--dry-run') ||
  process.env.npm_config_dry_run === 'true' ||
  process.env.npm_config_dry_run === '1';
const deployHost = staticOnly
  ? (process.env.LANDING_HOST || 'prod')
  : deployFlag
    ? (args[deployAt + 1] || process.env.LANDING_HOST || null)
    : null;
if (dryRun && !staticOnly) {
  console.error('✗ --dry-run is supported only with --static-only');
  process.exit(1);
}
const tempStageRoot = staticOnly
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'mess-anger-landing-'))
  : null;
const OUT = tempStageRoot
  ? path.join(tempStageRoot, 'bundle')
  : path.join(ROOT, 'landing-deploy');
if (tempStageRoot) {
  process.on('exit', () => fs.rmSync(tempStageRoot, { recursive: true, force: true }));
}

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
if (!staticOnly) {
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
}

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
// The live site is served by the `mess-api` pm2 process running as `user0`
// from LANDING_REMOTE, with the static root at <remote>/landing.
// `package.json` is deliberately not uploaded: production keeps its own
// manifest (type: module, its own name) and a root-owned node_modules, so
// shipping the bundle manifest would rename the pm2 app and reinstall deps.
const remote = (process.env.LANDING_REMOTE || '/var/www/mess.cvr.name').replace(/\/+$/, '');
const sshPort = process.env.LANDING_SSH_PORT || '22';
const pm2App = process.env.LANDING_PM2_APP || 'mess-api';
const pm2User = process.env.LANDING_PM2_USER || 'user0';
const healthUrl = process.env.LANDING_HEALTH_URL || 'http://127.0.0.1:3002/api/health';
const sshKey = (process.env.LANDING_SSH_KEY || '').trim();

const posix = (p) => p.split(path.sep).join('/');
const q = (p) => `"${posix(p)}"`;
const sshKeyArg = sshKey ? `-i ${q(sshKey)}` : '';
const sshCmd = (inner) => `ssh ${sshKeyArg} -p ${sshPort} ${deployHost} ${JSON.stringify(inner)}`;
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

const copyLanding = `scp ${sshKeyArg} -P ${sshPort} -r ${q(path.join(OUT, 'landing'))} ${deployHost}:${remote}/`;
const staticPreflightCmd = sshCmd(`test -d "${remote}/landing" && test -f "${remote}/server.js"`);
const staticVerifyCmd = sshCmd(`test -f "${remote}/landing/index.html" && test -f "${remote}/landing/releases/releases.json"`);
const copyServer = `scp ${sshKeyArg} -P ${sshPort} ${q(path.join(OUT, 'server.js'))} ${q(path.join(OUT, '.env.example'))} ${deployHost}:${remote}/`;
const hashCmd = sshCmd(`sha256sum ${remote}/server.js`);
const restartCmd = sshCmd(
  `chown -R ${pm2User}:${pm2User} ${remote}/landing ${remote}/server.js ${remote}/.env.example` +
  ` && runuser -u ${pm2User} -- pm2 restart ${pm2App} --update-env >/dev/null` +
  ` && sleep 2 && curl -fsS --max-time 5 ${healthUrl}`
);

if (staticOnly) {
  console.log('\nStatic-only deploy plan:');
  console.log('  1. ' + staticPreflightCmd);
  console.log('  2. ' + copyLanding);
  console.log('  3. ' + staticVerifyCmd);

  if (dryRun) {
    ok(`dry-run mode — nothing executed (target ${deployHost}:${remote}/landing)`);
  } else {
    try {
      run(staticPreflightCmd);
      run(copyLanding);
      run(staticVerifyCmd);
      ok(`Static landing uploaded to ${deployHost}:${remote}/landing; backend was not changed`);
    } catch (e) {
      fail('Static-only deploy failed: ' + e.message);
    }
  }
} else if (!deployFlag) {
  console.log('\nBundle ready. To deploy manually:');
  console.log(`  scp -r ${q(path.join(OUT, 'landing'))} <user@host>:${remote}/`);
  console.log(`  scp ${q(path.join(OUT, 'server.js'))} <user@host>:${remote}/`);
  console.log(`  ssh <user@host> "runuser -u ${pm2User} -- pm2 restart ${pm2App} --update-env"`);
  console.log('\nOr run: node scripts/publish-landing.js --deploy <user@host>');
} else if (!deployHost) {
  fail('--deploy requires a host argument (user@host) or LANDING_HOST env');
} else {
  console.log('\nDeploy plan:');
  console.log('  1. ' + copyLanding);
  console.log('  2. ' + copyServer);
  console.log('  3. ' + hashCmd);
  console.log('  4. ' + restartCmd);

  if (deployHost === 'dry-run') {
    ok('dry-run mode — nothing executed');
  } else {
    try {
      run(copyLanding);
      run(copyServer);

      // Fail before restarting if the host is not running the code we just sent.
      const localHash = createHash('sha256').update(fs.readFileSync(path.join(OUT, 'server.js'))).digest('hex');
      const remoteHash = String(execSync(hashCmd, { encoding: 'utf8' })).trim().split(/\s+/)[0];
      if (remoteHash !== localHash) {
        fail(`server.js on host does not match the bundle (local ${localHash.slice(0, 12)}… remote ${remoteHash.slice(0, 12)}…)`);
      }
      ok(`server.js uploaded and verified (sha256 ${localHash.slice(0, 12)}…)`);

      run(restartCmd);
      ok(`pm2 "${pm2App}" restarted as ${pm2User}; ${healthUrl} answered`);
    } catch (e) {
      fail('Deploy failed: ' + e.message);
    }
  }
}
