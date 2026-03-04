import chalk from 'chalk';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { getConfig, setDriveId } from '../utils/config.js';
import { getLogger } from '../utils/logger.js';
import { getDb } from '../storage/db.js';
import { getCompletedSession } from '../storage/scan-state-repo.js';
import { getGroups, getStats } from '../storage/duplicate-repo.js';
import { computeStats } from '../analysis/stats.js';
import { writeCsvReport } from '../reporting/csv-writer.js';
import { writeJsonReport } from '../reporting/json-writer.js';
import { printSummary } from '../reporting/summary.js';
import { createProgressBar, formatBytes } from '../utils/progress.js';

export async function reportCommand(options) {
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

  const stats = computeStats(session.id);
  const dupStats = getStats();

  if (dupStats.totalGroups === 0) {
    console.log(chalk.yellow('No duplicate groups found. Run "gws-tools analyze" first.'));
    return;
  }

  if (options.summaryOnly) {
    printSummary(stats, dupStats);
    return;
  }

  const config = getConfig();
  const reportsDir = config.storage.reportsDir;
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const format = options.format || 'csv';

  if (format === 'csv' || format === 'both') {
    const outputPath = options.output || resolve(reportsDir, `duplicates-${timestamp}.csv`);
    let progressBar = null;
    await writeCsvReport(outputPath, {
      onProgress({ current, total }) {
        if (!progressBar) {
          progressBar = createProgressBar('Writing CSV');
          progressBar.start(total, 0);
        }
        progressBar.update(current);
      },
    });
    if (progressBar) progressBar.stop();
    console.log(chalk.green(`CSV report written to: ${outputPath}`));
  }

  if (format === 'json' || format === 'both') {
    const outputPath = format === 'both'
      ? resolve(reportsDir, `duplicates-${timestamp}.json`)
      : (options.output || resolve(reportsDir, `duplicates-${timestamp}.json`));
    let progressBar = null;
    writeJsonReport(outputPath, {
      onProgress({ current, total }) {
        if (!progressBar) {
          progressBar = createProgressBar('Writing JSON');
          progressBar.start(total, 0);
        }
        progressBar.update(current);
      },
    });
    if (progressBar) progressBar.stop();
    console.log(chalk.green(`JSON report written to: ${outputPath}`));
  }

  console.log('');
  printSummary(stats, dupStats);
}
