import { getDriveClient } from './client.js';
import { withRetry } from '../utils/retry.js';
import { createDriveQueue } from '../utils/rate-limiter.js';
import { getLogger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';
import { getDb } from '../storage/db.js';

export async function trashFile(fileId) {
  const drive = await getDriveClient();
  return withRetry(async () => {
    return drive.files.update({
      fileId,
      supportsAllDrives: true,
      requestBody: { trashed: true },
    });
  });
}

export async function permanentlyDeleteFile(fileId) {
  const drive = await getDriveClient();
  return withRetry(async () => {
    return drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });
  });
}

export async function deleteFiles(files, mode = 'trash', onProgress) {
  const logger = getLogger();
  const config = getConfig();
  const db = getDb();
  const queue = createDriveQueue({
    concurrency: config.drive.deletion.concurrency,
  });

  const deleteFn = mode === 'permanent' ? permanentlyDeleteFile : trashFile;
  const logStmt = db.prepare(`
    INSERT INTO deletion_log (file_id, file_name, action, success, error_message)
    VALUES (?, ?, ?, ?, ?)
  `);

  let completed = 0;
  let succeeded = 0;
  let failed = 0;

  const promises = files.map(file =>
    queue.add(async () => {
      try {
        await deleteFn(file.file_id);
        logStmt.run(file.file_id, file.file_name, mode === 'permanent' ? 'deleted_permanently' : 'trashed', 1, null);
        succeeded++;
      } catch (error) {
        logger.error(`Failed to ${mode} ${file.file_name} (${file.file_id}): ${error.message}`);
        logStmt.run(file.file_id, file.file_name, mode === 'permanent' ? 'deleted_permanently' : 'trashed', 0, error.message);
        failed++;
      } finally {
        completed++;
        if (onProgress) onProgress(completed, files.length);
      }
    })
  );

  await Promise.all(promises);

  return { total: files.length, succeeded, failed };
}
