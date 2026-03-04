import { existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';
import defaults from '../../config/default.js';

let config;

export function getConfig() {
  if (config) return config;

  // Load .env if it exists
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  const dataDir = process.env.GWS_DATA_DIR || defaults.storage.dbPath.split('/')[0];

  config = {
    ...defaults,
    driveId: process.env.GWS_DRIVE_ID || null,
    storage: {
      dbPath: resolve(dataDir, 'scan.db'),
      reportsDir: resolve(dataDir, 'reports'),
    },
    logging: {
      level: process.env.GWS_LOG_LEVEL || defaults.logging.level,
      file: resolve(dataDir, 'gws-tools.log'),
    },
  };

  return config;
}

export function setDriveId(driveId) {
  const cfg = getConfig();
  cfg.driveId = driveId;
}
