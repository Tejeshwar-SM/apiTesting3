import { Worker } from 'bullmq';
import cacheService from '../services/cacheService.js';
import stickyService from '../services/stickyService.js';

const getRedisConfig = () => ({
  host: process.env.BULLMQ_REDIS_HOST || 'localhost',
  port: process.env.BULLMQ_REDIS_PORT || 6379,
  password: process.env.BULLMQ_REDIS_PASSWORD || process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3
});

const processCacheWarmingJob = async (job) => {
  const { data } = job;
  const { cacheKeys = [], type = 'manual' } = data;
  
  let warmingResults = {
    startTime: new Date(),
    warmedKeys: [],
    failedKeys: [],
    totalProcessed: 0
  };

  try {
    console.log(`Starting cache warming job: ${job.id} for keys:`, cacheKeys);
    await job.updateProgress(5);

    if (cacheKeys.length === 0) {
      console.log('No cache keys specified, warming default keys');
      cacheKeys.push('sticky_products', 'analytics_summary');
    }

    const totalKeys = cacheKeys.length;
    let processedKeys = 0;

    for (const cacheKey of cacheKeys) {
      try {
        console.log(`Warming cache for key: ${cacheKey}`);

        switch (cacheKey) {
          case 'sticky_products':
            console.log('Warming products cache...');
            const products = await cacheService.getProductsWithCache();
            if (products && Object.keys(products).length > 0) {
              warmingResults.warmedKeys.push({
                key: cacheKey,
                count: Object.keys(products).length,
                status: 'success'
              });
              console.log(`Products cache warmed: ${Object.keys(products).length} products`);
            } else {
              throw new Error('No products data received');
            }
            break;

          case 'analytics_summary':
            console.log('Warming analytics cache...');
            const analytics = await cacheService.getAnalyticsSummaryWithCache();
            if (analytics) {
              warmingResults.warmedKeys.push({
                key: cacheKey,
                status: 'success'
              });
              console.log('Analytics cache warmed successfully');
            } else {
              console.log('No cached analytics found, cache will be populated on next request');
              warmingResults.warmedKeys.push({
                key: cacheKey,
                status: 'no_data'
              });
            }
            break;

          case 'product_revenue':
            console.log('Warming product revenue caches...');
            const targetProducts = stickyService.getTargetProducts();
            let revenueWarmed = 0;
            
            for (const productId of targetProducts) {
              try {
                const revenue = await cacheService.getProductRevenueWithCache(productId);
                if (revenue) {
                  revenueWarmed++;
                }
              } catch (revError) {
                console.warn(`Failed to warm revenue cache for product ${productId}:`, revError.message);
              }
            }
            
            warmingResults.warmedKeys.push({
              key: cacheKey,
              count: revenueWarmed,
              total: targetProducts.length,
              status: 'success'
            });
            console.log(`Revenue cache warmed for ${revenueWarmed}/${targetProducts.length} products`);
            break;

          default:
            console.warn(`Unknown cache key: ${cacheKey}`);
            warmingResults.failedKeys.push({
              key: cacheKey,
              error: 'Unknown cache key'
            });
        }

        processedKeys++;
        const progress = 5 + Math.round((processedKeys / totalKeys) * 85);
        await job.updateProgress(progress);

      } catch (keyError) {
        console.error(`Failed to warm cache for key ${cacheKey}:`, keyError.message);
        warmingResults.failedKeys.push({
          key: cacheKey,
          error: keyError.message
        });
        processedKeys++;
      }
    }

    await job.updateProgress(95);

    warmingResults.endTime = new Date();
    warmingResults.duration = warmingResults.endTime - warmingResults.startTime;
    warmingResults.totalProcessed = warmingResults.warmedKeys.length + warmingResults.failedKeys.length;

    console.log(`Cache warming completed: ${warmingResults.warmedKeys.length} warmed, ${warmingResults.failedKeys.length} failed`);
    
    await job.updateProgress(100);

    return {
      success: true,
      message: 'Cache warming completed',
      type,
      stats: {
        warmedKeys: warmingResults.warmedKeys.length,
        failedKeys: warmingResults.failedKeys.length,
        totalProcessed: warmingResults.totalProcessed,
        duration: `${Math.round(warmingResults.duration / 1000)}s`
      },
      details: {
        warmed: warmingResults.warmedKeys,
        failed: warmingResults.failedKeys.length > 0 ? warmingResults.failedKeys : undefined
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error in cache warming job:', error);
    throw error;
  }
};

const createCacheWorker = () => {
  const worker = new Worker('cache-warming', processCacheWarmingJob, {
    connection: getRedisConfig(),
    concurrency: parseInt(process.env.BULLMQ_CONCURRENCY) || 1,
    removeOnComplete: 3,
    removeOnFail: 2
  });

  worker.on('completed', (job, result) => {
    console.log(`Cache warming job ${job.id} completed:`, {
      warmed: result.stats?.warmedKeys,
      failed: result.stats?.failedKeys,
      duration: result.stats?.duration
    });
  });

  worker.on('failed', (job, err) => {
    console.error(`Cache warming job ${job.id} failed:`, err.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`Cache warming job ${job.id} progress: ${progress}%`);
  });

  console.log('Cache warming worker started');
  return worker;
};

export default createCacheWorker;