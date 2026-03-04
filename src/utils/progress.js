import cliProgress from 'cli-progress';
import chalk from 'chalk';

export function createProgressBar(label = 'Progress') {
  return new cliProgress.SingleBar({
    format: `${chalk.cyan(label)} |${chalk.cyan('{bar}')}| {value}/{total} ({percentage}%) | ETA: {eta}s`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });
}

export function createSpinner(label = 'Working') {
  // Simple counter-based progress for unknown totals
  return new cliProgress.SingleBar({
    format: `${chalk.cyan(label)} | {value} items processed`,
    barsize: 0,
    hideCursor: true,
  });
}

export function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
