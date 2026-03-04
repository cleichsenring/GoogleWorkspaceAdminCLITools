import chalk from 'chalk';
import { getConfig, setDriveId } from '../utils/config.js';
import { getDb } from '../storage/db.js';
import { getLatestSession } from '../storage/scan-state-repo.js';
import { getStats } from '../storage/duplicate-repo.js';
import { getFileCount } from '../storage/file-repo.js';
import { formatBytes } from '../utils/progress.js';

export async function statusCommand(options) {
  const driveId = options.driveId || getConfig().driveId;

  if (!driveId) {
    console.error(chalk.red('Error: --drive-id is required (or set GWS_DRIVE_ID in .env)'));
    process.exit(1);
  }

  setDriveId(driveId);
  getDb();

  const session = getLatestSession(driveId);
  if (!session) {
    console.log(chalk.yellow('No scan sessions found. Run "gws-tools scan" first.'));
    return;
  }

  const fileCount = getFileCount(session.id);

  console.log(chalk.bold('\nScan Status:'));
  console.log(`  Drive ID:      ${driveId}`);
  console.log(`  Session:       ${session.id}`);
  console.log(`  Status:        ${session.status === 'completed' ? chalk.green(session.status) : chalk.yellow(session.status)}`);
  console.log(`  Files indexed: ${fileCount}`);
  console.log(`  Started:       ${session.started_at}`);
  if (session.completed_at) console.log(`  Completed:     ${session.completed_at}`);
  if (session.last_error) console.log(`  Last error:    ${chalk.red(session.last_error)}`);

  // Duplicate analysis stats
  const stats = getStats();
  if (stats.totalGroups > 0) {
    console.log('');
    console.log(chalk.bold('Analysis Status:'));
    console.log(`  Duplicate groups:     ${stats.totalGroups}`);
    console.log(`  Total duplicate files: ${stats.totalMembers}`);
    console.log(`  Marked for deletion:  ${stats.markedForDeletion}`);
    console.log(`  Groups reviewed:      ${stats.reviewedGroups}/${stats.totalGroups}`);
    console.log(`  Recoverable space:    ${formatBytes(stats.recoverableSize)}`);

    for (const t of stats.byType) {
      console.log(`  ${t.match_type}: ${t.count} groups, ${formatBytes(t.recoverable)} recoverable`);
    }
  }

  console.log('');
}
