export function applyStrategy(strategyName, files) {
  const strategies = {
    'oldest-created': oldestCreated,
    'newest-modified': newestModified,
    'shallowest-path': shallowestPath,
    'manual': () => null, // Leave all as pending
  };

  const fn = strategies[strategyName];
  if (!fn) {
    throw new Error(`Unknown keep strategy: ${strategyName}. Valid: ${Object.keys(strategies).join(', ')}`);
  }

  return fn(files);
}

function oldestCreated(files) {
  return files.reduce((oldest, f) => {
    if (!oldest) return f;
    const oDate = oldest.created_time ? new Date(oldest.created_time) : new Date(0);
    const fDate = f.created_time ? new Date(f.created_time) : new Date(0);
    return fDate < oDate ? f : oldest;
  }, null)?.id || files[0]?.id;
}

function newestModified(files) {
  return files.reduce((newest, f) => {
    if (!newest) return f;
    const nDate = newest.modified_time ? new Date(newest.modified_time) : new Date(0);
    const fDate = f.modified_time ? new Date(f.modified_time) : new Date(0);
    return fDate > nDate ? f : newest;
  }, null)?.id || files[0]?.id;
}

function shallowestPath(files) {
  return files.reduce((shallowest, f) => {
    if (!shallowest) return f;
    const sDepth = (shallowest.full_path || '').split('/').length;
    const fDepth = (f.full_path || '').split('/').length;
    return fDepth < sDepth ? f : shallowest;
  }, null)?.id || files[0]?.id;
}
