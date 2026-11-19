import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';
import { renderToString } from 'react-dom/server';

function renderToHtml(text: string): string {
  return renderToString(renderMarkdown({ text }));
}

describe('renderMarkdown', () => {
  it('escapes plain text', () => {
    const html = renderToHtml('hello <script>world</script>');
    expect(html).toContain('hello &lt;script&gt;world&lt;/script&gt;');
  });

  it('renders bold **text**', () => {
    const html = renderToHtml('**bold**');
    expect(html).toContain('<strong');
    expect(html).toContain('bold');
  });

  it('renders italic *text*', () => {
    const html = renderToHtml('*italic*');
    expect(html).toContain('<em');
    expect(html).toContain('italic');
  });

  it('renders code `text`', () => {
    const html = renderToHtml('`code`');
    expect(html).toContain('<code');
    expect(html).toContain('code');
  });

  it('renders strikethrough ~~text~~', () => {
    const html = renderToHtml('~~strike~~');
    expect(html).toContain('<del');
    expect(html).toContain('strike');
  });

  it('renders links [text](url)', () => {
    const html = renderToHtml('[link](https://example.com)');
    expect(html).toContain('https://example.com');
    expect(html).toContain('link');
  });

  it('renders blockquote > text', () => {
    const html = renderToHtml('> quote');
    expect(html).toContain('quote');
  });

  it('renders headers # text', () => {
    const html = renderToHtml('# Header');
    expect(html).toContain('<h1');
    expect(html).toContain('Header');
  });

  it('renders list - item', () => {
    const html = renderToHtml('- item');
    expect(html).toContain('<li');
    expect(html).toContain('item');
  });

  it('combines multiple formats', () => {
    const html = renderToHtml('**bold** and *italic* and `code`');
    expect(html).toContain('bold');
    expect(html).toContain('italic');
    expect(html).toContain('code');
  });

  it('handles empty string', () => {
    const html = renderToHtml('');
    expect(html).toBeDefined();
  });
});
