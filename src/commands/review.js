import chalk from 'chalk';
import { select, confirm } from '@inquirer/prompts';
import open from 'open';
import { getConfig, setDriveId } from '../utils/config.js';
import { getDb } from '../storage/db.js';
import { getCompletedSession } from '../storage/scan-state-repo.js';
import { getGroups, getGroupMembers, updateMemberAction, markGroupReviewed, getStats } from '../storage/duplicate-repo.js';
import { formatBytes } from '../utils/progress.js';

export async function reviewCommand(options) {
  const driveId = options.driveId || getConfig().driveId;

  if (!driveId) {
    console.error(chalk.red('Error: --drive-id is required'));
    process.exit(1);
  }

  setDriveId(driveId);
  getDb();

  const session = getCompletedSession(driveId);
  if (!session) {
    console.error(chalk.red('No completed scan found.'));
    process.exit(1);
  }

  const stats = getStats();
  if (stats.totalGroups === 0) {
    console.log(chalk.yellow('No duplicate groups found. Run "gws-tools analyze" first.'));
    return;
  }

  const filter = options.filter || 'all';
  let groups = getGroups(filter === 'all' ? 'unreviewed' : filter);

  if (options.startFrom) {
    const startIdx = groups.findIndex(g => g.id >= parseInt(options.startFrom));
    if (startIdx > 0) groups = groups.slice(startIdx);
  }

  if (groups.length === 0) {
    console.log(chalk.green('All groups have been reviewed!'));
    const allStats = getStats();
    console.log(`  ${allStats.markedForDeletion} files marked for deletion (${formatBytes(allStats.recoverableSize)} recoverable)`);
    console.log(`\nRun: gws-tools clean --drive-id ${driveId}`);
    return;
  }

  console.log(chalk.bold(`\nStarting review: ${groups.length} groups to review\n`));

  const startTime = Date.now();
  let deletionsCount = stats.markedForDeletion;
  let recoverableTotal = stats.recoverableSize;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const members = getGroupMembers(group.id);
    const pct = Math.round(((i + 1) / groups.length) * 100);

    // Display group header with running totals
    console.log(chalk.bold(`\n=== Duplicate Group ${i + 1}/${groups.length} (${pct}%) (${group.match_type === 'md5' ? 'MD5 match' : 'Name+Size match'}) ===`));
    if (group.match_type === 'md5') {
      console.log(`  Hash: ${group.match_key}`);
    }
    console.log(`  Files: ${group.file_count} | Recoverable: ${formatBytes(group.recoverable_size)}`);
    console.log(chalk.dim(`  Running total: ${deletionsCount} files to delete, ${formatBytes(recoverableTotal)} recoverable`));
    console.log('');

    // Display each file in group
    for (let j = 0; j < members.length; j++) {
      const m = members[j];
      const actionLabel = m.action === 'keep'
        ? chalk.green('KEEP')
        : m.action === 'delete'
          ? chalk.red('DELETE')
          : chalk.yellow('PENDING');

      const fileSize = formatBytes(m.size);
      const storageSuffix = (m.quota_bytes_used && m.size && m.quota_bytes_used !== m.size)
        ? chalk.dim(` (storage: ${formatBytes(m.quota_bytes_used)})`)
        : '';

      console.log(`  [${j + 1}] ${actionLabel}  ${m.name}`);
      console.log(`      Path: ${m.full_path || '(unresolved)'}`);
      console.log(`      Size: ${fileSize}${storageSuffix} | Created: ${m.created_time?.slice(0, 10) || '?'} | Modified: ${m.modified_time?.slice(0, 10) || '?'}`);
      if (m.web_view_link) console.log(`      Link: ${m.web_view_link}`);
    }
    console.log('');

    // Prompt for action
    const keepFile = members.find(m => m.action === 'keep');
    const keepIndex = keepFile ? members.indexOf(keepFile) + 1 : 1;

    let action;
    try {
      action = await select({
        message: 'Action:',
        choices: [
          { value: 'accept', name: `Accept recommendation (keep #${keepIndex}, delete others)` },
          { value: 'choose', name: 'Keep a different file...' },
          { value: 'skip', name: 'Keep all (skip this group)' },
          { value: 'open', name: 'Open files in browser' },
          { value: 'quit', name: 'Quit (progress is saved)' },
        ],
      });
    } catch {
      // User pressed Ctrl+C
      console.log(chalk.yellow('\nReview paused. Progress saved.'));
      return;
    }

    if (action === 'quit') {
      console.log(chalk.yellow('\nReview paused. Progress saved.'));
      const currentStats = getStats();
      console.log(`  ${currentStats.reviewedGroups}/${currentStats.totalGroups} groups reviewed`);
      return;
    }

    if (action === 'open') {
      for (const m of members) {
        if (m.web_view_link) await open(m.web_view_link);
      }
      i--; // Re-show this group after opening
      continue;
    }

    if (action === 'accept') {
      // Keep the recommended file, mark others for deletion
      markGroupReviewed(group.id);
      deletionsCount += members.filter(m => m.action === 'delete').length;
      recoverableTotal += group.recoverable_size;
    } else if (action === 'choose') {
      const choices = members.map((m, idx) => ({
        value: m.id,
        name: `[${idx + 1}] ${m.name} (${m.full_path || '?'}, ${m.created_time?.slice(0, 10) || '?'})`,
      }));

      let chosenMemberId;
      try {
        chosenMemberId = await select({
          message: 'Which file to keep?',
          choices,
        });
      } catch {
        console.log(chalk.yellow('\nReview paused.'));
        return;
      }

      // Update actions: chosen = keep, rest = delete
      for (const m of members) {
        if (m.id === chosenMemberId) {
          updateMemberAction(m.id, 'keep', 'manual');
        } else {
          updateMemberAction(m.id, 'delete', 'manual');
        }
      }
      markGroupReviewed(group.id);
      deletionsCount += members.length - 1;
      recoverableTotal += group.recoverable_size;
    } else if (action === 'skip') {
      // Mark all as keep (skip)
      for (const m of members) {
        updateMemberAction(m.id, 'keep', 'skipped');
      }
      markGroupReviewed(group.id);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.green(`\nReview complete in ${elapsed}s!`));
  const finalStats = getStats();
  console.log(`  ${finalStats.markedForDeletion} files marked for deletion (${formatBytes(finalStats.recoverableSize)} recoverable)`);
  console.log(`\nNext: gws-tools clean --drive-id ${driveId}`);
}
