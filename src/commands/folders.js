import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { getConfig, setDriveId } from '../utils/config.js';
import { getDb } from '../storage/db.js';
import { getCompletedSession } from '../storage/scan-state-repo.js';
import { getStats, bulkMarkFolderDuplicates } from '../storage/duplicate-repo.js';
import { computeFolderOverlap, computeFolderFingerprints } from '../analysis/folder-analyzer.js';
import { createProgressBar, formatBytes } from '../utils/progress.js';

export async function foldersCommand(options) {
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

  const stats = getStats();
  if (stats.totalGroups === 0) {
    console.error(chalk.red('No duplicate analysis found. Run "gws-tools analyze" first.'));
    process.exit(1);
  }

  const minShared = parseInt(options.minShared) || 3;
  const limit = parseInt(options.limit) || 30;

  console.log(chalk.cyan(`\nAnalyzing folders for drive ${driveId} (${session.total_files} files)...\n`));

  // === Part 1: Folder Overlap ===
  let overlapBar = null;
  const startOverlap = Date.now();

  const overlapResults = computeFolderOverlap(session.id, {
    minShared,
    onProgress({ phase, current, total }) {
      if (!overlapBar && total > 0) {
        console.log(chalk.dim('Computing folder overlap...'));
        overlapBar = createProgressBar('Analyzing');
        overlapBar.start(total, 0);
      }
      if (overlapBar) overlapBar.update(current);
    },
  });

  if (overlapBar) overlapBar.stop();
  const overlapElapsed = ((Date.now() - startOverlap) / 1000).toFixed(1);

  // === Part 2: Folder Fingerprinting ===
  let fpBar = null;
  const startFp = Date.now();

  const fpResults = computeFolderFingerprints(session.id, {
    onProgress({ phase, current, total }) {
      if (!fpBar && total > 0) {
        console.log(chalk.dim('Computing folder fingerprints...'));
        fpBar = createProgressBar('Hashing');
        fpBar.start(total, 0);
      }
      if (fpBar) fpBar.update(current);
    },
  });

  if (fpBar) fpBar.stop();
  const fpElapsed = ((Date.now() - startFp) / 1000).toFixed(1);

  // === Display or Review ===
  if (options.review) {
    await reviewFolders(overlapResults, fpResults, driveId);
  } else {
    displayReport(overlapResults, fpResults, overlapElapsed, fpElapsed, minShared, limit);
  }
}

function displayReport(overlapResults, fpResults, overlapElapsed, fpElapsed, minShared, limit) {
  console.log(chalk.bold(`\n=== Folder Overlap (from duplicate analysis) ===`));
  if (overlapResults.length === 0) {
    console.log(chalk.dim(`  No folder pairs share ${minShared}+ duplicate groups.`));
    if (minShared > 1) {
      console.log(chalk.dim(`  Try: gws-tools folders --min-shared 1`));
    }
  } else {
    console.log(chalk.dim(`  ${overlapResults.length} folder pairs found (${overlapElapsed}s)\n`));

    const shown = overlapResults.slice(0, limit);
    for (let i = 0; i < shown.length; i++) {
      const r = shown[i];
      console.log(`  ${chalk.bold(`${i + 1}.`)} ${r.folderA}  ${chalk.dim('↔')}  ${r.folderB}`);
      console.log(`     Shared: ${r.sharedGroups} duplicate groups | Files: ${r.filesA} / ${r.filesB} | Overlap: ${r.overlapPct}%`);
      console.log(`     Recoverable: ~${formatBytes(r.recoverableSize)}`);
      console.log('');
    }

    if (overlapResults.length > limit) {
      console.log(chalk.dim(`  ... and ${overlapResults.length - limit} more. Use --limit ${overlapResults.length} to see all.\n`));
    }
  }

  console.log(chalk.bold(`\n=== Identical Folders (fingerprint match) ===`));
  if (fpResults.length === 0) {
    console.log(chalk.dim('  No identical folders found.'));
  } else {
    const totalRecoverable = fpResults.reduce((sum, g) => sum + g.totalSize * (g.folders.length - 1), 0);
    console.log(chalk.dim(`  ${fpResults.length} groups of identical folders found (${fpElapsed}s)`));
    console.log(chalk.dim(`  Total recoverable: ${formatBytes(totalRecoverable)}\n`));

    const shown = fpResults.slice(0, limit);
    for (let i = 0; i < shown.length; i++) {
      const g = shown[i];
      const copies = g.folders.length - 1;
      console.log(`  ${chalk.bold(`${i + 1}.`)} ${g.fileCount} files, ${formatBytes(g.totalSize)} each (${copies} extra ${copies === 1 ? 'copy' : 'copies'})`);
      for (const folder of g.folders) {
        console.log(`     ${folder}`);
      }
      console.log('');
    }

    if (fpResults.length > limit) {
      console.log(chalk.dim(`  ... and ${fpResults.length - limit} more. Use --limit ${fpResults.length} to see all.\n`));
    }
  }

  console.log('');
  console.log(chalk.green('To interactively review and mark folders for deletion:'));
  console.log(`  gws-tools folders --drive-id <id> --review\n`);
}

