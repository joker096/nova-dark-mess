import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walk(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) results.push(full);
  }
  return results;
}

const files = walk('src');
const names = new Set();
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("from '@tabler/icons-react'")) {
      let block = lines[i];
      let j = i;
      while (!block.includes(';') && j < lines.length - 1) {
        j++;
        block += lines[j];
      }
      const inner = block.match(/\{([^}]*)\}/);
      if (inner) {
        inner[1].split(',').forEach(n => {
          const clean = n.trim().replace(/\s+as\s+\w+/, '').trim();
          if (clean) names.add(clean);
        });
      }
    }
  }
}
console.log([...names].sort().join('\n'));
console.log('--- total:', names.size);
