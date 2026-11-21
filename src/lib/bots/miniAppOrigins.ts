/**
 * Mini App origin allowlist (Phase B7).
 *
 * `frame-src` cannot be derived per bot at runtime: a CSP policy is fixed for
 * the document and several policies only intersect. The product decision is
 * therefore an operator-controlled list of Mini App hosts, configured at build
 * time with `VITE_MINI_APP_ORIGINS=https://mini-apps.your-domain.com`. Each bot
 * gets a path under one of those origins (for example `/echo/`), not its own
 * host. There is no built-in domain: the operator must supply a host they
 * control, otherwise every remote Mini App is denied.
 *
 * With no configured origins the app refuses every remote Mini App and the
 * generated CSP keeps `frame-src 'self' blob:`.
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

/** Origins allowed to be framed, from the build environment. */
export const MINI_APP_ORIGINS: readonly string[] = parseMiniAppOrigins(
  import.meta.env.VITE_MINI_APP_ORIGINS,
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
