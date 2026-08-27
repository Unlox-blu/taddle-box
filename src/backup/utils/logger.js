function write(level, message, details = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...details };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

module.exports = {
  info: (message, details) => write('INFO', message, details),
  warn: (message, details) => write('WARN', message, details),
  error: (message, details) => write('ERROR', message, details)
};
