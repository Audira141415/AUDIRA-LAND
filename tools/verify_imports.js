import fs from 'fs';
import path from 'path';

function checkFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), importPath.split('?')[0]);
      if (!fs.existsSync(resolved)) {
        console.error('Missing file:', resolved, 'imported from', filePath);
        process.exit(1);
      }
    }
  }
}

function walkDir(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walkDir(full);
    else if (full.endsWith('.js')) checkFile(full);
  }
}

walkDir('AUDIRA-LAND/web/src');
console.log('All module import paths verified successfully!');

