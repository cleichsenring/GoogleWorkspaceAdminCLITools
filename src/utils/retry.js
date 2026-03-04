import { getConfig } from './config.js';
import { getLogger } from './logger.js';

export async function withRetry(fn, overrides = {}) {
  const config = getConfig();
  const logger = getLogger();
  const {
    maxRetries = config.retry.maxRetries,
    baseDelay = config.retry.baseDelay,
    maxDelay = config.retry.maxDelay,
  } = overrides;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.code || error?.response?.status;
      const isRateLimit = status === 403 || status === 429;
      const isServerError = status === 500 || status === 503;

      if (attempt === maxRetries || (!isRateLimit && !isServerError)) {
        throw error;
      }

      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const jitter = Math.random() * 1000;
      const wait = delay + jitter;

      logger.warn(`API error (${status}), retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}
