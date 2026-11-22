/**
 * Minimal markdown-to-React renderer for chat messages.
 *
 * Supported syntax:
 *   **bold**   -> <strong>
 *   *italic*   -> <em>
 *   `code`     -> <code>
 *   ~~strike~~ -> <del>
 *   > quote    -> <blockquote>
 *   [text](url)-> <a>
 *   ## header  -> <h2> / <h3>
 *   - item     -> <ul><li>
 *
 * HTML tags (safe subset): <b>, <strong>, <i>, <em>, <u>, <code>, <a href>, <br>, <p>
 *
 * HTML escaping is handled automatically by React JSX text nodes (no
 * double-escaping).
 */

import React, { ReactNode } from 'react';
import { toSafeExternalUrl } from './security/safeUrl';

const ALLOWED_HTML_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'code', 'a', 'br', 'p']);
const ALLOWED_HTML_ATTRS = new Set(['href']);

function sanitizeHtml(html: string): string {
  return html
    .replace(/<\/?([a-z]+)[^>]*>/gi, (match, tagName) => {
      const lowerTag = tagName.toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(lowerTag)) {
        return match
          .replace(/</g, '<')
          .replace(/>/g, '>');
      }
      if (lowerTag === 'a') {
        const hrefMatch = match.match(/href\s*=\s*["']([^"']+)["']/i);
        const href = hrefMatch ? toSafeExternalUrl(hrefMatch[1]) : null;
        if (!href) return `<a>`;
        return `<a href="${href}">`;
      }
      return match;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p\s*>/gi, '\n\n')
    .replace(/<\/p>/gi, '');
}

/** Process allowed HTML tags within text and convert to React elements. */
function processHtmlInText(text: string, opts: { onLinkPress?: (url: string) => void }, keyBase: string): ReactNode {
  const parts: ReactNode[] = [];
  let remaining = text;
  let index = 0;

  while (remaining.length > 0) {
    const tagMatch = remaining.match(/^<\/?([a-z]+)[^>]*>/i);
    if (!tagMatch) {
      const nextTag = remaining.indexOf('<');
      const text = nextTag === -1 ? remaining : remaining.slice(0, nextTag);
      if (text) {
        parts.push(<span key={`${keyBase}-txt-${index++}`}>{renderInline(text, opts, `${keyBase}-txt-${index}`)}</span>);
      }
      remaining = remaining.slice(text.length);
      continue;
    }

    const fullMatch = tagMatch[0];
    const tagName = tagMatch[1].toLowerCase();
    const isClosing = fullMatch.startsWith('</');
    const isSelfClosing = fullMatch.endsWith('/>');

    if (!ALLOWED_HTML_TAGS.has(tagName)) {
      parts.push(<span key={`${keyBase}-txt-${index++}`}>{fullMatch.replace(/</g, '<').replace(/>/g, '>')}</span>);
      remaining = remaining.slice(fullMatch.length);
      continue;
    }

    if (isClosing || isSelfClosing || tagName === 'br') {
      if (tagName === 'br') {
        parts.push(<br key={`${keyBase}-br-${index++}`} />);
      }
      remaining = remaining.slice(fullMatch.length);
      continue;
    }

    let props: Record<string, string> = {};
    if (tagName === 'a') {
      const hrefMatch = fullMatch.match(/href\s*=\s*["']([^"']+)["']/i);
      const href = hrefMatch ? toSafeExternalUrl(hrefMatch[1]) : null;
      if (href) props.href = href;
    }

    // Find the closing tag
    const closeTag = `</${tagName}>`;
    const closeIndex = remaining.indexOf(closeTag);
    if (closeIndex === -1) {
      // No closing tag, treat as text
      parts.push(<span key={`${keyBase}-txt-${index++}`}>{fullMatch.replace(/</g, '<').replace(/>/g, '>')}</span>);
      remaining = remaining.slice(fullMatch.length);
      continue;
    }

    const innerContent = remaining.slice(fullMatch.length, closeIndex);
    const beforeClose = remaining.slice(0, closeIndex + closeTag.length);
    remaining = remaining.slice(closeIndex + closeTag.length);

    let element: ReactNode;
    const processedInner = processHtmlInText(innerContent, opts, `${keyBase}-${tagName}-${index++}`);
    switch (tagName) {
      case 'b':
      case 'strong':
        element = <strong key={`${keyBase}-${tagName}-${index}`} className="font-bold">{processedInner}</strong>;
        break;
      case 'i':
      case 'em':
        element = <em key={`${keyBase}-${tagName}-${index}`} className="italic">{processedInner}</em>;
        break;
      case 'u':
        element = <u key={`${keyBase}-${tagName}-${index}`} className="underline">{processedInner}</u>;
        break;
      case 'code':
        element = (
          <code
            key={`${keyBase}-${tagName}-${index}`}
            className="bg-white/10 px-1 py-0.5 rounded text-[var(--nova-accent-color,#ff4e18)] text-xs font-mono"
          >
            {processedInner}
          </code>
        );
        break;
      case 'a':
        element = (
          <a
            key={`${keyBase}-${tagName}-${index}`}
            href={props.href}
            className="text-[var(--nova-accent-color,#ff4e18)] hover:underline underline underline-offset-2 hover:text-[var(--nova-accent-color,#ff5d2b)] transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            {processedInner}
          </a>
        );
        break;
      default:
        element = <span key={`${keyBase}-${tagName}-${index}`}>{processedInner}</span>;
    }
    parts.push(element);
  }

  return <>{parts}</>;
}

