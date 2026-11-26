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

const files = walk('src').filter(f => {
  const c = fs.readFileSync(f, 'utf8');
  return c.includes("from '@tabler/icons-react'");
});

let fixed = 0;

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const original = c;

  c = c.replace(
    /(import\s*\{)([^}]*)(\} from '@tabler\/icons-react'?)/g,
    (match, open, names, close) => {
      const newNames = names.split(',').map(n => {
        n = n.trim();
        if (!n) return n;
        // Убрать " as X" alias, оставить только имя (с или без Icon префикса)
        const base = n.replace(/\s+as\s+\w+$/, '').trim();
        return base;
      }).join(', ');
      return open + newNames + close;
    }
  );

  if (c !== original) {
    fs.writeFileSync(f, c, 'utf8');
    fixed++;
  }
}

console.log('Restored imports in:', fixed, 'files');
