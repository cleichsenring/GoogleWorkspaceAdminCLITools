import { writeFileSync } from 'fs';
import { getDb } from '../storage/db.js';
import { getGroups, getGroupMembers, getStats } from '../storage/duplicate-repo.js';

export function writeJsonReport(outputPath, { onProgress } = {}) {
  const groups = getGroups();
  const stats = getStats();

  if (onProgress) onProgress({ current: 0, total: groups.length });

  const groupsWithMembers = [];
  for (let i = 0; i < groups.length; i++) {
    groupsWithMembers.push({
      ...groups[i],
      members: getGroupMembers(groups[i].id),
    });
    if (onProgress) onProgress({ current: i + 1, total: groups.length });
  }

  const report = {
    generated_at: new Date().toISOString(),
    summary: stats,
    groups: groupsWithMembers,
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
}
