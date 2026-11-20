/**
 * URL-scheme allowlist for links that come from untrusted content: chat
 * markdown, bot inline buttons and ad campaigns.
 *
 * `javascript:`, `data:`, `file:` and `vbscript:` URLs must never reach an
 * `href` or `window.open`: in a webview a `javascript:` URL runs with the app
 * origin and would give a message sender script access to the vault UI.
 */

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Rejects control characters that browsers may ignore while parsing a scheme. */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Returns the normalized URL when its scheme is safe, otherwise null. */
export function toSafeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || hasControlCharacters(url)) return null;
  try {
    const parsed = new URL(url);
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSafeExternalUrl(value: unknown): value is string {
  return toSafeExternalUrl(value) !== null;
}

/**
 * MIME types that may be embedded in a `data:` download link. Active document
 * formats (HTML, SVG, XML) are coerced to `application/octet-stream`, which
 * only downloads and never executes in the app origin.
 */
const SAFE_DOWNLOAD_MIME = /^(image\/(png|jpeg|gif|webp|avif)|audio\/[a-z0-9.+-]+|video\/(mp4|webm|ogg)|text\/plain|application\/(pdf|zip|octet-stream))$/i;

export function sanitizeDownloadMime(value: unknown): string {
  if (typeof value !== 'string') return 'application/octet-stream';
  const mime = value.split(';')[0].trim();
  return SAFE_DOWNLOAD_MIME.test(mime) ? mime : 'application/octet-stream';
}
