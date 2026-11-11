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
    } else if (entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

function audit(): boolean {
  const files = findTsxFiles(SRC_DIR);
  let hasErrors = false;

  const buttonRegex = /<button\b([^>]*)>/g;
  const ariaLabelRegex = /aria-label\s*=/;
  const titleRegex = /title\s*=/;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    let match: RegExpExecArray | null;
    let lineNum = 1;

    // Track line numbers
    const lines = content.split('\n');

    buttonRegex.lastIndex = 0;
    while ((match = buttonRegex.exec(content)) !== null) {
      const buttonOpen = match[0];
      const beforeButton = content.substring(0, match.index);
      const lineNumCalc = (beforeButton.match(/\n/g) || []).length + 1;

      const hasAriaLabel = ariaLabelRegex.test(buttonOpen);
      const hasTitle = titleRegex.test(buttonOpen);
      const hasIconOnlyContent = /<button[^>]*>\s*<\w+[^>]*\/>\s*<\/button>/s.test(content.substring(match.index, match.index + 200));

      // Check if button has visible text content (not just icon)
      const closeTag = content.indexOf('</button>', match.index);
      const innerContent = closeTag !== -1 ? content.substring(match.index + match[0].length, closeTag) : '';
      const hasVisibleText = /[a-zа-яё0-9]/i.test(innerContent.replace(/<[^>]*>/g, ''));

      if (!hasAriaLabel && !hasTitle && !hasVisibleText) {
        console.error(`[D3] ${file}:${lineNumCalc} - Button without accessible label (aria-label, title, or text)`);
        hasErrors = true;
      }
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
