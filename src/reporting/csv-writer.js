import { createWriteStream } from 'fs';
import { stringify } from 'csv-stringify';
import { getDb } from '../storage/db.js';

export async function writeCsvReport(outputPath, { onProgress } = {}) {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      dg.id as group_id,
      dg.match_type,
      dm.action,
      dm.file_id,
      f.name as file_name,
      f.full_path,
      f.size as size_bytes,
      f.quota_bytes_used as storage_bytes,
      f.md5_checksum,
      f.mime_type,
      f.created_time,
      f.modified_time,
      f.web_view_link,
      f.owners
    FROM duplicate_groups dg
    JOIN duplicate_members dm ON dm.group_id = dg.id
    JOIN files f ON f.id = dm.file_id
    ORDER BY dg.recoverable_size DESC, dg.id, dm.action DESC
  `).all();

  if (onProgress) onProgress({ current: 0, total: rows.length });

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const stringifier = stringify({
      header: true,
      columns: [
        'group_id', 'match_type', 'action', 'file_id', 'file_name',
        'full_path', 'size_bytes', 'storage_bytes', 'md5_checksum', 'mime_type',
        'created_time', 'modified_time', 'web_view_link', 'owners',
      ],
    });

    stringifier.pipe(output);

    for (let i = 0; i < rows.length; i++) {
      stringifier.write(rows[i]);
      if (onProgress) onProgress({ current: i + 1, total: rows.length });
    }

    stringifier.end();
    output.on('finish', resolve);
    output.on('error', reject);
  });
}
