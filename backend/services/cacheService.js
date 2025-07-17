import redisService from './redisService.js';
import stickyService from './stickyService.js';
import CachedData from '../models/CachedData.js';

// Cache TTL configurations (in seconds)
const CACHE_TTL = {
  REDIS_ANALYTICS: 15 * 60,
  REDIS_PRODUCTS: 30 * 60,
  REDIS_REVENUE: 20 * 60,
  
  MONGODB_PRODUCTS: 6 * 60 * 60,
  MONGODB_REVENUE: 4 * 60 * 60,
  MONGODB_ANALYTICS: 8 * 60 * 60
};

// Get products with multi-layer caching
const getProductsWithCache = async () => {
  const cacheKey = 'sticky_products';
  
  try {
    //Check Redis first
    console.log('Checking Redis for products...');
    const redisData = await redisService.get(cacheKey);
    if (redisData) {
      console.log('Products found in Redis cache');
      return redisData;
    }

    //Check MongoDB
    console.log('Redis miss, checking MongoDB for products...');
    const mongoDoc = await CachedData.findOne({ 
      cacheKey,
      cacheType: 'sticky_products',
      expiresAt: { $gt: new Date() }
    });

    if (mongoDoc && !CachedData.isExpired(mongoDoc)) {
      console.log('Products found in MongoDB cache');
      // Store in Redis for next time
      await redisService.set(cacheKey, mongoDoc.data, CACHE_TTL.REDIS_PRODUCTS);
      return mongoDoc.data;
    }

    //Fetch from Sticky.io API
    console.log('MongoDB miss, fetching fresh products from Sticky.io...');
    const freshData = await stickyService.fetchProducts();
    
    // Store in both MongoDB and Redis
    const expiresAt = new Date(Date.now() + CACHE_TTL.MONGODB_PRODUCTS * 1000);
    
    await CachedData.findOneAndUpdate(
      { cacheKey, cacheType: 'sticky_products' },
      {
        cacheKey,
        cacheType: 'sticky_products',
        data: freshData,
        expiresAt,
        metadata: {
          dateRange: '5 days',
          version: '1.0'
        }
      },
      { upsert: true, new: true }
    );

    await redisService.set(cacheKey, freshData, CACHE_TTL.REDIS_PRODUCTS);
    
    console.log('Fresh products cached in both MongoDB and Redis');
    return freshData;
    
  } catch (error) {
    console.error('Error in getProductsWithCache:', error);
    throw error;
  }
};

// Get product revenue with multi-layer caching
const getProductRevenueWithCache = async (productId) => {
  const cacheKey = `product_revenue_${productId}`;
  
  try {
    //Check Redis
    console.log(`Checking Redis for product ${productId} revenue...`);
    const redisData = await redisService.get(cacheKey);
    if (redisData) {
      console.log(`Product ${productId} revenue found in Redis cache`);
      return redisData;
    }

    //Check MongoDB
    console.log(`Redis miss, checking MongoDB for product ${productId} revenue...`);
    const mongoDoc = await CachedData.findOne({
      cacheKey,
      cacheType: 'sticky_revenue',
      expiresAt: { $gt: new Date() }
    });

    if (mongoDoc && !CachedData.isExpired(mongoDoc)) {
      console.log(`Product ${productId} revenue found in MongoDB cache`);
      await redisService.set(cacheKey, mongoDoc.data, CACHE_TTL.REDIS_REVENUE);
      return mongoDoc.data;
    }

    //Fetch from Sticky.io API
    console.log(`MongoDB miss, fetching fresh revenue for product ${productId}...`);
    const freshData = await stickyService.fetchProductRevenue(productId);
    
    // Store in both caches
    const expiresAt = new Date(Date.now() + CACHE_TTL.MONGODB_REVENUE * 1000);
    
    await CachedData.findOneAndUpdate(
      { cacheKey, cacheType: 'sticky_revenue' },
      {
        cacheKey,
        cacheType: 'sticky_revenue', 
        data: freshData,
        expiresAt,
        metadata: {
          productId,
          dateRange: freshData.dateRange || '5 days',
          version: '1.0'
        }
      },
      { upsert: true, new: true }
    );

    await redisService.set(cacheKey, freshData, CACHE_TTL.REDIS_REVENUE);
    
    console.log(`Fresh revenue for product ${productId} cached in both layers`);
    return freshData;
    
  } catch (error) {
    console.error(`Error in getProductRevenueWithCache for ${productId}:`, error);
    throw error;
  }
};