/** Splits text into segments separated by a delimiter pair (open/close). */
function splitByPair(
  text: string,
  open: string,
  close: string,
): Array<{ text: string; isMarked: boolean }> {
  const segments: Array<{ text: string; isMarked: boolean }> = [];
  let remaining = text;
  let marked = false;
  while (true) {
    const idx = remaining.indexOf(marked ? close : open);
    if (idx === -1) {
      segments.push({ text: remaining, isMarked: marked });
      break;
    }
    segments.push({ text: remaining.slice(0, idx), isMarked: marked });
    remaining = remaining.slice(idx + (marked ? close.length : open.length));
    marked = !marked;
  }
  return segments;
}

interface RenderMarkdownProps {
  text: string;
  onLinkPress?: (url: string) => void;
}

export function renderMarkdown({ text, onLinkPress }: RenderMarkdownProps): ReactNode {
  if (!text) return <></>;
  const sanitized = sanitizeHtml(text);
  // Process block-level markdown first (headers, lists, quotes, paragraphs)
  // Then within each block, process HTML tags and inline markdown
  const opts = { onLinkPress };
  const lines = sanitized.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listKeyBase = '';

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={listKeyBase} className="my-2 pl-6 space-y-1 list-disc">
          {listItems}
        </ul>
      );
      listItems = [];
      listKeyBase = '';
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith('> ')) {
      flushList();
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-2 border-[var(--nova-accent-color,#ff4e18)] pl-3 py-1 my-2 italic text-white/70"
        >
          {processHtmlInText(trimmed.slice(2), opts, `bq-inner-${i}`)}
        </blockquote>
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      blocks.push(
        <h3
          key={`h3-${i}`}
          className="text-lg font-bold text-[var(--text-primary)] my-2"
        >
          {processHtmlInText(trimmed.slice(4), opts, `h3-inner-${i}`)}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      blocks.push(
        <h2
          key={`h2-${i}`}
          className="text-xl font-bold text-[var(--text-primary)] my-2"
        >
          {processHtmlInText(trimmed.slice(3), opts, `h2-inner-${i}`)}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      blocks.push(
        <h1
          key={`h1-${i}`}
          className="text-2xl font-bold text-[var(--text-primary)] my-2"
        >
          {processHtmlInText(trimmed.slice(2), opts, `h1-inner-${i}`)}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('- ')) {
      if (!listKeyBase) listKeyBase = `ul-${i}`;
      listItems.push(
        <li
          key={`li-${i}`}
          className="my-1 pl-4 text-[var(--text-primary)]"
        >
          {processHtmlInText(trimmed.slice(2), opts, `li-inner-${i}`)}
        </li>
      );
      return;
    }

    flushList();
    blocks.push(
      <p key={`p-${i}`} className={`my-2 ${indent > 0 ? 'pl-4' : ''}`}>
        {processHtmlInText(line, opts, `p-inner-${i}`)}
      </p>
    );
  });

  flushList();

  return <>{blocks}</>;
}

/**
 * Inline formatting only: code, bold, italic, strikethrough.
 */
function renderInline(
  text: string,
  opts: { onLinkPress?: (url: string) => void },
  keyBase: string,
): React.ReactNode {
  const codeParts = splitByPair(text, '`', '`');
  return (
    <>
      {codeParts.map((seg, i) => {
        if (!seg.isMarked) {
          return (
            <React.Fragment key={`${keyBase}-c-${i}`}>
              {renderEmphasis(seg.text, opts, `${keyBase}-c-${i}`)}
            </React.Fragment>
          );
        }
        return (
          <code
            key={`${keyBase}-code-${i}`}
            className="bg-white/10 px-1 py-0.5 rounded text-[var(--nova-accent-color,#ff4e18)] text-xs font-mono"
          >
            {seg.text}
          </code>
        );
      })}
    </>
  );
}

function renderEmphasis(
  text: string,
  opts: { onLinkPress?: (url: string) => void },
  keyBase: string,
): React.ReactNode {
  const boldParts = splitByPair(text, '**', '**');
  return (
    <>
      {boldParts.map((seg, i) => {
        if (!seg.isMarked) {
          return (
            <React.Fragment key={`${keyBase}-b-${i}`}>
              {renderItalic(seg.text, opts, `${keyBase}-b-${i}`)}
            </React.Fragment>
          );
        }
        return (
          <strong
            key={`${keyBase}-strong-${i}`}
            className="font-bold"
          >
            {renderItalic(seg.text, opts, `${keyBase}-b-inner-${i}`)}
          </strong>
        );
      })}
    </>
  );
}

function renderItalic(
  text: string,
  opts: { onLinkPress?: (url: string) => void },
  keyBase: string,
): React.ReactNode {
  const italicParts = splitByPair(text, '*', '*');
  return (
    <>
      {italicParts.map((seg, i) => {
        if (!seg.isMarked) {
          return (
            <React.Fragment key={`${keyBase}-i-${i}`}>
              {renderStrike(seg.text, opts, `${keyBase}-i-${i}`)}
            </React.Fragment>
          );
        }
        return (
          <em key={`${keyBase}-em-${i}`} className="italic">
            {renderStrike(seg.text, opts, `${keyBase}-i-inner-${i}`)}
          </em>
        );
      })}
    </>
  );
}

function renderStrike(
  text: string,
  opts: { onLinkPress?: (url: string) => void },
  keyBase: string,
): React.ReactNode {
  const strikeParts = splitByPair(text, '~~', '~~');
  return (
    <>
      {strikeParts.map((seg, i) => {
        if (!seg.isMarked) {
          // Leaf: render plain text (React auto-escapes)
          return <span key={`${keyBase}-plain-${i}`}>{seg.text}</span>;
        }
        // Inline context: strikethrough wraps inline formatting, never blocks.
        return (
          <del key={`${keyBase}-del-${i}`} className="line-through">
            {renderInline(seg.text, opts, `${keyBase}-s-inner-${i}`)}
          </del>
        );
      })}
    </>
  );
}

/**
 * Block-level rendering: quotes, headers, lists, paragraphs.
 * Calls renderInline for inline formatting within each line.
 */
function renderBlocks(
  text: string,
  opts: { onLinkPress?: (url: string) => void },
  keyBase: string,
): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listKeyBase = '';

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={listKeyBase} className="my-2 pl-6 space-y-1 list-disc">
          {listItems}
        </ul>
      );
      listItems = [];
      listKeyBase = '';
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith('> ')) {
      flushList();
      blocks.push(
        <blockquote
          key={`${keyBase}-bq-${i}`}
          className="border-l-2 border-[var(--nova-accent-color,#ff4e18)] pl-3 py-1 my-2 italic text-white/70"
        >
          {renderInline(trimmed.slice(2), opts, `${keyBase}-bq-inner-${i}`)}
        </blockquote>
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      blocks.push(
        <h3
          key={`${keyBase}-h3-${i}`}
          className="text-lg font-bold text-[var(--text-primary)] my-2"
        >
          {renderInline(trimmed.slice(4), opts, `${keyBase}-h3-inner-${i}`)}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      blocks.push(
        <h2
          key={`${keyBase}-h2-${i}`}
          className="text-xl font-bold text-[var(--text-primary)] my-2"
        >
          {renderInline(trimmed.slice(3), opts, `${keyBase}-h2-inner-${i}`)}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      blocks.push(
        <h1
          key={`${keyBase}-h1-${i}`}
          className="text-2xl font-bold text-[var(--text-primary)] my-2"
        >
          {renderInline(trimmed.slice(2), opts, `${keyBase}-h1-inner-${i}`)}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('- ')) {
      if (!listKeyBase) listKeyBase = `${keyBase}-ul-${i}`;
      listItems.push(
        <li
          key={`${keyBase}-li-${i}`}
          className="my-1 pl-4 text-[var(--text-primary)]"
        >
          {renderInline(trimmed.slice(2), opts, `${keyBase}-li-inner-${i}`)}
        </li>
      );
      return;
    }

    flushList();
    blocks.push(
      <p key={`${keyBase}-p-${i}`} className={`my-2 ${indent > 0 ? 'pl-4' : ''}`}>
        {renderInline(line, opts, `${keyBase}-p-inner-${i}`)}
      </p>
    );
  });

  flushList();

  return <>{blocks}</>;
}