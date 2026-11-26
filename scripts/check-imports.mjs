import fs from 'fs';
import path from 'path';
import * as tablerIcons from '@tabler/icons-react';

const available = new Set(Object.keys(tablerIcons));

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

const lucideNames = new Set();

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
          if (clean) lucideNames.add(clean);
        });
      }
    }
  }
}

const missing = [];
const exists = [];
for (const name of [...lucideNames].sort()) {
  const iconName = 'Icon' + name;
  if (available.has(iconName)) {
    exists.push({ lucide: name, tabler: iconName });
  } else {
    missing.push(name);
  }
}

console.log('=== Exist in Tabler ===');
console.log(exists.map(e => '  Icon' + e.lucide + ' as ' + e.lucide).join(',\n'));
console.log('\n=== Missing (' + missing.length + ') ===');
console.log(missing.join('\n'));
console.log('\nTotal lucide names: ' + lucideNames.size);
