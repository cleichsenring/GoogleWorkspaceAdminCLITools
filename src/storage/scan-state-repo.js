import { getDb } from './db.js';

export function createSession(driveId) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO scan_sessions (drive_id) VALUES (?)
  `).run(driveId);
  return result.lastInsertRowid;
}

export function updateProgress(sessionId, pageToken, totalFiles) {
  const db = getDb();
  db.prepare(`
    UPDATE scan_sessions
    SET next_page_token = ?, total_files = ?
    WHERE id = ?
  `).run(pageToken, totalFiles, sessionId);
}

export function completeSession(sessionId) {
  const db = getDb();
  db.prepare(`
    UPDATE scan_sessions
    SET status = 'completed', completed_at = datetime('now'), next_page_token = NULL
    WHERE id = ?
  `).run(sessionId);
}

export function interruptSession(sessionId, error) {
  const db = getDb();
  db.prepare(`
    UPDATE scan_sessions
    SET status = 'interrupted', last_error = ?
    WHERE id = ?
  `).run(error || null, sessionId);
}

export function getLatestSession(driveId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM scan_sessions
    WHERE drive_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(driveId);
}

export function getInterruptedSession(driveId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM scan_sessions
    WHERE drive_id = ? AND status = 'interrupted'
    ORDER BY id DESC LIMIT 1
  `).get(driveId);
}

export function getCompletedSession(driveId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM scan_sessions
    WHERE drive_id = ? AND status = 'completed'
    ORDER BY id DESC LIMIT 1
  `).get(driveId);
}
