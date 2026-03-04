import chalk from 'chalk';
import { getConfig, setDriveId } from '../utils/config.js';
import { getLogger } from '../utils/logger.js';
import { getDb } from '../storage/db.js';
import { getDistinctParentIds, updateFilePathsBatch } from '../storage/file-repo.js';
import { getCompletedSession } from '../storage/scan-state-repo.js';
import { resolveAllPaths, buildFullPath } from '../drive/path-resolver.js';

export async function resolvePathsCommand(options) {
  const logger = getLogger();
  const driveId = options.driveId || getConfig().driveId;

  if (!driveId) {
    console.error(chalk.red('Error: --drive-id is required'));
    process.exit(1);
  }

  setDriveId(driveId);
  getDb();

  const session = getCompletedSession(driveId);
  if (!session) {
    console.error(chalk.red('No completed scan found. Run "gws-tools scan" first.'));
    process.exit(1);
  }

  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM files WHERE full_path IS NOT NULL AND scan_session_id = ?').get(session.id);
  const total = db.prepare('SELECT COUNT(*) as count FROM files WHERE scan_session_id = ?').get(session.id);

  if (existing.count > 0 && !options.force) {
    console.log(chalk.yellow(`${existing.count}/${total.count} files already have paths resolved.`));
    console.log(chalk.yellow('Use --force to re-resolve all paths.'));
    return;
  }

  console.log(chalk.cyan(`Resolving paths for ${total.count} files (session ${session.id})...`));

  const parentIds = getDistinctParentIds(session.id);
  const folderCache = await resolveAllPaths(parentIds);

  const files = db.prepare('SELECT id, parent_id FROM files WHERE scan_session_id = ?').all(session.id);
  const updates = files.map(f => ({
    id: f.id,
    fullPath: f.parent_id ? buildFullPath(f.parent_id, folderCache) : '/',
  }));

  updateFilePathsBatch(updates);
  console.log(chalk.green(`\nPaths resolved for ${updates.length} files`));
}
