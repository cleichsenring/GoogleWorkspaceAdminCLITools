CREATE TABLE IF NOT EXISTS scan_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_id        TEXT NOT NULL,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT,
  status          TEXT NOT NULL DEFAULT 'in_progress',
  next_page_token TEXT,
  total_files     INTEGER DEFAULT 0,
  last_error      TEXT
);

CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  scan_session_id INTEGER NOT NULL REFERENCES scan_sessions(id),
  name            TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size            INTEGER,
  quota_bytes_used INTEGER,
  md5_checksum    TEXT,
  parent_id       TEXT,
  full_path       TEXT,
  created_time    TEXT,
  modified_time   TEXT,
  web_view_link   TEXT,
  owners          TEXT,
  trashed         INTEGER DEFAULT 0,
  is_google_native INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_files_md5 ON files(md5_checksum) WHERE md5_checksum IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_name_size ON files(name, size) WHERE is_google_native = 1;
CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);
CREATE INDEX IF NOT EXISTS idx_files_session ON files(scan_session_id);

CREATE TABLE IF NOT EXISTS duplicate_groups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  match_type      TEXT NOT NULL,
  match_key       TEXT NOT NULL,
  file_count      INTEGER NOT NULL,
  total_size      INTEGER DEFAULT 0,
  recoverable_size INTEGER DEFAULT 0,
  reviewed        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dg_match ON duplicate_groups(match_type, match_key);

CREATE TABLE IF NOT EXISTS duplicate_members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id        INTEGER NOT NULL REFERENCES duplicate_groups(id),
  file_id         TEXT NOT NULL REFERENCES files(id),
  action          TEXT NOT NULL DEFAULT 'pending',
  action_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_dm_group ON duplicate_members(group_id);
CREATE INDEX IF NOT EXISTS idx_dm_file ON duplicate_members(file_id);
CREATE INDEX IF NOT EXISTS idx_dm_action ON duplicate_members(action);

CREATE TABLE IF NOT EXISTS deletion_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id         TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  action          TEXT NOT NULL,
  executed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  success         INTEGER NOT NULL,
  error_message   TEXT
);
