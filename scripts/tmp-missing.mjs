import fs from 'fs';
import path from 'path';

const en = JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'));
const flat = (o, p = '', r = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const f = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, f, r);
    else r[f] = String(v);
  }
  return r;
};
const E = flat(en);
const used = new Map();
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(p) || /\.test\./.test(p)) continue;
    const s = fs.readFileSync(p, 'utf8');
    for (const m of s.matchAll(/\bt(?:s)?(?:<[^>]*>)?\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) {
      const k = m[1];
      if (!/^[a-zA-Z]+\./.test(k)) continue;
      if (!used.has(k)) used.set(k, new Set());
      used.get(k).add(p.split(path.sep).join('/').replace(/^src\//, ''));
    }
  }
}
walk('src');
const missing = [...used.keys()].filter((k) => !(k in E)).sort();
console.log('missing count:', missing.length);
for (const k of missing) console.log(k, ' <-', [...used.get(k)].join(', '));
