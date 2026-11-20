#!/usr/bin/env node
/**
 * check-secrets.js — lightweight secret scanner for the pre-commit hook.
 *
 * Strategy:
 *   1. If the `gitleaks` binary is available, run it on the staged files
 *      (the authoritative scanner, same config as CI).
 *   2. Otherwise fall back to a built-in regex check for common secret
 *      patterns (private keys, AWS/GitHub tokens, long base64/hex blobs,
 *      known project-specific leaks) over the staged files.
 *
 * The hook invokes this with the list of staged, text-only files. Exit 0 =
 * clean, exit 1 = a potential secret was found (commit blocked).
 *
 * NOTE: This is a convenience second line of defense. CI still runs
 * gitleaks (see .github/workflows/ci.yml) and is the authoritative gate.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GITLEAKS_CONFIG = resolve(ROOT, '.gitleaks.toml');

/** Files we never scan for secrets (generated, allowlisted, or docs). */
const SKIP_PATH_RE = /(^|\/)(node_modules|dist|build|coverage|\.git|\.open-mem|\.e2e)\//;
const SKIP_EXACT_RE = /^\.env\.example$/;
const SKIP_FILE_RE = /(^|\/)(Cargo\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const ALLOWED_BLOB_RE = /^(A{16,}=?|ABCDEFGHJKLMNPQRSTUVWXYZ23456789)$/;

// Built-in patterns (fallback only). Keep these conservative: they are
// matched against *staged file contents* and only flag when a file is also
// NOT in the allowlist path set above.
const PATTERN_RULES = [
  {
    id: 'private-key',
    re: /-----BEGIN (RSA|OPENSSH|PGP|EC|DSA) PRIVATE KEY-----/i,
    hint: 'private key material',
  },
  {
    id: 'aws-access-key-id',
    re: /\bAKIA[0-9Z]{16}\b|\bAKIA[0-9A-Z]{16}\b/i,
    hint: 'AWS Access Key ID',
  },
  {
    id: 'github-token',
    re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/i,
    hint: 'GitHub token',
  },
  {
    id: 'slack-token',
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/i,
    hint: 'Slack token',
  },
  {
    id: 'cloudflare-token',
    re: /\bcfut_[A-Za-z0-9]{20,}\b/i,
    hint: 'Cloudflare API token',
  },
  {
    id: 'paymento-api-key',
    re: /PAYMENTO_(API_KEY|SECRET_KEY)\s*=\s*["']?[A-Za-z0-9+/=]{24,}["']?/i,
    hint: 'PaymentO API key / secret (should be a placeholder or empty)',
  },
  {
    id: 'android-keystore-password-literal',
    re: /\b(KeystorePassword|KeyPassword)\s*=\s*'[^']+.{16,}'/i,
    hint: 'hardcoded keystore/key password literal in a script',
  },
  // High-entropy base64-looking blob (>= 32 chars, mixed case + digits, no spaces)
  {
    id: 'high-entropy-blob',
    re: /["']([A-Za-z0-9+\/=]{32,})["']/,
    hint: 'long high-entropy token-like string',
  },
];

function isAllowedPath(p) {
  if (SKIP_PATH_RE.test(p)) return true;
  if (SKIP_EXACT_RE.test(p)) return true;
  if (SKIP_FILE_RE.test(p)) return true;
  // Standard test-vector files are allowlisted to match gitleaks config.
  if (p.endsWith('.test.ts') && p.includes('src/lib/crypto')) return true;
  if (p.startsWith('src/test/')) return true;
  // Gateway tsconfig.json contains only normal TS config values flagged as
  // false positives by the high-entropy-blob fallback rule.
  if (p === 'packages/gateway/tsconfig.json') return true;
  return false;
}

// ---------------------------------------------------------------------------
// gitleaks binary resolution:
//   1. `gitleaks` on PATH (global install).
//   2. A vendored copy under tools/gitleaks/gitleaks[-.exe] (auto-downloaded
//      once from the official GitHub release, then reused).
// Returns a string (path to the binary) or null if unavailable.
// ---------------------------------------------------------------------------
const TOOLS_DIR = join(ROOT, 'tools', 'gitleaks');

function platformArch() {
  const p = platform();
  const a = process.arch; // 'x64' | 'arm64'
  if (p === 'win32') return a === 'arm64' ? 'windows_arm64' : 'windows_amd64';
  if (p === 'darwin') return a === 'arm64' ? 'darwin_arm64' : 'darwin_amd64';
  // linux
  return a === 'arm64' ? 'linux_arm64' : 'linux_amd64';
}

/**
 * Download the official gitleaks binary (latest release) into TOOLS_DIR.
 * Best-effort: on any network/IO error, return null and let the fallback
 * regex scanner run.
 */
function downloadGitleaks() {
  const tag = process.env.GITLEAKS_VERSION || 'v8.18.4';
  const target = platformArch();
  // gitleaks release asset names: gitleaks_v8.18.4_windows_amd64.exe, etc.
  const assetExt = platform() === 'win32' ? '.exe' : '';
  const file = `gitleaks_${tag}_${target}${assetExt}`;
  const url = `https://github.com/gitleaks/gitleaks/releases/download/${tag}/${file}`;
  const dest = join(TOOLS_DIR, platform() === 'win32' ? 'gitleaks.exe' : 'gitleaks');
  if (existsSync(dest)) return dest;
  try {
    mkdirSync(TOOLS_DIR, { recursive: true });
    console.log(`⬇  check-secrets: downloading gitleaks ${tag} for ${target}…`);
    return downloadSync(url, dest);
  } catch (err) {
    console.warn(`   (download failed: ${err.message})`);
    return null;
  }
}

/** Synchronous download using spawnSync of the bundled `node` fetch helper. */
function downloadSync(url, dest) {
  // Node's fetch is async; bridge to sync via a child process that writes the file.
  const helper = `
    (async () => {
      const r = await fetch(${JSON.stringify(url)});
      if (!r.ok) { console.error('HTTP ' + r.status); process.exit(1); }
      const fs = require('fs');
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(${JSON.stringify(dest)}, buf);
    })().catch(e => { console.error(e.message); process.exit(1); });
  `;
  const res = spawnSync(process.execPath, ['-e', helper], { stdio: 'inherit' });
  return res.status === 0 ? dest : null;
}

function resolveGitleaks() {
  // 1. PATH
  try {
    execFileSync('gitleaks', ['--version'], { stdio: 'ignore' });
    return 'gitleaks';
  } catch { /* not on PATH */ }

  // 2. Vendored (auto-downloaded)
  const vendored = join(TOOLS_DIR, platform() === 'win32' ? 'gitleaks.exe' : 'gitleaks');
  if (existsSync(vendored)) return vendored;

  // 3. Try to download once.
  const downloaded = downloadGitleaks();
  return downloaded && existsSync(downloaded) ? downloaded : null;
}

function runGitleaks(gitleaksBin, _files) {
  const args = ['detect', '--no-git', '--source', '.', '--config', GITLEAKS_CONFIG, '--exit-code', '1'];
  try {
    execFileSync(gitleaksBin, args, { stdio: 'pipe', cwd: ROOT });
    return { ok: true, output: '' };
  } catch (err) {
    return { ok: false, output: (err.stdout || '') + (err.stderr || '') };
  }
}

function runFallback(files) {
  const findings = [];
  for (const f of files) {
    if (isAllowedPath(f)) continue;
    const abs = resolve(ROOT, f);
    if (!existsSync(abs)) continue;
    let content;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue; // binary / unreadable
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lines that are clearly placeholders.
      if (/CHANGE_ME/.test(line)) continue;
      for (const rule of PATTERN_RULES) {
        const m = rule.re.exec(line);
        if (m && rule.id === 'high-entropy-blob' && ALLOWED_BLOB_RE.test(m[1])) continue;
        if (m) {
          findings.push({
            file: f,
            line: i + 1,
            rule: rule.id,
            hint: rule.hint,
            snippet: line.trim().slice(0, 120),
          });
        }
      }
    }
  }
  return { ok: findings.length === 0, findings };
}

function main() {
  // Files are passed as argv[2..] (relative to repo root).
  const files = process.argv.slice(2).filter((f) => f && f !== 'stub');
  if (files.length === 0) return; // nothing staged

  const scannable = files.filter((f) => !isAllowedPath(f));
  if (scannable.length === 0) {
    console.log('✅ check-secrets: no files to scan (all allowlisted).');
    return;
  }

  const gitleaks = resolveGitleaks();
  if (gitleaks) {
    console.log('🔎 check-secrets: using gitleaks (authoritative).');
    const r = runGitleaks(gitleaks, scannable);
    if (!r.ok) {
      console.error('\n❌ check-secrets: gitleaks found potential secrets:\n');
      console.error(r.output);
      console.error('\nAdd the file to .gitleaks.toml allowlist if this is a false positive.');
      process.exit(1);
    }
    console.log('✅ check-secrets: gitleaks clean.');
    return;
  }

  console.log('🔎 check-secrets: gitleaks not installed — using built-in fallback patterns.');
  const r = runFallback(scannable);
  if (!r.ok) {
    console.error('\n❌ check-secrets: potential secrets detected:\n');
    for (const f of r.findings) {
      console.error(`  • ${f.file}:${f.line}  [${f.rule}] ${f.hint}`);
      console.error(`    ${f.snippet}`);
    }
    console.error('\nFix the above, or if this is a false positive, allowlist it in .gitleaks.toml.');
    console.error('(Install gitleaks locally for the authoritative scan: https://gitleaks.io/)');
    process.exit(1);
  }
  console.log('✅ check-secrets: clean (fallback patterns).');
}

main();
