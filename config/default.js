export default {
  drive: {
    pageSize: 1000,
    rateLimiting: {
      concurrency: 1,
      intervalCap: 10,
      interval: 1000,
    },
    pathResolution: {
      concurrency: 5,
    },
    deletion: {
      batchSize: 50,
      concurrency: 5,
    },
  },
  retry: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 32000,
  },
  analysis: {
    defaultStrategy: 'oldest-created',
    includeGoogleNative: true,
    minFileSize: 0,
  },
  storage: {
    dbPath: 'data/scan.db',
    reportsDir: 'data/reports',
  },
  logging: {
    level: 'info',
    file: 'data/gws-tools.log',
  },
};
