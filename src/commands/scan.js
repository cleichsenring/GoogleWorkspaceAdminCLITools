import chalk from 'chalk';
import { getConfig, setDriveId } from '../utils/config.js';
import { getLogger } from '../utils/logger.js';
import { createProgressBar, formatBytes } from '../utils/progress.js';
import { getDb } from '../storage/db.js';
import { insertFileBatch, getFileCount, getDistinctParentIds, updateFilePathsBatch } from '../storage/file-repo.js';
import { createSession, updateProgress, completeSession, interruptSession, getLatestSession, getInterruptedSession } from '../storage/scan-state-repo.js';
import { scanDrive } from '../drive/scanner.js';
import { resolveAllPaths, buildFullPath } from '../drive/path-resolver.js';

export async function scanCommand(options) {
  const logger = getLogger();
  const driveId = options.driveId || getConfig().driveId;

  if (!driveId) {
    console.error(chalk.red('Error: --drive-id is required (or set GWS_DRIVE_ID in .env)'));
    process.exit(1);
  }

  setDriveId(driveId);
  getDb(); // initialize

  let sessionId;
  let startPageToken = null;
  let totalFiles = 0;
  let totalSize = 0;

  // Check for existing/interrupted sessions
  if (options.resume) {
    const interrupted = getInterruptedSession(driveId);
    if (!interrupted) {
      console.log(chalk.yellow('No interrupted scan found. Starting fresh.'));
    } else {
      sessionId = interrupted.id;
      startPageToken = interrupted.next_page_token;
      totalFiles = interrupted.total_files;
      console.log(chalk.green(`Resuming scan session ${sessionId} (${totalFiles} files so far)`));
    }
  }

  if (!options.resume || !sessionId) {
    if (!options.force) {
      const existing = getLatestSession(driveId);
      if (existing?.status === 'completed') {
        const fileCount = getFileCount(existing.id);
        console.log(chalk.yellow(`A completed scan already exists (${fileCount} files, ${existing.completed_at}).`));
        console.log(chalk.yellow('Use --force to start a fresh scan, or run "analyze" to find duplicates.'));
        return;
      }
    }

    sessionId = createSession(driveId);
    console.log(chalk.green(`Starting new scan session ${sessionId} for drive ${driveId}`));
  }

  // Handle Ctrl+C gracefully
  let interrupted = false;
  const handleInterrupt = () => {
    if (interrupted) return;
    interrupted = true;
    console.log(chalk.yellow('\nScan interrupted. Saving progress...'));
    interruptSession(sessionId, 'User interrupted');
    console.log(chalk.green(`Progress saved. Resume with: gws-tools scan --drive-id ${driveId} --resume`));
    process.exit(0);
  };
  process.on('SIGINT', handleInterrupt);
  process.on('SIGTERM', handleInterrupt);

  // Scan
  const startTime = Date.now();
  try {
    for await (const page of scanDrive(driveId, startPageToken)) {
      const inserted = insertFileBatch(page.files, sessionId);
      totalFiles += inserted;
      totalSize += page.files.reduce((sum, f) => sum + (Number(f.quotaBytesUsed) || Number(f.size) || 0), 0);
      updateProgress(sessionId, page.nextPageToken, totalFiles);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r${chalk.cyan('Scanning...')} ${totalFiles} files, ${formatBytes(totalSize)} (page ${page.pageNum}, ${elapsed}s)`);
    }
  } catch (error) {
    logger.error('Scan failed:', error);
    interruptSession(sessionId, error.message);
    console.error(chalk.red(`\nScan failed: ${error.message}`));
    console.log(chalk.yellow(`Resume with: gws-tools scan --drive-id ${driveId} --resume`));
    process.exit(1);
  }

  completeSession(sessionId);
  process.removeListener('SIGINT', handleInterrupt);
  process.removeListener('SIGTERM', handleInterrupt);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${chalk.green('Scan complete!')} ${totalFiles} files, ${formatBytes(totalSize)} indexed in ${elapsed}s`);

  // Resolve paths
  if (options.resolvePaths) {
    console.log(chalk.cyan('Resolving folder paths...'));
    try {
      const parentIds = getDistinctParentIds(sessionId);
      const folderCache = await resolveAllPaths(parentIds);

      // Build and save full paths for all files
      const db = getDb();
      const files = db.prepare('SELECT id, parent_id FROM files WHERE scan_session_id = ?').all(sessionId);

      const updates = files.map(f => ({
        id: f.id,
        fullPath: f.parent_id ? buildFullPath(f.parent_id, folderCache) : '/',
      }));

      updateFilePathsBatch(updates);
      console.log(chalk.green(`Paths resolved for ${updates.length} files`));
    } catch (error) {
      logger.warn('Path resolution failed (non-fatal):', error.message);
      console.log(chalk.yellow('Path resolution failed. Files are still indexed. You can re-run with --resolve-paths later.'));
    }
  }

  console.log(chalk.green(`\nNext step: gws-tools analyze --drive-id ${driveId}`));
}
