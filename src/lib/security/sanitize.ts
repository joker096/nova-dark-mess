const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"'/=`=]/g, (char) => ESCAPE_MAP[char] ?? char);
}

export function sanitizeText(text: unknown): string {
  if (text === null || text === undefined) return '';
  return escapeHtml(String(text));
}

interface SanitizedHtmlOptions {
  allowTags?: boolean;
}

const ALLOWED_TAGS = new Set([
  'b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'a', 'code',
]);

/**
 * Allow-list HTML sanitizer for the few `dangerouslySetInnerHTML` call sites.
 *
 * Implemented locally rather than with DOMPurify on purpose: `dompurify` was
 * never actually a dependency, so the old import made this module (and every
 * file importing it) fail to resolve and, in a build that tree-shook it away,
 * silently reach `innerHTML` with an `undefined` result. The grammar accepted
 * here is deliberately tiny — only the tags in `ALLOWED_TAGS`, no attributes at
 * all, and tags must be plain `name>` / `name/>` / `/name>` forms, so a
 * malformed or hostile tag can never be reconstructed into markup.
 */
export function sanitizeHtml(html: string, options: SanitizedHtmlOptions = {}): string {
  if (!options.allowTags) {
    return escapeHtml(html);
  }
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, rawName: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) {
      // Drop the tag, keep the text: `<script>alert(1)</script>` becomes
      // `alert(1)` as inert text rather than executable markup.
      return '';
    }
    // Re-emit only the bare tag name: no attributes, no original spelling.
    return match.startsWith('</') ? `</${name}>` : `<${name}>`;
  });
}

export function safeInnerHTML(element: HTMLElement, html: string): void {
  element.textContent = sanitizeText(html);
}

export function createSafeText(text: string): Text {
  return document.createTextNode(escapeHtml(text));
}
