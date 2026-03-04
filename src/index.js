#!/usr/bin/env node

import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { analyzeCommand } from './commands/analyze.js';
import { reportCommand } from './commands/report.js';
import { reviewCommand } from './commands/review.js';
import { cleanCommand } from './commands/clean.js';
import { statusCommand } from './commands/status.js';
import { drivesCommand } from './commands/drives.js';
import { resolvePathsCommand } from './commands/resolve-paths.js';
import { foldersCommand } from './commands/folders.js';

const program = new Command();

program
  .name('gws-tools')
  .description('Google Workspace admin tools — Shared Drive duplicate finder and cleaner')
  .version('0.1.0');

program
  .command('drives')
  .description('List and select a Shared Drive')
  .option('--list', 'Just list drives without interactive picker')
  .action(drivesCommand);

program
  .command('scan')
  .description('Scan a Shared Drive and store file metadata locally')
  .requiredOption('--drive-id <id>', 'Shared Drive ID (or set GWS_DRIVE_ID env var)')
  .option('--resume', 'Resume an interrupted scan')
  .option('--force', 'Start a fresh scan even if one exists')
  .option('--resolve-paths', 'Resolve full folder paths after scanning', true)
  .option('--no-resolve-paths', 'Skip path resolution')
  .action(scanCommand);

program
  .command('analyze')
  .description('Find duplicate files from the last scan')
  .option('--drive-id <id>', 'Shared Drive ID (defaults to GWS_DRIVE_ID env var)')
  .option('--strategy <name>', 'Keep strategy: oldest-created|newest-modified|shallowest-path|manual', 'oldest-created')
  .option('--min-size <bytes>', 'Only consider files larger than this', '0')
  .option('--no-include-native', 'Exclude Google Workspace native files')
  .action(analyzeCommand);

program
  .command('report')
  .description('Generate CSV/JSON report of duplicates')
  .option('--drive-id <id>', 'Shared Drive ID')
  .option('--format <type>', 'Output format: csv|json|both', 'csv')
  .option('--output <path>', 'Output file path')
  .option('--summary-only', 'Only print summary statistics')
  .action(reportCommand);

program
  .command('review')
  .description('Interactively review duplicate groups')
  .option('--drive-id <id>', 'Shared Drive ID')
  .option('--start-from <id>', 'Start review from a specific group ID')
  .option('--filter <type>', 'Filter groups: md5|name_size|all', 'all')
  .action(reviewCommand);

program
  .command('clean')
  .description('Execute approved deletions')
  .option('--drive-id <id>', 'Shared Drive ID')
  .option('--mode <mode>', 'Deletion mode: trash|permanent', 'trash')
  .option('--dry-run', 'Show what would be deleted without executing')
  .option('--batch-size <n>', 'Batch size for parallel deletion', '50')
  .option('--confirm', 'Skip confirmation prompt')
  .action(cleanCommand);

program
  .command('resolve-paths')
  .description('Resolve folder paths for scanned files (standalone)')
  .option('--drive-id <id>', 'Shared Drive ID')
  .option('--force', 'Re-resolve even if paths already exist')
  .action(resolvePathsCommand);

program
  .command('folders')
  .description('Analyze folder-level duplicates and overlap')
  .option('--drive-id <id>', 'Shared Drive ID')
  .option('--min-shared <n>', 'Min shared duplicate groups for overlap report', '3')
  .option('--limit <n>', 'Max results to display', '30')
  .option('--review', 'Interactively review folder pairs and mark for deletion')
  .option('--sort <by>', 'Sort review order: size|depth|overlap', 'size')
  .action(foldersCommand);

program
  .command('status')
  .description('Show current scan/analysis state')
  .option('--drive-id <id>', 'Shared Drive ID')
  .action(statusCommand);

program.parse();
