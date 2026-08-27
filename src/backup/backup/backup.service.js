const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ZipArchive } = require('archiver');
const { runPgDump } = require('./backup.executor');
const { validateBackup } = require('./backup.validator');
const defaultLogger = require('../utils/logger');
const defaultEmailService = require('../../integrations/email/email.service');
const defaultStorageService = require('../../integrations/storage/storage.service');

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    if (signal) {
      const cancel = () => { clearTimeout(timer); reject(new Error('Backup cancelled during retry backoff')); };
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
    }
  });
}

function createBackupService(config, dependencies = {}) {
  const logger = dependencies.logger || defaultLogger;
  const dump = dependencies.runDump || runPgDump;
  const validate = dependencies.validate || validateBackup;
  const archive = dependencies.archive || createZipArchive;
  const emailService = dependencies.emailService || defaultEmailService;
  const storageService = dependencies.storageService || defaultStorageService;
  let running = false;

  async function replaceBackup(tempPath, latestPath) {
    const previousPath = `${latestPath}.${randomUUID()}.bak`;
    const hasPrevious = await validate(latestPath);
    if (hasPrevious) await fs.rename(latestPath, previousPath);
    try {
      await fs.rename(tempPath, latestPath);
      if (hasPrevious) await fs.rm(previousPath, { force: true });
    } catch (error) {
      await fs.rm(latestPath, { force: true });
      if (hasPrevious) await fs.rename(previousPath, latestPath).catch(() => {});
      throw error;
    }
  }

  async function replaceArtifact(tempPath, finalPath) {
    const previousPath = `${finalPath}.${randomUUID()}.bak`;
    const hasPrevious = await validate(finalPath);
    if (hasPrevious) await fs.rename(finalPath, previousPath);
    try {
      await fs.rename(tempPath, finalPath);
      if (hasPrevious) await fs.rm(previousPath, { force: true });
    } catch (error) {
      await fs.rm(finalPath, { force: true });
      if (hasPrevious) await fs.rename(previousPath, finalPath).catch(() => {});
      throw error;
    }
  }

  async function hasValidBackup() {
    return Boolean(await getLatestBackup());
  }

  async function getLatestBackup() {
    await fs.mkdir(config.backupDir, { recursive: true });
    const entries = await fs.readdir(config.backupDir, { withFileTypes: true });
    const backups = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.dump') || entry.name.endsWith('.tmp')) continue;
      const filePath = path.join(config.backupDir, entry.name);
      if (await validate(filePath)) {
        const stats = await fs.stat(filePath);
        backups.push({
          filePath,
          name: entry.name,
          modifiedAt: stats.mtime,
          createdAt: getBackupTimestamp(entry.name) || stats.mtime
        });
      }
    }
    return backups.sort((left, right) => right.createdAt - left.createdAt)[0] || null;
  }

  async function runBackup(options = {}) {
    if (running) {
      logger.warn('Backup already running; skipping new execution');
      return { skipped: true };
    }
    running = true;
    const signal = options.signal;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.dump`;
    const archiveName = `${backupName}.zip`;
    const latestPath = path.join(config.backupDir, backupName);
    const tempPath = path.join(config.backupDir, `${backupName}.tmp`);
    const archivePath = path.join(config.backupDir, archiveName);
    const archiveTempPath = path.join(config.backupDir, `${archiveName}.tmp`);
    let lastError;
    try {
      await fs.mkdir(config.backupDir, { recursive: true });
      await fs.rm(tempPath, { force: true });
      await fs.rm(archiveTempPath, { force: true });
      for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
        try {
          logger.info('Starting PostgreSQL backup', { attempt, maxAttempts: config.maxRetries });
          await dump({ databaseUrl: config.databaseUrl, outputPath: tempPath, signal });
          if (!(await validate(tempPath))) throw new Error('Temporary backup is missing or empty');
          logger.info('Backup validation successful');
          await archive(tempPath, archiveTempPath, backupName);
          if (!(await validate(archiveTempPath))) throw new Error('Temporary ZIP archive is missing or empty');
          await replaceBackup(tempPath, latestPath);
          await replaceArtifact(archiveTempPath, archivePath);
          await removeOldBackups(backupName, archiveName);
          const stats = await fs.stat(latestPath);
          logger.info('Backup completed successfully', { sizeBytes: stats.size });
          try {
            const s3Key = `backups/${archiveName}`;
            const cloudfront = await storageService.uploadFile(s3Key, archivePath, 'application/zip');
            if(cloudfront) logger.info('Backup S3 upload completed successfully', { cloudfront: cloudfront });
          } catch (s3Error) {
            logger.warn('Backup S3 upload failed', { error: s3Error.message });
          }
          try {
            await emailService.sendBackupSuccessEmail(archivePath, stats.size);
          } catch (emailError) {
            logger.warn('Backup success email failed', { error: emailError.message });
          }
          return { skipped: false, sizeBytes: stats.size };
        } catch (error) {
          lastError = error;
          logger.error('PostgreSQL backup failed', { attempt, maxAttempts: config.maxRetries, error: error.message });
          await fs.rm(tempPath, { force: true });
          if (attempt < config.maxRetries) await delay(2 ** (attempt - 1) * 1000, signal);
        }
      }
      logger.error('Keeping previous valid backup');
      try {
        await emailService.sendBackupFailureEmail(lastError ? lastError.message : 'All backup attempts failed');
      } catch (emailError) {
        logger.warn('Backup failure email failed', { error: emailError.message });
      }
      return { skipped: false, success: false };
    } catch (error) {
      try {
        await emailService.sendBackupFailureEmail(error.message);
      } catch (emailError) {
        logger.warn('Backup failure email failed', { error: emailError.message });
      }
      throw error;
    } finally {
      await fs.rm(tempPath, { force: true });
      await fs.rm(archiveTempPath, { force: true });
      running = false;
    }
  }

  async function removeOldBackups(currentBackupName, currentArchiveName) {
    const entries = await fs.readdir(config.backupDir, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith('.dump') || entry.name.endsWith('.dump.zip'))
        && entry.name !== currentBackupName && entry.name !== currentArchiveName)
      .map((entry) => fs.rm(path.join(config.backupDir, entry.name), { force: true })));
  }

  return { runBackup, hasValidBackup, getLatestBackup, isRunning: () => running };
}

function getBackupTimestamp(fileName) {
  const match = /^backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})Z\.dump$/.exec(fileName);
  if (!match) return null;
  const timestamp = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})$/, 'T$1:$2:$3.$4');
  const date = new Date(`${timestamp}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createZipArchive(sourcePath, outputPath, entryName) {
  return new Promise((resolve, reject) => {
    const output = require('node:fs').createWriteStream(outputPath);
    const zip = new ZipArchive({ zlib: { level: 9 } });
    output.once('close', resolve);
    output.once('error', reject);
    zip.once('error', reject);
    zip.pipe(output);
    zip.file(sourcePath, { name: entryName });
    zip.finalize();
  });
}

module.exports = { createBackupService };
