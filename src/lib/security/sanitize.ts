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
  'b',
  'i',
  'em',
  'strong',
  'u',
  'br',
  'p',
  'span',
  'a',
  'code',
]);

export function sanitizeHtml(html: string, options: SanitizedHtmlOptions = {}): string {
  if (!options.allowTags) {
    return escapeHtml(html);
  }
  return html.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, rawTagName: string) => {
    const tagName = rawTagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) return escapeHtml(tag);
    return tag.startsWith('</') ? `</${tagName}>` : `<${tagName}>`;
  });
}

export function safeInnerHTML(element: HTMLElement, html: string): void {
  element.textContent = sanitizeText(html);
}

export function createSafeText(text: string): Text {
  return document.createTextNode(escapeHtml(text));
}
