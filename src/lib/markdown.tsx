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
 * HTML escaping is handled automatically by React JSX text nodes (no
 * double-escaping).
 */

import React, { ReactNode } from 'react';

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
  // Links: [text](url) — processed first on raw text
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: Array<string | { type: 'link'; text: string; url: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ type: 'link', text: match[1], url: match[2] });
    lastIndex = linkRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === 'string') {
          return renderBlocks(part, { onLinkPress }, `p-${i}`);
        }
        return (
          <a
            key={`link-${i}`}
            href={part.url}
            onClick={(e) => {
              e.preventDefault();
              void onLinkPress?.(part.url);
            }}
            className="text-[var(--nova-accent-color,#ff4e18)] hover:underline underline underline-offset-2 hover:text-[var(--nova-accent-color,#ff5d2b)] transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            {renderInline(part.text, { onLinkPress }, `link-inner-${i}`)}
          </a>
        );
      })}
    </>
  );
}

/**
 * Inline formatting only: code, bold, italic, strikethrough.
 */
function renderInline(
  text: string,
  opts: { onLinkPress?: (url: string) => void },
  keyBase: string,
): ReactNode {
  const codeParts = splitByPair(text, '`', '`');
  return (
    <>
      {codeParts.map((seg, i) => {
        if (!seg.isMarked) {
          return renderEmphasis(seg.text, opts, `${keyBase}-c-${i}`);
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
): ReactNode {
  const boldParts = splitByPair(text, '**', '**');
  return (
    <>
      {boldParts.map((seg, i) => {
        if (!seg.isMarked) {
          return renderItalic(seg.text, opts, `${keyBase}-b-${i}`);
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
): ReactNode {
  const italicParts = splitByPair(text, '*', '*');
  return (
    <>
      {italicParts.map((seg, i) => {
        if (!seg.isMarked) {
          return renderStrike(seg.text, opts, `${keyBase}-i-${i}`);
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
): ReactNode {
  const strikeParts = splitByPair(text, '~~', '~~');
  return (
    <>
      {strikeParts.map((seg, i) => {
        if (!seg.isMarked) {
          // Leaf: render plain text (React auto-escapes)
          return <span key={`${keyBase}-plain-${i}`}>{seg.text}</span>;
        }
        return (
          <del key={`${keyBase}-del-${i}`} className="line-through">
            {renderBlocks(seg.text, opts, `${keyBase}-s-inner-${i}`)}
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
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        const indent = line.length - trimmed.length;

        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={`${keyBase}-bq-${i}`}
              className="border-l-2 border-[var(--nova-accent-color,#ff4e18)] pl-3 py-1 my-2 italic text-white/70"
            >
              {renderInline(trimmed.slice(2), opts, `${keyBase}-bq-inner-${i}`)}
            </blockquote>
          );
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3
              key={`${keyBase}-h3-${i}`}
              className="text-lg font-bold text-white my-2"
            >
              {renderInline(trimmed.slice(4), opts, `${keyBase}-h3-inner-${i}`)}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2
              key={`${keyBase}-h2-${i}`}
              className="text-xl font-bold text-white my-2"
            >
              {renderInline(trimmed.slice(3), opts, `${keyBase}-h2-inner-${i}`)}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h1
              key={`${keyBase}-h1-${i}`}
              className="text-2xl font-bold text-white my-2"
            >
              {renderInline(trimmed.slice(2), opts, `${keyBase}-h1-inner-${i}`)}
            </h1>
          );
        }

        if (trimmed.startsWith('- ')) {
          return (
            <li
              key={`${keyBase}-li-${i}`}
              className="my-1 pl-4 text-white"
            >
              {renderInline(trimmed.slice(2), opts, `${keyBase}-li-inner-${i}`)}
            </li>
          );
        }

        return (
          <p key={`${keyBase}-p-${i}`} className={`my-2 ${indent > 0 ? 'pl-4' : ''}`}>
            {renderInline(line, opts, `${keyBase}-p-inner-${i}`)}
          </p>
        );
      })}
    </>
  );
}
