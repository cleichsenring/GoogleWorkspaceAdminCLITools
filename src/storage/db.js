import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../utils/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let db;

export function getDb() {
  if (db) return db;

  const config = getConfig();
  const dbPath = config.storage.dbPath;
  const dir = dirname(dbPath);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // Run schema
  const schemaPath = resolve(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // Migrations
  runMigrations(db);

  return db;
}

function runMigrations(db) {
  // Add quota_bytes_used column if missing (separates storage size from file size)
  const cols = db.prepare("PRAGMA table_info(files)").all();
  if (!cols.find(c => c.name === 'quota_bytes_used')) {
    db.exec('ALTER TABLE files ADD COLUMN quota_bytes_used INTEGER');
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
