import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { createInterface } from 'readline';
import { getConfig, setDriveId } from '../utils/config.js';
import { getLogger } from '../utils/logger.js';
import { getDb } from '../storage/db.js';
import { getApprovedDeletions, getStats } from '../storage/duplicate-repo.js';
import { deleteFiles } from '../drive/deleter.js';
import { createProgressBar, formatBytes } from '../utils/progress.js';

export async function cleanCommand(options) {
  const logger = getLogger();
  const driveId = options.driveId || getConfig().driveId;

  if (!driveId) {
    console.error(chalk.red('Error: --drive-id is required'));
    process.exit(1);
  }

  setDriveId(driveId);
  getDb();

  const files = getApprovedDeletions();
  if (files.length === 0) {
    console.log(chalk.yellow('No files marked for deletion. Run "gws-tools review" first.'));
    return;
  }

  const stats = getStats();
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const mode = options.mode || 'trash';

  console.log(chalk.bold('\nDeletion Summary:'));
  console.log(`  Files to ${mode}:   ${files.length}`);
  console.log(`  Space to recover: ${formatBytes(totalSize)}`);
  console.log(`  Groups reviewed:  ${stats.reviewedGroups}/${stats.totalGroups}`);
  console.log(`  Mode:             ${mode === 'permanent' ? chalk.red('PERMANENT DELETE') : chalk.yellow('Move to Trash')}`);

  if (stats.reviewedGroups < stats.totalGroups) {
    console.log(chalk.yellow(`\n  Warning: ${stats.totalGroups - stats.reviewedGroups} groups have not been reviewed.`));
  }

  // Dry run
  if (options.dryRun) {
    console.log(chalk.cyan('\n--- DRY RUN (no files will be modified) ---\n'));
    for (const f of files.slice(0, 50)) {
      console.log(`  ${chalk.red('DELETE')} ${f.file_name} (${f.full_path || '?'})`);
    }
    if (files.length > 50) {
      console.log(`  ... and ${files.length - 50} more files`);
    }
    console.log(chalk.cyan('\n--- End dry run ---'));
    return;
  }

  // Confirmation
  if (!options.confirm) {
    if (mode === 'permanent') {
      console.log(chalk.red(`\nThis will PERMANENTLY delete ${files.length} files (${formatBytes(totalSize)}). This cannot be undone.`));
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => {
        rl.question('Type DELETE to confirm: ', resolve);
      });
      rl.close();
      if (answer !== 'DELETE') {
        console.log(chalk.yellow('Aborted.'));
        return;
      }
    } else {
      let proceed;
      try {
        proceed = await confirm({
          message: `Move ${files.length} files to trash (${formatBytes(totalSize)})? Files can be recovered from trash for 30 days.`,
          default: false,
        });
      } catch {
        console.log(chalk.yellow('Aborted.'));
        return;
      }
      if (!proceed) {
        console.log(chalk.yellow('Aborted.'));
        return;
      }
    }
  }

  // Execute deletions
  console.log('');
  const progressBar = createProgressBar('Deleting');
  progressBar.start(files.length, 0);

  const result = await deleteFiles(files, mode, (completed, total) => {
    progressBar.update(completed);
  });

  progressBar.stop();

  console.log('');
  console.log(chalk.bold('Results:'));
  console.log(`  Succeeded: ${chalk.green(result.succeeded)}`);
  console.log(`  Failed:    ${result.failed > 0 ? chalk.red(result.failed) : '0'}`);
  console.log(`  Space recovered: ~${formatBytes(totalSize)}`);

  if (result.failed > 0) {
    console.log(chalk.yellow('\nSome files failed to delete. Check the log for details.'));
    console.log(`  Log: data/gws-tools.log`);
  }
}
