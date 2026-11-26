const fs = require('fs');
const content = fs.readFileSync('F:\\AISTUDIO\\nova-dark-messenger\\src\\components\\ChatScreen.tsx', 'utf8');
let balance = 0;
let inString = false;
let stringChar = '';
let lineNum = 1;
for (let i = 0; i < content.length; i++) {
  const ch = content[i];
  if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
    inString = true;
    stringChar = ch;
  } else if (inString && ch === stringChar && content[i-1] !== '\\') {
    inString = false;
  } else if (!inString) {
    if (ch === '{') balance++;
    else if (ch === '}') balance--;
  }
  if (ch === '\n') {
    lineNum++;
    if (balance > 3) {
      console.log('Line', lineNum, 'balance:', balance);
    }
  }
}
console.log('Final balance:', balance, 'at line', lineNum);