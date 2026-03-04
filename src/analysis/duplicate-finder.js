import { getDb } from '../storage/db.js';
import { clearGroups, insertGroup } from '../storage/duplicate-repo.js';
import { getLogger } from '../utils/logger.js';
import { applyStrategy } from './keep-strategy.js';

export function findDuplicates(sessionId, options = {}) {
  const db = getDb();
  const logger = getLogger();
  const { strategy = 'oldest-created', minSize = 0, includeNative = true, onProgress } = options;

  // Clear previous analysis
  clearGroups();

  let totalGroups = 0;
  let totalDuplicateFiles = 0;

  // Phase 1: MD5-based duplicates
  logger.info('Phase 1: Finding MD5-based duplicates...');
  const md5Groups = db.prepare(`
    SELECT md5_checksum, COUNT(*) as cnt, SUM(size) as total_size
    FROM files
    WHERE md5_checksum IS NOT NULL
      AND trashed = 0
      AND scan_session_id = ?
      AND (size >= ? OR ? = 0)
    GROUP BY md5_checksum
    HAVING COUNT(*) > 1
    ORDER BY SUM(size) DESC
  `).all(sessionId, minSize, minSize);

  if (onProgress) onProgress({ phase: 'md5', current: 0, total: md5Groups.length });

  for (let i = 0; i < md5Groups.length; i++) {
    const group = md5Groups[i];
    const files = db.prepare(`
      SELECT id, name, size, created_time, modified_time, full_path
      FROM files
      WHERE md5_checksum = ? AND scan_session_id = ? AND trashed = 0
      ORDER BY created_time ASC
    `).all(group.md5_checksum, sessionId);

    const keepFileId = applyStrategy(strategy, files);
    insertGroup('md5', group.md5_checksum, files.map(f => f.id), keepFileId, group.total_size);
    totalGroups++;
    totalDuplicateFiles += files.length;
    if (onProgress) onProgress({ phase: 'md5', current: i + 1, total: md5Groups.length });
  }

  logger.info(`MD5 phase: ${md5Groups.length} duplicate groups found`);

  // Phase 2: Name+Size for Google native files
  if (includeNative) {
    logger.info('Phase 2: Finding name+size duplicates for Google native files...');
    const nameSizeGroups = db.prepare(`
      SELECT name, size, COUNT(*) as cnt
      FROM files
      WHERE is_google_native = 1
        AND md5_checksum IS NULL
        AND trashed = 0
        AND scan_session_id = ?
      GROUP BY name, size
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `).all(sessionId);

    if (onProgress) onProgress({ phase: 'name_size', current: 0, total: nameSizeGroups.length });

    for (let i = 0; i < nameSizeGroups.length; i++) {
      const group = nameSizeGroups[i];
      const files = db.prepare(`
        SELECT id, name, size, created_time, modified_time, full_path
        FROM files
        WHERE name = ? AND (size = ? OR (size IS NULL AND ? IS NULL))
          AND is_google_native = 1
          AND scan_session_id = ? AND trashed = 0
        ORDER BY created_time ASC
      `).all(group.name, group.size, group.size, sessionId);

      const matchKey = `${group.name}|${group.size || 0}`;
      const keepFileId = applyStrategy(strategy, files);
      insertGroup('name_size', matchKey, files.map(f => f.id), keepFileId, 0);
      totalGroups++;
      totalDuplicateFiles += files.length;
      if (onProgress) onProgress({ phase: 'name_size', current: i + 1, total: nameSizeGroups.length });
    }

    logger.info(`Name+size phase: ${nameSizeGroups.length} duplicate groups found`);
  }

  return { totalGroups, totalDuplicateFiles };
}
