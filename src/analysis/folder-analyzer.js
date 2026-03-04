import { createHash } from 'crypto';
import { getDb } from '../storage/db.js';

/**
 * Compute folder-pair overlap from existing duplicate groups.
 * For each duplicate group, finds members in different folders and
 * counts how many groups each folder pair shares.
 *
 * Uses JS-based aggregation instead of SQL self-join to handle
 * large datasets (40k+ members) efficiently.
 */
export function computeFolderOverlap(sessionId, { minShared = 3, onProgress } = {}) {
  const db = getDb();

  // Step 1: Get all duplicate members with their folder paths (single join, no self-join)
  const members = db.prepare(`
    SELECT dm.group_id, f.full_path
    FROM duplicate_members dm
    JOIN files f ON dm.file_id = f.id
    WHERE f.full_path IS NOT NULL AND f.scan_session_id = ?
    ORDER BY dm.group_id
  `).all(sessionId);

  // Step 2: Group by group_id, then generate folder pairs per group
  const pairCounts = new Map(); // "folderA\0folderB" -> count
  let currentGroupId = null;
  let currentFolders = [];

  if (onProgress) onProgress({ phase: 'overlap', current: 0, total: members.length });

  for (let i = 0; i < members.length; i++) {
    const m = members[i];

    if (m.group_id !== currentGroupId) {
      // Process previous group
      if (currentFolders.length > 0) {
        const uniqueFolders = [...new Set(currentFolders)].sort();
        for (let a = 0; a < uniqueFolders.length; a++) {
          for (let b = a + 1; b < uniqueFolders.length; b++) {
            const key = `${uniqueFolders[a]}\0${uniqueFolders[b]}`;
            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
          }
        }
      }
      currentGroupId = m.group_id;
      currentFolders = [];
    }

    currentFolders.push(m.full_path);

    if (onProgress && i % 5000 === 0) {
      onProgress({ phase: 'overlap', current: i, total: members.length });
    }
  }

  // Process last group
  if (currentFolders.length > 0) {
    const uniqueFolders = [...new Set(currentFolders)].sort();
    for (let a = 0; a < uniqueFolders.length; a++) {
      for (let b = a + 1; b < uniqueFolders.length; b++) {
        const key = `${uniqueFolders[a]}\0${uniqueFolders[b]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  if (onProgress) onProgress({ phase: 'overlap', current: members.length, total: members.length });

  // Step 3: Filter by minShared and sort
  const filteredPairs = [];
  for (const [key, count] of pairCounts) {
    if (count >= minShared) {
      const [folderA, folderB] = key.split('\0');
      filteredPairs.push({ folderA, folderB, sharedGroups: count });
    }
  }
  filteredPairs.sort((a, b) => b.sharedGroups - a.sharedGroups);

  if (filteredPairs.length === 0) return [];

  // Step 4: Get per-folder file counts and sizes
  const folderStats = new Map();
  const stats = db.prepare(`
    SELECT full_path, COUNT(*) as file_count, SUM(COALESCE(quota_bytes_used, size, 0)) as total_size
    FROM files
    WHERE scan_session_id = ? AND trashed = 0 AND full_path IS NOT NULL
    GROUP BY full_path
  `).all(sessionId);

  for (const s of stats) {
    folderStats.set(s.full_path, { fileCount: s.file_count, totalSize: s.total_size });
  }

  // Step 5: Enrich pairs with folder stats and overlap percentage
  return filteredPairs.map(p => {
    const statsA = folderStats.get(p.folderA) || { fileCount: 0, totalSize: 0 };
    const statsB = folderStats.get(p.folderB) || { fileCount: 0, totalSize: 0 };
    const smallerFolder = Math.min(statsA.fileCount, statsB.fileCount);
    const overlapPct = smallerFolder > 0 ? Math.round((p.sharedGroups / smallerFolder) * 100) : 0;

    return {
      ...p,
      filesA: statsA.fileCount,
      filesB: statsB.fileCount,
      sizeA: statsA.totalSize,
      sizeB: statsB.totalSize,
      overlapPct: Math.min(overlapPct, 100),
      recoverableSize: Math.min(statsA.totalSize, statsB.totalSize),
    };
  });
}

/**
 * Compute folder fingerprints by hashing sorted child file checksums.
 * Groups folders with identical fingerprints — these are exact copies.
 */
export function computeFolderFingerprints(sessionId, { onProgress } = {}) {
  const db = getDb();

  // Get all non-trashed files ordered by parent_id for grouping
  const files = db.prepare(`
    SELECT parent_id, full_path, name, md5_checksum, size
    FROM files
    WHERE scan_session_id = ? AND trashed = 0 AND parent_id IS NOT NULL
    ORDER BY parent_id, name
  `).all(sessionId);

  // Group files by parent_id
  const folders = new Map();
  for (const f of files) {
    if (!folders.has(f.parent_id)) {
      folders.set(f.parent_id, { path: f.full_path, files: [] });
    }
    folders.get(f.parent_id).files.push(f);
  }

  const folderEntries = Array.from(folders.entries());
  if (onProgress) onProgress({ phase: 'fingerprint', current: 0, total: folderEntries.length });

  // Compute fingerprint for each folder
  const fingerprintMap = new Map(); // hash -> [{ parentId, path, fileCount, totalSize }]

  for (let i = 0; i < folderEntries.length; i++) {
    const [parentId, folder] = folderEntries[i];
    const folderFiles = folder.files;

    // Skip single-file folders (not interesting for folder-level comparison)
    if (folderFiles.length < 2) {
      if (onProgress) onProgress({ phase: 'fingerprint', current: i + 1, total: folderEntries.length });
      continue;
    }

    // Build fingerprint: sorted entries of name:checksum (or name:size fallback)
    const entries = folderFiles.map(f => {
      const key = f.md5_checksum ? `${f.name}:${f.md5_checksum}` : `${f.name}:${f.size || 0}`;
      return key;
    });
    entries.sort();
    const fingerprint = createHash('sha256').update(entries.join('|')).digest('hex');

    const totalSize = folderFiles.reduce((sum, f) => sum + (f.size || 0), 0);

    if (!fingerprintMap.has(fingerprint)) {
      fingerprintMap.set(fingerprint, []);
    }
    fingerprintMap.get(fingerprint).push({
      parentId,
      path: folder.path || '(unresolved)',
      fileCount: folderFiles.length,
      totalSize,
    });

    if (onProgress) onProgress({ phase: 'fingerprint', current: i + 1, total: folderEntries.length });
  }

  // Filter to groups with >1 folder (actual duplicates)
  const duplicates = [];
  for (const [fingerprint, folderGroup] of fingerprintMap) {
    if (folderGroup.length > 1) {
      duplicates.push({
        fingerprint,
        fileCount: folderGroup[0].fileCount,
        totalSize: folderGroup[0].totalSize,
        folders: folderGroup.map(f => f.path).sort(),
      });
    }
  }

  // Sort by total size descending (biggest savings first)
  duplicates.sort((a, b) => (b.totalSize * (b.folders.length - 1)) - (a.totalSize * (a.folders.length - 1)));

  return duplicates;
}
