import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { getDriveClient } from '../drive/client.js';
import { getLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

export async function drivesCommand(options) {
  const logger = getLogger();
  const drive = await getDriveClient();

  console.log(chalk.cyan('Fetching Shared Drives...\n'));

  const allDrives = [];
  let pageToken = null;

  do {
    const response = await withRetry(async () => {
      return drive.drives.list({
        pageSize: 100,
        pageToken: pageToken || undefined,
        fields: 'nextPageToken, drives(id, name, createdTime)',
      });
    });

    allDrives.push(...(response.data.drives || []));
    pageToken = response.data.nextPageToken || null;
  } while (pageToken);

  if (allDrives.length === 0) {
    console.log(chalk.yellow('No Shared Drives found. You may not have access to any.'));
    return;
  }

  // Sort alphabetically
  allDrives.sort((a, b) => a.name.localeCompare(b.name));

  if (options.list) {
    console.log(chalk.bold(`Found ${allDrives.length} Shared Drive(s):\n`));
    for (const d of allDrives) {
      console.log(`  ${chalk.green(d.id)}  ${d.name}`);
    }
    console.log('');
    return;
  }

  // Interactive picker
  let chosen;
  try {
    chosen = await select({
      message: `Select a Shared Drive (${allDrives.length} found):`,
      choices: allDrives.map(d => ({
        value: d.id,
        name: `${d.name}  ${chalk.dim(d.id)}`,
      })),
    });
  } catch {
    return;
  }

  const chosenDrive = allDrives.find(d => d.id === chosen);
  console.log(`\n${chalk.green('Selected:')} ${chosenDrive.name} (${chosenDrive.id})`);
  console.log(`\nRun your next command with:`);
  console.log(chalk.cyan(`  gws-tools scan --drive-id ${chosenDrive.id}`));
  console.log(`\nOr set it in your .env:`);
  console.log(chalk.cyan(`  GWS_DRIVE_ID=${chosenDrive.id}`));
}
