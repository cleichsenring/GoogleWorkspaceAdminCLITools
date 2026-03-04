import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import { resolve } from 'path';
import { saveTokens, loadTokens, tokensExist } from './token-store.js';
import { getLogger } from '../utils/logger.js';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const CREDENTIALS_PATH = resolve(process.cwd(), 'credentials.json');

export async function authorize() {
  const logger = getLogger();

  // Try loading existing tokens
  if (tokensExist()) {
    logger.debug('Loading saved tokens');
    const tokens = loadTokens();
    const credentials = JSON.parse(
      (await import('fs')).readFileSync(CREDENTIALS_PATH, 'utf8'),
    );
    const { client_id, client_secret } = credentials.installed || credentials.web;

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
    oauth2Client.setCredentials(tokens);

    // Set up automatic token refresh and save
    oauth2Client.on('tokens', (newTokens) => {
      logger.debug('Tokens refreshed, saving');
      const merged = { ...tokens, ...newTokens };
      saveTokens(merged);
    });

    return oauth2Client;
  }

  // First-time auth: open browser for consent
  logger.info('No saved tokens found. Opening browser for authorization...');
  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  if (client.credentials) {
    saveTokens(client.credentials);
    logger.info('Authorization successful. Tokens saved.');
  }

  return client;
}

export async function revokeTokens() {
  const logger = getLogger();
  if (!tokensExist()) {
    logger.info('No tokens to revoke.');
    return;
  }

  const tokens = loadTokens();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials(tokens);

  try {
    await oauth2Client.revokeCredentials();
    logger.info('Tokens revoked successfully.');
  } catch (error) {
    logger.warn('Failed to revoke tokens remotely:', error.message);
  }

  const { clearTokens } = await import('./token-store.js');
  clearTokens();
}
