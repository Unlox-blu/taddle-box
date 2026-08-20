const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      walk(filepath, callback);
    } else if (stats.isFile()) {
      callback(filepath);
    }
  }
}

const srcDir = path.join(__dirname, 'src');

let count = 0;

walk(srcDir, (filepath) => {
  if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) {
    const content = fs.readFileSync(filepath, 'utf8');
    
    // Replace whole word 'socketClient' with 'userSocketClient'.
    // Since deviceSocketClient has no word boundary before 's', it won't match!
    // This will also naturally replace import paths like from '../services/socketClient'
    const newContent = content.replace(/\bsocketClient\b/g, 'userSocketClient');
    
    if (content !== newContent) {
      fs.writeFileSync(filepath, newContent, 'utf8');
      count++;
      console.log('Updated', filepath);
    }
  }
});

console.log(`Replaced in ${count} files.`);

// Rename the file itself
const oldPath = path.join(srcDir, 'services', 'socketClient.ts');
const newPath = path.join(srcDir, 'services', 'userSocketClient.ts');

if (fs.existsSync(oldPath)) {
  fs.renameSync(oldPath, newPath);
  console.log('Renamed socketClient.ts to userSocketClient.ts');
} else {
  console.log('socketClient.ts not found. Maybe already renamed?');
}
