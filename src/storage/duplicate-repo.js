import { getDb } from './db.js';

export function clearGroups() {
  const db = getDb();
  db.exec('DELETE FROM duplicate_members');
  db.exec('DELETE FROM duplicate_groups');
}

export function insertGroup(matchType, matchKey, fileIds, keepFileId, totalSize) {
  const db = getDb();
  const fileSize = totalSize || 0;
  const fileCount = fileIds.length;
  const singleFileSize = Math.floor(fileSize / fileCount) || 0;
  const recoverableSize = singleFileSize * (fileCount - 1);

  const groupResult = db.prepare(`
    INSERT INTO duplicate_groups (match_type, match_key, file_count, total_size, recoverable_size)
    VALUES (?, ?, ?, ?, ?)
  `).run(matchType, matchKey, fileCount, fileSize, recoverableSize);

  const groupId = groupResult.lastInsertRowid;

  const stmt = db.prepare(`
    INSERT INTO duplicate_members (group_id, file_id, action, action_reason)
    VALUES (?, ?, ?, ?)
  `);

  const insertMembers = db.transaction((ids) => {
    for (const fileId of ids) {
      const action = fileId === keepFileId ? 'keep' : 'delete';
      const reason = fileId === keepFileId ? 'strategy' : 'strategy';
      stmt.run(groupId, fileId, action, reason);
    }
  });

  insertMembers(fileIds);
  return groupId;
}

export function getGroups(filter = 'all') {
  const db = getDb();
  let query = 'SELECT * FROM duplicate_groups';
  const params = [];

  if (filter === 'md5') {
    query += ' WHERE match_type = ?';
    params.push('md5');
  } else if (filter === 'name_size') {
    query += ' WHERE match_type = ?';
    params.push('name_size');
  } else if (filter === 'unreviewed') {
    query += ' WHERE reviewed = 0';
  }

  query += ' ORDER BY recoverable_size DESC';
  return db.prepare(query).all(...params);
}

export function getGroupMembers(groupId) {
  const db = getDb();
  return db.prepare(`
    SELECT dm.*, f.name, f.full_path, f.size, f.quota_bytes_used, f.md5_checksum, f.mime_type,
           f.created_time, f.modified_time, f.web_view_link, f.owners
    FROM duplicate_members dm
    JOIN files f ON dm.file_id = f.id
    WHERE dm.group_id = ?
    ORDER BY f.created_time ASC
  `).all(groupId);
}

export function updateMemberAction(memberId, action, reason) {
  const db = getDb();
  db.prepare(`
    UPDATE duplicate_members SET action = ?, action_reason = ? WHERE id = ?
  `).run(action, reason, memberId);
}

export function markGroupReviewed(groupId) {
  const db = getDb();
  db.prepare('UPDATE duplicate_groups SET reviewed = 1 WHERE id = ?').run(groupId);
}

/**
 * Bulk-mark duplicate groups shared between two folders.
 * Files in keepFolder get action='keep', files in deleteFolder get action='delete'.
 * Groups that span both folders are marked as reviewed.
 * Returns { groupsUpdated, filesMarkedForDeletion }.
 */
export function bulkMarkFolderDuplicates(keepFolder, deleteFolder) {
  const db = getDb();

  // Find all duplicate groups with members in both folders
  const sharedGroups = db.prepare(`
    SELECT DISTINCT dm1.group_id
    FROM duplicate_members dm1
    JOIN files f1 ON dm1.file_id = f1.id
    JOIN duplicate_members dm2 ON dm2.group_id = dm1.group_id
    JOIN files f2 ON dm2.file_id = f2.id
    WHERE f1.full_path = ? AND f2.full_path = ?
      AND dm1.file_id != dm2.file_id
  `).all(keepFolder, deleteFolder);

  const groupIds = sharedGroups.map(g => g.group_id);
  if (groupIds.length === 0) return { groupsUpdated: 0, filesMarkedForDeletion: 0 };

  const updateKeep = db.prepare(`
    UPDATE duplicate_members SET action = 'keep', action_reason = 'folder-review'
    WHERE group_id = ? AND file_id IN (SELECT id FROM files WHERE full_path = ?)
  `);

  const updateDelete = db.prepare(`
    UPDATE duplicate_members SET action = 'delete', action_reason = 'folder-review'
    WHERE group_id = ? AND file_id IN (SELECT id FROM files WHERE full_path = ?)
  `);

  const markReviewed = db.prepare('UPDATE duplicate_groups SET reviewed = 1 WHERE id = ?');

  let filesMarkedForDeletion = 0;

  const bulkUpdate = db.transaction(() => {
    for (const groupId of groupIds) {
      updateKeep.run(groupId, keepFolder);
      const result = updateDelete.run(groupId, deleteFolder);
      filesMarkedForDeletion += result.changes;
      markReviewed.run(groupId);
    }
  });

  bulkUpdate();

  return { groupsUpdated: groupIds.length, filesMarkedForDeletion };
}

export function getApprovedDeletions() {
  const db = getDb();
  return db.prepare(`
    SELECT dm.*, f.name as file_name, f.full_path, f.size, f.web_view_link
    FROM duplicate_members dm
    JOIN files f ON dm.file_id = f.id
    WHERE dm.action = 'delete'
  `).all();
}

export function getStats() {
  const db = getDb();
  const groups = db.prepare('SELECT COUNT(*) as count FROM duplicate_groups').get();
  const members = db.prepare('SELECT COUNT(*) as count FROM duplicate_members').get();
  const deletions = db.prepare("SELECT COUNT(*) as count FROM duplicate_members WHERE action = 'delete'").get();
  const reviewed = db.prepare('SELECT COUNT(*) as count FROM duplicate_groups WHERE reviewed = 1').get();
  const recoverableSize = db.prepare('SELECT COALESCE(SUM(recoverable_size), 0) as total FROM duplicate_groups').get();
  const byType = db.prepare(`
    SELECT match_type, COUNT(*) as count, SUM(recoverable_size) as recoverable
    FROM duplicate_groups GROUP BY match_type
  `).all();

  return {
    totalGroups: groups.count,
    totalMembers: members.count,
    markedForDeletion: deletions.count,
    reviewedGroups: reviewed.count,
    recoverableSize: recoverableSize.total,
    byType,
  };
}
