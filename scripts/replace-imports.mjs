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
let count = 0;
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const nc = c.replace(/from 'lucide-react'/g, "from '@tabler/icons-react'");
  if (nc !== c) {
    fs.writeFileSync(f, nc, 'utf8');
    count++;
  }
}
console.log('Updated files:', count);
