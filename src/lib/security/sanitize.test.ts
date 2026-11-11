import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeText, sanitizeHtml } from './sanitize';

describe('sanitize', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  it('escapes quotes and backticks', () => {
    expect(escapeHtml(`"'&<>`)).toBe('&quot;&#39;&amp;&lt;&gt;');
  });

  it('sanitizeText handles null/undefined', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText('')).toBe('');
  });

  it('sanitizeHtml with allowTags=false escapes everything', () => {
    expect(sanitizeHtml('<b>bold</b>', { allowTags: false })).toBe(
      '&lt;b&gt;bold&lt;&#x2F;b&gt;'
    );
  });

  it('sanitizeHtml with allowTags=true allows safe tags', () => {
    const result = sanitizeHtml('<b>bold</b> <code>code</code>', { allowTags: true });
    expect(result).toContain('<b>');
    expect(result).toContain('<code>');
    expect(result).toContain('</code>');
  });
});
