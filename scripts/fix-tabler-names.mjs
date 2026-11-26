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

// Имена, которые в Tabler отличаются от Lucide
const NAME_MAP = {
  CheckCheck: 'CheckCheck2',
};

// Файлы, в которых есть импорт из @tabler/icons-react
const files = walk('src').filter(f => {
  const c = fs.readFileSync(f, 'utf8');
  return c.includes("@tabler/icons-react");
});

let count = 0;
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const original = c;

  // Находим блок импорта из @tabler/icons-react и заменяем имена иконок
  c = c.replace(
    /(import\s*\{)([^}]*)(\} from '@tabler\/icons-react'?)/g,
    (match, open, names, close) => {
      const newNames = names.split(',').map(n => {
        n = n.trim();
        // Разделяем имя и алиас (as)
        const parts = n.split(/\s+as\s+/);
        let name = parts[0].trim();
        let alias = parts.length > 1 ? parts[1].trim() : '';

        // Применяем маппинг имён
        if (NAME_MAP[name]) name = NAME_MAP[name];

        // Добавляем префикс Icon, если ещё нет
        if (!name.startsWith('Icon')) name = 'Icon' + name;

        return alias ? `${name} as ${alias}` : name;
      }).join(', ');
      return open + newNames + close;
    }
  );

  if (c !== original) {
    fs.writeFileSync(f, c, 'utf8');
    count++;
  }
}

console.log('Fixed files:', count);
