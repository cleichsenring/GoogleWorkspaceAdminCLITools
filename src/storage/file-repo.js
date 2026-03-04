import { getDb } from './db.js';

export function insertFileBatch(files, sessionId) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO files
      (id, scan_session_id, name, mime_type, size, quota_bytes_used, md5_checksum, parent_id, created_time, modified_time, web_view_link, owners, trashed, is_google_native)
    VALUES
      (@id, @scanSessionId, @name, @mimeType, @size, @quotaBytesUsed, @md5Checksum, @parentId, @createdTime, @modifiedTime, @webViewLink, @owners, @trashed, @isGoogleNative)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      stmt.run(row);
    }
  });

  const mapped = files.map(f => ({
    id: f.id,
    scanSessionId: sessionId,
    name: f.name,
    mimeType: f.mimeType,
    size: Number(f.size) || null,
    quotaBytesUsed: Number(f.quotaBytesUsed) || null,
    md5Checksum: f.md5Checksum || null,
    parentId: f.parents?.[0] || null,
    createdTime: f.createdTime || null,
    modifiedTime: f.modifiedTime || null,
    webViewLink: f.webViewLink || null,
    owners: f.owners ? JSON.stringify(f.owners.map(o => o.emailAddress)) : null,
    trashed: f.trashed ? 1 : 0,
    isGoogleNative: f.mimeType?.startsWith('application/vnd.google-apps.') ? 1 : 0,
  }));

  insertMany(mapped);
  return mapped.length;
}

export function getFileById(fileId) {
  const db = getDb();
  return db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
}

export function getFilesByMd5(md5) {
  const db = getDb();
  return db.prepare('SELECT * FROM files WHERE md5_checksum = ?').all(md5);
}

export function updateFilePath(fileId, fullPath) {
  const db = getDb();
  db.prepare('UPDATE files SET full_path = ? WHERE id = ?').run(fullPath, fileId);
}

export function updateFilePathsBatch(updates) {
  const db = getDb();
  const stmt = db.prepare('UPDATE files SET full_path = ? WHERE id = ?');
  const runBatch = db.transaction((rows) => {
    for (const { id, fullPath } of rows) {
      stmt.run(fullPath, id);
    }
  });
  runBatch(updates);
}

export function getDistinctParentIds(sessionId) {
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT parent_id FROM files
    WHERE scan_session_id = ? AND parent_id IS NOT NULL
  `).all(sessionId).map(r => r.parent_id);
}

export function getFileCount(sessionId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM files WHERE scan_session_id = ?').get(sessionId).count;
}

export function getAllFiles(sessionId) {
  const db = getDb();
  return db.prepare('SELECT * FROM files WHERE scan_session_id = ? AND trashed = 0').all(sessionId);
}
