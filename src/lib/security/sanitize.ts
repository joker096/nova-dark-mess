import DOMPurify from 'dompurify';

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

const ALLOWED_TAGS = [
  'b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'a', 'code',
];

export function sanitizeHtml(html: string, options: SanitizedHtmlOptions = {}): string {
  if (!options.allowTags) {
    return escapeHtml(html);
  }
  // Use DOMPurify for robust HTML sanitization with allow-list
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [], // No attributes allowed for safety
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

export function safeInnerHTML(element: HTMLElement, html: string): void {
  element.textContent = sanitizeText(html);
}

export function createSafeText(text: string): Text {
  return document.createTextNode(escapeHtml(text));
}
