const fs = require('fs');
const path = require('path');

function findTsxFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...findTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = findTsxFiles(path.join(__dirname, 'src'));
console.log('Total TSX files:', files.length);

const allButtons = [];
const allInteractive = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  
  lines.forEach((line, i) => {
    if (line.includes('<button') || line.includes('<Button')) {
      allButtons.push({ file, line: i+1, content: line.trim().substring(0, 200) });
    }
    if (line.includes('onClick=') || line.includes('onPointerDown=') || line.includes('role="button"') || line.includes('role="menuitem"') || line.includes('role="tab"') || line.includes('role="switch"') || line.includes('role="checkbox"')) {
      allInteractive.push({ file, line: i+1, content: line.trim().substring(0, 200) });
    }
  });
}

console.log('Total <button> elements:', allButtons.length);
console.log('Total interactive elements:', allInteractive.length);

fs.writeFileSync('interactive-audit.json', JSON.stringify({ buttons: allButtons, interactive: allInteractive }, null, 2));
console.log('Audit saved to interactive-audit.json');