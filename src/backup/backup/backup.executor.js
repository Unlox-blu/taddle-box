const { execFile, spawn } = require('node:child_process');

function checkPgDump(command = 'pg_dump') {
  return new Promise((resolve, reject) => {
    execFile(command, ['--version'], { windowsHide: true }, (error, stdout) => {
      if (error) reject(new Error('pg_dump was not found. Please install PostgreSQL client tools and make sure pg_dump is available in PATH.'));
      else resolve();
    });
  });
}

function runPgDump({ databaseUrl, outputPath, command = 'pg_dump', signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['--format=custom', '--file', outputPath, databaseUrl], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code, closeSignal) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump failed${closeSignal ? ` (${closeSignal})` : ` with exit code ${code}`}${stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : ''}`));
    });
    if (signal) {
      if (signal.aborted) child.kill();
      else signal.addEventListener('abort', () => child.kill(), { once: true });
    }
  });
}

module.exports = { checkPgDump, runPgDump };
