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

let fixed = 0;

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const original = c;

  // Находим каждый блок импорта из @tabler/icons-react
  c = c.replace(
    /(import\s*\{)([^}]*)(\} from '@tabler\/icons-react'?)/g,
    (match, open, names, close) => {
      const newNames = names.split(',').map(n => {
        n = n.trim();
        if (!n) return n;

        // Уже есть alias?
        if (n.includes(' as ')) return n;

        // Убираем Icon префикс если есть, чтобы получить оригинальное имя
        let originalName = n;
        if (n.startsWith('Icon')) {
          originalName = n.slice(4);
        }

        // Если такого иконки нет в Tabler с Icon префиксом, пробуем без Icon
        const tablerName = available.has(n) ? n : ('Icon' + originalName);

        // Если всё ещё нет - возвращаем как есть (будем исправлять отдельно)
        if (!available.has(tablerName)) return n;

        return tablerName + ' as ' + originalName;
      }).join(', ');
      return open + newNames + close;
    }
  );

  if (c !== original) {
    fs.writeFileSync(f, c, 'utf8');
    fixed++;
  }
}

console.log('Fixed files:', fixed);
