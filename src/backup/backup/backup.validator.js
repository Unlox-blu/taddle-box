const fs = require('node:fs/promises');

async function validateBackup(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

module.exports = { validateBackup };
