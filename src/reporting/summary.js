import chalk from 'chalk';
import { formatBytes } from '../utils/progress.js';

export function printSummary(scanStats, dupStats) {
  console.log(chalk.bold('=== Duplicate Analysis Summary ==='));
  console.log('');
  console.log(`  Total files scanned:     ${scanStats.totalFiles}`);
  console.log(`  Total drive size:        ${scanStats.totalSizeHuman}`);
  console.log('');
  console.log(`  Duplicate groups:        ${dupStats.totalGroups}`);
  console.log(`  Total duplicate files:   ${dupStats.totalMembers}`);
  console.log(`  Marked for deletion:     ${dupStats.markedForDeletion}`);
  console.log(`  Groups reviewed:         ${dupStats.reviewedGroups}/${dupStats.totalGroups}`);
  console.log(`  Recoverable space:       ${chalk.green(formatBytes(dupStats.recoverableSize))}`);
  console.log('');

  for (const t of dupStats.byType) {
    const label = t.match_type === 'md5' ? 'MD5 hash matches' : 'Name+Size matches';
    console.log(`  ${label}: ${t.count} groups, ${formatBytes(t.recoverable)} recoverable`);
  }

  console.log('');
}
