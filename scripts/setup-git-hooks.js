#!/usr/bin/env node
/**
 * setup-git-hooks.js — installs the repo-local `pre-commit` git hook.
 *
 * Runs automatically via the `prepare` npm script (after `npm install`),
 * so every developer gets the secret-scanning hook without manual setup.
 *
 * The hook is written to `.git/hooks/pre-commit` (the standard location)
 * and simply calls `node scripts/check-secrets.js` with the list of staged
 * files. It is a no-op if `node` is unavailable.
 *
 * This does NOT touch `core.hooksPath` (which would affect every repo on
 * the machine) — it only writes into this repo's `.git/hooks/`.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Find the git directory (handles submodules / worktrees).
function gitDir() {
  try {
    return execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return null;
  }
}

const HOOK_CONTENT = `#!/usr/bin/env sh
# Installed by scripts/setup-git-hooks.js (do not edit manually).
# Scans staged files for secrets before commit. See scripts/check-secrets.js.
set -e
files=$(git diff --cached --name-only --diff-filter=ACM)
if [ -z "$files" ]; then
  exit 0
fi
# Only feed text-ish files (skip binaries that gitleaks/regex would choke on).
files=$(printf '%s\\n' $files | grep -Ev '\\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp4|mp3|pdf|zip|gz|jar|jks|keystore|class|bin|exe|so|dll)$' || true)
if [ -z "$files" ]; then
  exit 0
fi
echo "Running secret scan on staged files..."
node scripts/check-secrets.js $files
`;

function main() {
  const dir = gitDir();
  if (!dir) {
    // Not in a git repo (e.g. CI artifact). Nothing to install.
    return;
  }
  // git rev-parse may return a relative path like ".git" or an absolute one.
  const hookPath = dir.startsWith('.git') ? join(ROOT, dir, 'hooks', 'pre-commit') : join(dir, 'hooks', 'pre-commit');
  const hooksDir = join(hookPath, '..');
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
  const marker = 'Installed by scripts/setup-git-hooks.js';
  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf8');
    if (existing.includes(marker)) return; // already installed
  }
  writeFileSync(hookPath, HOOK_CONTENT, { mode: 0o755 });
  console.log(`✅ Installed git pre-commit secret-scanning hook: ${hookPath}`);
}

main();
