import { readFileSync } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(process.cwd(), 'src');

function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsxFiles(full));
    } else if (
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.tsx')
    ) {
      results.push(full);
    }
  }
  return results;
}

function findOpeningTagEnd(content: string, start: number): number {
  let quote: string | null = null;
  let braceDepth = 0;
  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      braceDepth += 1;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (ch === '>' && braceDepth === 0) return i;
  }
  return -1;
}

function audit(): boolean {
  const files = findTsxFiles(SRC_DIR);
  let hasErrors = false;

  const ariaLabelRegex = /aria-label\s*=/;
  const titleRegex = /title\s*=/;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    let searchIndex = 0;

    while (searchIndex < content.length) {
      const start = content.indexOf('<button', searchIndex);
      if (start === -1) break;
      const nextChar = content[start + '<button'.length];
      if (nextChar && /[A-Za-z0-9_-]/.test(nextChar)) {
        searchIndex = start + '<button'.length;
        continue;
      }
      const end = findOpeningTagEnd(content, start);
      if (end === -1) break;
      const buttonOpen = content.slice(start, end + 1);
      const lineNumCalc = (content.slice(0, start).match(/\n/g) || []).length + 1;

      const hasAriaLabel = ariaLabelRegex.test(buttonOpen);
      const hasTitle = titleRegex.test(buttonOpen);

      // Check if button has visible text content (not just icon)
      const closeTag = content.indexOf('</button>', end + 1);
      const innerContent = closeTag !== -1 ? content.substring(end + 1, closeTag) : '';
      const hasVisibleText = /[a-zа-яё0-9]/i.test(innerContent.replace(/<[^>]*>/g, ''));

      if (!hasAriaLabel && !hasTitle && !hasVisibleText) {
        console.error(`[D3] ${file}:${lineNumCalc} - Button without accessible label (aria-label, title, or text)`);
        hasErrors = true;
      }

      searchIndex = end + 1;
    }
  }

  if (hasErrors) {
    console.error('\nButton audit: FAILED');
    process.exit(1);
  }

  console.log(`Button audit: PASSED (${files.length} files checked)`);
  process.exit(0);
}

audit();
