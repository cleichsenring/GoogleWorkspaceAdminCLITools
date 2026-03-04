import { google } from 'googleapis';
import { authorize } from '../auth/oauth.js';

let driveClient = null;

export async function getDriveClient() {
  if (driveClient) return driveClient;

  const auth = await authorize();
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}
