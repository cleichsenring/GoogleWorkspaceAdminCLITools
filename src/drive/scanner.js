import { getDriveClient } from './client.js';
import { withRetry } from '../utils/retry.js';
import { getLogger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';

export async function* scanDrive(driveId, startPageToken = null) {
  const drive = await getDriveClient();
  const logger = getLogger();
  const config = getConfig();
  let pageToken = startPageToken;
  let pageNum = 0;

  do {
    pageNum++;
    logger.debug(`Fetching page ${pageNum}${pageToken ? ' (with token)' : ''}`);

    const response = await withRetry(async () => {
      return drive.files.list({
        corpora: 'drive',
        driveId,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: config.drive.pageSize,
        pageToken: pageToken || undefined,
        q: 'trashed = false',
        fields: 'nextPageToken, files(id, name, mimeType, size, quotaBytesUsed, md5Checksum, parents, createdTime, modifiedTime, webViewLink, owners, trashed)',
      });
    });

    const files = response.data.files || [];
    pageToken = response.data.nextPageToken || null;

    logger.debug(`Page ${pageNum}: ${files.length} files, hasMore: ${!!pageToken}`);

    yield {
      files,
      nextPageToken: pageToken,
      pageNum,
    };
  } while (pageToken);
}