// Cache analytics summary
const cacheAnalyticsSummary = async (summaryData) => {
  const cacheKey = 'analytics_summary';
  
  try {
    // Store in Redis
    await redisService.set(cacheKey, summaryData, CACHE_TTL.REDIS_ANALYTICS);
    
    // Store in MongoDB
    const expiresAt = new Date(Date.now() + CACHE_TTL.MONGODB_ANALYTICS * 1000);
    
    await CachedData.findOneAndUpdate(
      { cacheKey, cacheType: 'analytics_summary' },
      {
        cacheKey,
        cacheType: 'analytics_summary',
        data: summaryData,
        expiresAt,
        metadata: {
          generatedAt: new Date(),
          version: '1.0'
        }
      },
      { upsert: true, new: true }
    );
    
    console.log('Analytics summary cached in both layers');
    return true;
    
  } catch (error) {
    console.error('Error caching analytics summary:', error);
    return false;
  }
};


const getAnalyticsSummaryWithCache = async () => {
  const cacheKey = 'analytics_summary';
  
  try {
    
    console.log('Checking Redis for analytics summary...');
    const redisData = await redisService.get(cacheKey);
    if (redisData) {
      console.log('Analytics summary found in Redis cache');
      return redisData;
    }

    
    console.log('Redis miss, checking MongoDB for analytics summary...');
    const mongoDoc = await CachedData.findOne({
      cacheKey,
      cacheType: 'analytics_summary',
      expiresAt: { $gt: new Date() }
    });

    if (mongoDoc && !CachedData.isExpired(mongoDoc)) {
      console.log('Analytics summary found in MongoDB cache');
      await redisService.set(cacheKey, mongoDoc.data, CACHE_TTL.REDIS_ANALYTICS);
      return mongoDoc.data;
    }

    console.log('No cached analytics summary found');
    return null;
    
  } catch (error) {
    console.error('Error in getAnalyticsSummaryWithCache:', error);
    return null;
  }
};

// Invalidate cache on manual sync
const invalidateCacheOnSync = async () => {
  try {
    console.log('Invalidating all cache layers due to manual sync...');
    
    // Clear Redis patterns
    await redisService.clearPattern('sticky_*');
    await redisService.clearPattern('product_*');
    await redisService.clearPattern('analytics_*');
    
    // Clear MongoDB cache (mark as expired)
    await CachedData.updateMany(
      { 
        cacheType: { $in: ['sticky_products', 'sticky_revenue', 'analytics_summary'] }
      },
      { 
        expiresAt: new Date() // Mark as expired
      }
    );
    
    console.log('Cache invalidation completed');
    return true;
    
  } catch (error) {
    console.error('Error invalidating cache:', error);
    return false;
  }
};

const getCacheStats = async () => {
  try {
    const redisStats = await redisService.getStats();
    
    const mongoStats = await CachedData.aggregate([
      {
        $group: {
          _id: '$cacheType',
          count: { $sum: 1 },
          latestUpdate: { $max: '$createdAt' }
        }
      }
    ]);
    
    const expiredCount = await CachedData.countDocuments({
      expiresAt: { $lt: new Date() }
    });
    
    return {
      redis: redisStats,
      mongodb: {
        totalDocuments: await CachedData.countDocuments(),
        expiredDocuments: expiredCount,
        byType: mongoStats
      }
    };
    
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return null;
  }
};

export default {
  getProductsWithCache,
  getProductRevenueWithCache,
  cacheAnalyticsSummary,
  getAnalyticsSummaryWithCache,
  invalidateCacheOnSync,
  getCacheStats,
  CACHE_TTL
};