import PQueue from 'p-queue';
import { getConfig } from './config.js';

export function createDriveQueue(overrides = {}) {
  const config = getConfig();
  const defaults = config.drive.rateLimiting;

  return new PQueue({
    concurrency: overrides.concurrency ?? defaults.concurrency,
    intervalCap: overrides.intervalCap ?? defaults.intervalCap,
    interval: overrides.interval ?? defaults.interval,
    carryoverConcurrencyCount: true,
  });
}
