import chalk from 'chalk';
import { getConfig, setDriveId } from '../utils/config.js';
import { getLogger } from '../utils/logger.js';
import { getDb } from '../storage/db.js';
import { getCompletedSession } from '../storage/scan-state-repo.js';
import { findDuplicates } from '../analysis/duplicate-finder.js';
import { computeStats } from '../analysis/stats.js';
import { createProgressBar, formatBytes } from '../utils/progress.js';

export async function analyzeCommand(options) {
  const logger = getLogger();
  const driveId = options.driveId || getConfig().driveId;

  if (!driveId) {
    console.error(chalk.red('Error: --drive-id is required (or set GWS_DRIVE_ID in .env)'));
    process.exit(1);
  }

  setDriveId(driveId);
  getDb();

  const session = getCompletedSession(driveId);
  if (!session) {
    console.error(chalk.red('No completed scan found. Run "gws-tools scan" first.'));
    process.exit(1);
  }

  console.log(chalk.cyan(`Analyzing scan session ${session.id} (${session.total_files} files)...\n`));

  let currentBar = null;
  let currentPhase = null;

  const startTime = Date.now();
  const result = findDuplicates(session.id, {
    strategy: options.strategy,
    minSize: parseInt(options.minSize) || 0,
    includeNative: options.includeNative !== false,
    onProgress({ phase, current, total }) {
      if (phase !== currentPhase) {
        // Finish previous bar
        if (currentBar) currentBar.stop();

        currentPhase = phase;
        const label = phase === 'md5' ? 'Phase 1: MD5 duplicates' : 'Phase 2: Name+Size duplicates';
        console.log(chalk.dim(label));
        currentBar = createProgressBar('Processing');
        currentBar.start(total, 0);
      }
      currentBar.update(current);
    },
  });

  if (currentBar) currentBar.stop();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.green(`\nAnalysis complete in ${elapsed}s`));

  // Print summary
  const stats = computeStats(session.id);
  console.log('');
  console.log(chalk.bold('Summary:'));
  console.log(`  Total files scanned:    ${stats.totalFiles}`);
  console.log(`  Total size:             ${stats.totalSizeHuman}`);
  console.log(`  Duplicate groups:       ${stats.duplicateGroups}`);
  console.log(`  Duplicate files:        ${stats.duplicateFiles}`);
  console.log(`  Recoverable space:      ${chalk.green(stats.recoverableSizeHuman)}`);
  console.log('');

  for (const t of stats.byType) {
    console.log(`  ${t.match_type === 'md5' ? 'MD5 hash' : 'Name+Size'} matches: ${t.groups} groups, ${formatBytes(t.recoverable)} recoverable`);
  }

  console.log('');
  console.log(chalk.green(`Next steps:`));
  console.log(`  gws-tools report --drive-id ${driveId}    # Generate CSV report`);
  console.log(`  gws-tools review --drive-id ${driveId}    # Interactive review`);
}