async function reviewFolders(overlapResults, fpResults, driveId) {
  // Build a unified list: fingerprint matches first (exact copies), then overlap pairs
  const reviewItems = [];

  for (const fp of fpResults) {
    // For fingerprint groups with >2 folders, create pairs from the first folder vs each other
    for (let i = 1; i < fp.folders.length; i++) {
      reviewItems.push({
        type: 'fingerprint',
        folderA: fp.folders[0],
        folderB: fp.folders[i],
        sharedGroups: fp.fileCount,
        filesA: fp.fileCount,
        filesB: fp.fileCount,
        overlapPct: 100,
        recoverableSize: fp.totalSize,
        label: 'Identical (fingerprint)',
      });
    }
  }

  for (const ov of overlapResults) {
    // Skip pairs already covered by fingerprint matches
    const alreadyCovered = reviewItems.some(
      r => (r.folderA === ov.folderA && r.folderB === ov.folderB) ||
           (r.folderA === ov.folderB && r.folderB === ov.folderA)
    );
    if (!alreadyCovered) {
      reviewItems.push({
        type: 'overlap',
        ...ov,
        label: `Overlap (${ov.overlapPct}%)`,
      });
    }
  }

  if (reviewItems.length === 0) {
    console.log(chalk.yellow('\nNo folder pairs to review.'));
    return;
  }

  console.log(chalk.bold(`\n=== Folder Review: ${reviewItems.length} pairs to review ===`));
  console.log(chalk.dim('Identical folders shown first, then highest overlap.\n'));

  const startTime = Date.now();
  let totalGroupsUpdated = 0;
  let totalFilesMarked = 0;

  for (let i = 0; i < reviewItems.length; i++) {
    const item = reviewItems[i];
    const pct = Math.round(((i + 1) / reviewItems.length) * 100);

    console.log(chalk.bold(`\n--- Pair ${i + 1}/${reviewItems.length} (${pct}%) — ${item.label} ---`));
    console.log(`  ${chalk.cyan('[A]')} ${item.folderA}`);
    console.log(`      ${item.filesA} files, ${formatBytes(item.type === 'overlap' ? item.sizeA : item.recoverableSize)}`);
    console.log(`  ${chalk.cyan('[B]')} ${item.folderB}`);
    console.log(`      ${item.filesB} files, ${formatBytes(item.type === 'overlap' ? item.sizeB : item.recoverableSize)}`);
    console.log(`  Shared: ${item.sharedGroups} duplicate groups | Recoverable: ~${formatBytes(item.recoverableSize)}`);
    console.log(chalk.dim(`  Running total: ${totalFilesMarked} files marked, ${totalGroupsUpdated} groups resolved`));

    let action;
    try {
      action = await select({
        message: 'Action:',
        choices: [
          { value: 'keep_a', name: `Keep [A], delete files in [B] (${item.folderB})` },
          { value: 'keep_b', name: `Keep [B], delete files in [A] (${item.folderA})` },
          { value: 'skip', name: 'Skip (keep both)' },
          { value: 'quit', name: 'Quit (progress is saved)' },
        ],
      });
    } catch {
      console.log(chalk.yellow('\nReview paused. Progress saved.'));
      break;
    }

    if (action === 'quit') {
      console.log(chalk.yellow('\nReview paused. Progress saved.'));
      break;
    }

    if (action === 'skip') {
      continue;
    }

    const keepFolder = action === 'keep_a' ? item.folderA : item.folderB;
    const deleteFolder = action === 'keep_a' ? item.folderB : item.folderA;

    const result = bulkMarkFolderDuplicates(keepFolder, deleteFolder);
    totalGroupsUpdated += result.groupsUpdated;
    totalFilesMarked += result.filesMarkedForDeletion;

    console.log(chalk.green(`  ✓ ${result.groupsUpdated} groups updated, ${result.filesMarkedForDeletion} files marked for deletion`));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.green(`\nFolder review complete in ${elapsed}s`));
  console.log(`  ${totalGroupsUpdated} duplicate groups resolved`);
  console.log(`  ${totalFilesMarked} files marked for deletion`);

  const finalStats = getStats();
  console.log(`  ${finalStats.reviewedGroups}/${finalStats.totalGroups} total groups reviewed`);
  console.log(`  ${formatBytes(finalStats.recoverableSize)} total recoverable`);
  console.log(`\nNext: gws-tools review --drive-id ${driveId}   # Review remaining individual duplicates`);
  console.log(`  Or: gws-tools clean --drive-id ${driveId}    # Execute approved deletions`);
}
