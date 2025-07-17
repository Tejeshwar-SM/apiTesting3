import { Worker } from 'bullmq';
import CachedData from '../models/CachedData.js';
import redisService from '../services/redisService.js';

const getRedisConfig = () => ({
  host: process.env.BULLMQ_REDIS_HOST || 'localhost',
  port: process.env.BULLMQ_REDIS_PORT || 6379,
  password: process.env.BULLMQ_REDIS_PASSWORD || process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3
});

const processCleanupJob = async (job) => {
  const { data } = job;
  const { type = 'cache' } = data;
  
  let cleanupResults = {
    startTime: new Date(),
    type,
    operations: [],
    totalCleaned: 0
  };

  try {
    console.log(`Starting cleanup job: ${job.id} for type: ${type}`);
    await job.updateProgress(5);

    switch (type) {
      case 'cache':
        await performCacheCleanup(cleanupResults, job);
        break;
        
      case 'database':
        await performDatabaseCleanup(cleanupResults, job);
        break;
        
      case 'full':
        await performCacheCleanup(cleanupResults, job, 25);
        await performDatabaseCleanup(cleanupResults, job, 50);
        break;
        
      default:
        throw new Error(`Unknown cleanup type: ${type}`);
    }

    await job.updateProgress(95);

    cleanupResults.endTime = new Date();
    cleanupResults.duration = cleanupResults.endTime - cleanupResults.startTime;

    console.log(`Cleanup completed: ${cleanupResults.totalCleaned} items cleaned`);
    await job.updateProgress(100);

    return {
      success: true,
      message: 'Cleanup completed successfully',
      type,
      stats: {
        totalCleaned: cleanupResults.totalCleaned,
        operations: cleanupResults.operations.length,
        duration: `${Math.round(cleanupResults.duration / 1000)}s`
      },
      details: cleanupResults.operations,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in cleanup job:', error);
    throw error;
  }
};

const performCacheCleanup = async (results, job, maxProgress = 85) => {
  console.log('Starting cache cleanup...');
  
  try {
    const expiredCacheCount = await CachedData.countDocuments({
      expiresAt: { $lt: new Date() }
    });

    if (expiredCacheCount > 0) {
      const deleteResult = await CachedData.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      
      results.operations.push({
        operation: 'mongodb_expired_cache',
        itemsCleaned: deleteResult.deletedCount,
        status: 'success'
      });
      results.totalCleaned += deleteResult.deletedCount;
      console.log(`Cleaned ${deleteResult.deletedCount} expired MongoDB cache entries`);
    } else {
      results.operations.push({
        operation: 'mongodb_expired_cache',
        itemsCleaned: 0,
        status: 'no_items'
      });
      console.log('No expired MongoDB cache entries found');
    }

    await job.updateProgress(maxProgress * 0.5);

    const oldCacheDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oldCacheCount = await CachedData.countDocuments({
      createdAt: { $lt: oldCacheDate }
    });

    if (oldCacheCount > 0) {
      const deleteOldResult = await CachedData.deleteMany({
        createdAt: { $lt: oldCacheDate }
      });
      
      results.operations.push({
        operation: 'mongodb_old_cache',
        itemsCleaned: deleteOldResult.deletedCount,
        status: 'success'
      });
      results.totalCleaned += deleteOldResult.deletedCount;
      console.log(`Cleaned ${deleteOldResult.deletedCount} old MongoDB cache entries`);
    } else {
      results.operations.push({
        operation: 'mongodb_old_cache',
        itemsCleaned: 0,
        status: 'no_items'
      });
      console.log('No old MongoDB cache entries found');
    }

    await job.updateProgress(maxProgress);

  } catch (error) {
    console.error('Error in cache cleanup:', error);
    results.operations.push({
      operation: 'cache_cleanup',
      error: error.message,
      status: 'failed'
    });
  }
};

const performDatabaseCleanup = async (results, job, maxProgress = 85) => {
  console.log('Starting database cleanup...');
  
  try {
    const duplicateCleanup = await CachedData.aggregate([
      {
        $group: {
          _id: { cacheKey: '$cacheKey', cacheType: '$cacheType' },
          docs: { $push: '$_id' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    let duplicatesRemoved = 0;
    for (const group of duplicateCleanup) {
      const docsToRemove = group.docs.slice(1);
      if (docsToRemove.length > 0) {
        const deleteResult = await CachedData.deleteMany({
          _id: { $in: docsToRemove }
        });
        duplicatesRemoved += deleteResult.deletedCount;
      }
    }

    results.operations.push({
      operation: 'remove_duplicates',
      itemsCleaned: duplicatesRemoved,
      status: duplicatesRemoved > 0 ? 'success' : 'no_items'
    });
    results.totalCleaned += duplicatesRemoved;
    console.log(`Cleaned ${duplicatesRemoved} duplicate cache entries`);

    await job.updateProgress(maxProgress * 0.7);

    
    try {
      await CachedData.collection.reIndex();
      results.operations.push({
        operation: 'reindex_collection',
        status: 'success'
      });
      console.log('Database indexes optimized');
    } catch (indexError) {
      console.warn('Failed to reindex collection:', indexError.message);
      results.operations.push({
        operation: 'reindex_collection',
        error: indexError.message,
        status: 'failed'
      });
    }

    await job.updateProgress(maxProgress);

  } catch (error) {
    console.error('Error in database cleanup:', error);
    results.operations.push({
      operation: 'database_cleanup',
      error: error.message,
      status: 'failed'
    });
  }
};

const createCleanupWorker = () => {
  const worker = new Worker('cleanup', processCleanupJob, {
    connection: getRedisConfig(),
    concurrency: 1,
    removeOnComplete: 2,
    removeOnFail: 1
  });

  worker.on('completed', (job, result) => {
    console.log(`Cleanup job ${job.id} completed:`, {
      type: result.type,
      cleaned: result.stats?.totalCleaned,
      operations: result.stats?.operations,
      duration: result.stats?.duration
    });
  });

  worker.on('failed', (job, err) => {
    console.error(`Cleanup job ${job.id} failed:`, err.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`Cleanup job ${job.id} progress: ${progress}%`);
  });

  console.log('Cleanup worker started');
  return worker;
};

export default createCleanupWorker;