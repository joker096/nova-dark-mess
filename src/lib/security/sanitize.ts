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

export function sanitizeHtml(html: string, options: SanitizedHtmlOptions = {}): string {
  if (!options.allowTags) {
    return escapeHtml(html);
  }
  const tagRegex = /<[^>]*>/g;
  return html.replace(tagRegex, (tag) => {
    const isClosing = tag.startsWith('</');
    const tagNameMatch = tag.match(/<\/?(\w+)/);
    const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';
    const allowed = ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'a', 'code'].includes(tagName);
    if (!allowed) return escapeHtml(tag);
    if (isClosing) return `</${tagName}>`;
    return tag;
  });
}

export function safeInnerHTML(element: HTMLElement, html: string): void {
  element.textContent = sanitizeText(html);
}

export function createSafeText(text: string): Text {
  return document.createTextNode(escapeHtml(text));
}
