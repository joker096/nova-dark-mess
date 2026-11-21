/**
 * Mini App origin allowlist (Phase B7).
 *
 * `frame-src` cannot be derived per bot at runtime: a CSP policy is fixed for
 * the document and several policies only intersect. The product decision is
 * therefore an operator-controlled list of Mini App hosts, configured at build
 * time with `VITE_MINI_APP_ORIGINS=https://mess.cvr.name`. Each bot
 * gets a path under one of those origins (for example `/mini-apps/echo/`), not
 * its own host. This deployment defaults to `https://mess.cvr.name` (the app's
 * landing host); an operator can override it with the env variable, and an
 * explicitly empty value means "deny every remote Mini App".
 */

/** Normalize a configured origin; returns null for anything but http(s). */
export function normalizeMiniAppOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseMiniAppOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const origins = raw
    .split(',')
    .map(normalizeMiniAppOrigin)
    .filter((origin): origin is string => Boolean(origin));
  return [...new Set(origins)];
}

/** Deployment default: the landing host, overridable via the build env. */
export const DEFAULT_MINI_APP_ORIGIN = 'https://mess.cvr.name';

/** Origins allowed to be framed, from the build environment. */
export const MINI_APP_ORIGINS: readonly string[] = parseMiniAppOrigins(
  import.meta.env.VITE_MINI_APP_ORIGINS ?? DEFAULT_MINI_APP_ORIGIN,
);

/** True only for an http(s) URL whose exact origin is allowlisted. */
export function isAllowedMiniAppUrl(
  raw: string,
  origins: readonly string[] = MINI_APP_ORIGINS,
): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return origins.includes(url.origin);
}
