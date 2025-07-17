import { Queue } from 'bullmq';


const getRedisConfig = () => ({
  host: process.env.BULLMQ_REDIS_HOST || 'localhost',
  port: process.env.BULLMQ_REDIS_PORT || 6379,
  password: process.env.BULLMQ_REDIS_PASSWORD || process.env.REDIS_PASSWORD
});


const queues = {};

const initializeQueues = () => {
  try {
    const redisConfig = getRedisConfig();
    
    // Create simple queues
    queues.sync = new Queue('product-sync', { connection: redisConfig });
    queues.analytics = new Queue('analytics', { connection: redisConfig });
    
    console.log('BullMQ queues initialized: product-sync, analytics');
    return true;
    
  } catch (error) {
    console.error('Error initializing queues:', error);
    return false;
  }
};


const addSyncJob = async () => {
  try {
    const job = await queues.sync.add('sync-products', {
      timestamp: new Date().toISOString()
    });
    
    console.log(`Sync job added: ${job.id}`);
    return { success: true, jobId: job.id };
    
  } catch (error) {
    console.error('Error adding sync job:', error);
    return { success: false, error: error.message };
  }
};


const addAnalyticsJob = async () => {
  try {
    const job = await queues.analytics.add('refresh-analytics', {
      timestamp: new Date().toISOString()
    });
    
    console.log(`Analytics job added: ${job.id}`);
    return { success: true, jobId: job.id };
    
  } catch (error) {
    console.error('Error adding analytics job:', error);
    return { success: false, error: error.message };
  }
};


const getQueueStats = async () => {
  try {
    const syncWaiting = await queues.sync.getWaiting();
    const syncActive = await queues.sync.getActive();
    const analyticsWaiting = await queues.analytics.getWaiting();
    const analyticsActive = await queues.analytics.getActive();
    
    return {
      success: true,
      stats: {
        sync: {
          waiting: syncWaiting.length,
          active: syncActive.length
        },
        analytics: {
          waiting: analyticsWaiting.length,
          active: analyticsActive.length
        }
      }
    };
    
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return { success: false, error: error.message };
  }
};

const closeQueues = async () => {
  try {
    await queues.sync?.close();
    await queues.analytics?.close();
    console.log('All queues closed');
    return true;
  } catch (error) {
    console.error('Error closing queues:', error);
    return false;
  }
};

export default {
  initializeQueues,
  addSyncJob,
  addAnalyticsJob,
  getQueueStats,
  closeQueues
};