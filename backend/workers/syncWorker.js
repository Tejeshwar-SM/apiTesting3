import { Worker } from 'bullmq';
import Product from '../models/Product.js';
import stickyService from '../services/stickyService.js';

const getRedisConfig = () => ({
  host: process.env.BULLMQ_REDIS_HOST || 'localhost',
  port: process.env.BULLMQ_REDIS_PORT || 6379,
  password: process.env.BULLMQ_REDIS_PASSWORD || process.env.REDIS_PASSWORD
});


const processSyncJob = async (job) => {
  try {
    console.log(`Starting simple sync job: ${job.id}`);
    
    const targetProducts = stickyService.getTargetProducts();
    console.log(`Syncing ${targetProducts.length} products...`);
    
    const stickyProducts = await stickyService.fetchProducts();
    let updatedCount = 0;
    
    for (const productId of targetProducts) {
      const productData = stickyProducts[productId];
      if (productData) {
        await Product.findOneAndUpdate(
          { product_id: productId },
          {
            name: productData.product_name || 'Unknown Product',
            sku: productData.product_sku || 'NO-SKU',
            price: parseFloat(productData.product_price || 0),
            lastUpdated: new Date(),
            isActive: true
          },
          { upsert: true }
        );
        updatedCount++;
        console.log(`Updated product: ${productData.product_name}`);
      }
    }
    
    console.log(`Simple sync completed: ${updatedCount} products updated`);
    
    return {
      success: true,
      message: 'Simple sync completed',
      updatedCount
    };
    
  } catch (error) {
    console.error('Error in sync job:', error);
    throw error;
  }
};

const createSyncWorker = () => {
  const worker = new Worker('product-sync', processSyncJob, {
    connection: getRedisConfig()
  });

  worker.on('completed', (job, result) => {
    console.log(`Sync job ${job.id} completed: ${result.updatedCount} products`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Sync job ${job.id} failed:`, err.message);
  });

  console.log('Sync worker started');
  return worker;
};

export default createSyncWorker;