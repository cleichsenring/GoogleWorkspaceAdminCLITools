import { getDb } from '../storage/db.js';
import { formatBytes } from '../utils/progress.js';

export function computeStats(sessionId) {
  const db = getDb();

  const totalFiles = db.prepare(
    'SELECT COUNT(*) as count FROM files WHERE scan_session_id = ? AND trashed = 0'
  ).get(sessionId);

  const totalSize = db.prepare(
    'SELECT COALESCE(SUM(COALESCE(quota_bytes_used, size)), 0) as total FROM files WHERE scan_session_id = ? AND trashed = 0'
  ).get(sessionId);

  const groups = db.prepare('SELECT COUNT(*) as count FROM duplicate_groups').get();

  const byType = db.prepare(`
    SELECT match_type, COUNT(*) as groups, SUM(file_count) as files, SUM(recoverable_size) as recoverable
    FROM duplicate_groups GROUP BY match_type
  `).all();

  const duplicateFiles = db.prepare(
    'SELECT COUNT(*) as count FROM duplicate_members'
  ).get();

  const recoverableSize = db.prepare(
    'SELECT COALESCE(SUM(recoverable_size), 0) as total FROM duplicate_groups'
  ).get();

  const largestGroup = db.prepare(`
    SELECT dg.*, GROUP_CONCAT(f.name, ', ') as file_names
    FROM duplicate_groups dg
    JOIN duplicate_members dm ON dm.group_id = dg.id
    JOIN files f ON f.id = dm.file_id
    GROUP BY dg.id
    ORDER BY dg.recoverable_size DESC
    LIMIT 1
  `).get();

  return {
    totalFiles: totalFiles.count,
    totalSize: totalSize.total,
    totalSizeHuman: formatBytes(totalSize.total),
    duplicateGroups: groups.count,
    duplicateFiles: duplicateFiles.count,
    recoverableSize: recoverableSize.total,
    recoverableSizeHuman: formatBytes(recoverableSize.total),
    byType,
    largestGroup,
  };
}
