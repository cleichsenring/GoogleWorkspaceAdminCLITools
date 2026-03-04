import { getDriveClient } from './client.js';
import { withRetry } from '../utils/retry.js';
import { createDriveQueue } from '../utils/rate-limiter.js';
import { getLogger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';

export async function resolveAllPaths(parentIds, knownFolders = new Map()) {
  const drive = await getDriveClient();
  const logger = getLogger();
  const config = getConfig();
  const queue = createDriveQueue({ concurrency: config.drive.pathResolution.concurrency });

  // Map of folderId -> { name, parentId }
  const folderCache = new Map(knownFolders);

  // Fetch unknown parent folders
  const unknownIds = parentIds.filter(id => !folderCache.has(id));
  const total = unknownIds.length;
  let resolved = 0;
  logger.info(`Resolving paths: ${total} unknown folders to fetch`);

  const fetchPromises = unknownIds.map(folderId =>
    queue.add(async () => {
      try {
        const res = await withRetry(async () => {
          return drive.files.get({
            fileId: folderId,
            fields: 'id, name, parents',
            supportsAllDrives: true,
          });
        });
        folderCache.set(folderId, {
          name: res.data.name,
          parentId: res.data.parents?.[0] || null,
        });
      } catch (error) {
        logger.warn(`Could not resolve folder ${folderId}: ${error.message}`);
        folderCache.set(folderId, { name: '?', parentId: null });
      } finally {
        resolved++;
        if (resolved % 50 === 0 || resolved === total) {
          process.stdout.write(`\rResolving folders... ${resolved}/${total} (${Math.round(resolved / total * 100)}%)`);
        }
      }
    })
  );

  await Promise.all(fetchPromises);
  if (total > 0) process.stdout.write('\n');

  // Check if any newly fetched folders have unknown parents — fetch recursively
  let newUnknown = [];
  for (const [, folder] of folderCache) {
    if (folder.parentId && !folderCache.has(folder.parentId)) {
      newUnknown.push(folder.parentId);
    }
  }

  if (newUnknown.length > 0) {
    logger.debug(`Resolving ${newUnknown.length} additional parent folders`);
    await resolveAllPaths(newUnknown, folderCache);
  }

  return folderCache;
}

export function buildFullPath(fileParentId, folderCache) {
  const parts = [];
  let currentId = fileParentId;
  const visited = new Set();

  while (currentId && folderCache.has(currentId)) {
    if (visited.has(currentId)) break; // prevent cycles
    visited.add(currentId);

    const folder = folderCache.get(currentId);
    parts.unshift(folder.name);
    currentId = folder.parentId;
  }

  return '/' + parts.join('/');
}
