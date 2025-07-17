import { Worker } from 'bullmq';
import Product from '../models/Product.js';
import cacheService from '../services/cacheService.js';

const getRedisConfig = () => ({
  host: process.env.BULLMQ_REDIS_HOST || 'localhost',
  port: process.env.BULLMQ_REDIS_PORT || 6379,
  password: process.env.BULLMQ_REDIS_PASSWORD || process.env.REDIS_PASSWORD
});


const processAnalyticsJob = async (job) => {
  try {
    console.log(`Starting simple analytics job: ${job.id}`);
    
    
    const products = await Product.find({ isActive: true });
    console.log(`Calculating analytics for ${products.length} products...`);
    
    
    const totalRevenue = products.reduce((sum, p) => sum + (p.totalRevenue || 0), 0);
    const totalOrders = products.reduce((sum, p) => sum + (p.totalOrders || 0), 0);
    
    const simpleAnalytics = {
      totalProducts: products.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      averageRevenue: products.length > 0 ? Math.round((totalRevenue / products.length) * 100) / 100 : 0,
      generatedAt: new Date().toISOString()
    };
    
    
    await cacheService.cacheAnalyticsSummary(simpleAnalytics);
    
    console.log(`Simple analytics completed:`, {
      products: simpleAnalytics.totalProducts,
      revenue: simpleAnalytics.totalRevenue
    });
    
    return {
      success: true,
      message: 'Simple analytics completed',
      data: simpleAnalytics
    };
    
  } catch (error) {
    console.error('Error in analytics job:', error);
    throw error;
  }
};


const createAnalyticsWorker = () => {
  const worker = new Worker('analytics', processAnalyticsJob, {
    connection: getRedisConfig()
  });

  worker.on('completed', (job, result) => {
    console.log(`Analytics job ${job.id} completed: ${result.data.totalProducts} products`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Analytics job ${job.id} failed:`, err.message);
  });

  console.log('Analytics worker started');
  return worker;
};

export default createAnalyticsWorker;