import fs from 'fs';
try { fs.unlinkSync('scripts/fix-tabler-usage.mjs'); } catch {}
try { fs.unlinkSync('src/lib/tabler-compat.ts'); } catch {}
console.log('cleaned');
