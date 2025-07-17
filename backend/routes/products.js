import express from 'express';
import Product from '../models/Product.js';
import stickyService from '../services/stickyService.js';
import cacheService from '../services/cacheService.js';

const router = express.Router();

router.use((req, res, next) => {
  console.log(`Products Route: ${req.method} ${req.path}`);
  next();
});

router.get('/test-sticky', async (req, res) => {
  try {
    console.log('Testing Sticky.io API connection with caching...');

    const testResult = await cacheService.getProductsWithCache();

    console.log('Test response received:', {
      productCount: Object.keys(testResult || {}).length,
      productIds: Object.keys(testResult || {})
    });

    res.json({
      success: true,
      message: 'Sticky.io API test successful with caching',
      data: {
        productCount: Object.keys(testResult || {}).length,
        productIds: Object.keys(testResult || {}),
        cacheEnabled: true,
        sampleResponse: testResult
      }
    });

  } catch (error) {
    console.error('Sticky.io test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Sticky.io API test failed',
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const targetProducts = stickyService.getTargetProducts();
    const products = await Product.find({
      product_id: { $in: targetProducts },
      isActive: true
    }).sort({ totalRevenue: -1 });

    console.log(`Returning ${products.length} products from database`);

    res.json({
      success: true,
      data: products,
      total: products.length,
      dateRange: '5 days',
      targetProducts: targetProducts,
      source: 'database',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

router.get('/find', async (req, res) => {
  try {
    const { ids } = req.query;

    if (!ids) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs are required. Use ?ids=1,2,3'
      });
    }

    const productIds = ids.split(',').map(id => id.trim());
    console.log(`Finding products by IDs:`, productIds);

    const products = await Product.find({
      product_id: { $in: productIds },
      isActive: true
    }).sort({ totalRevenue: -1 });

    res.json({
      success: true,
      data: products,
      total: products.length,
      searched: productIds,
      found: products.map(p => p.product_id),
      source: 'database',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error finding products:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding products',
      error: error.message
    });
  }
});

router.post('/sync', async (req, res) => {
  try {
    console.log('Starting optimized sync with cache invalidation...');

    // Clear all cache before sync
    await cacheService.invalidateCacheOnSync();

    // Fetch fresh data (this will now cache automatically)
    const stickyProducts = await cacheService.getProductsWithCache();
    const targetProducts = stickyService.getTargetProducts();

    let syncedCount = 0;
    let updatedCount = 0;
    let processedProducts = [];
    let errors = [];
    let skippedCount = 0;

    console.log(`Processing ${Object.keys(stickyProducts).length} products from cache`);
    console.log(`Target products: ${targetProducts.join(', ')}`);

    for (const [productId, productData] of Object.entries(stickyProducts)) {
      if (!targetProducts.includes(productId)) {
        console.log(`Skipping product ${productId} - not in target list`);
        skippedCount++;
        continue;
      }

      try {
        console.log(`Processing target product: ${productId} - ${productData.product_name}`);

        const revenueData = await cacheService.getProductRevenueWithCache(productId);

        let totalRevenue = 0;
        let totalQuantity = 0;

        if (revenueData.orderIds.length > 0) {
          console.log(`Processing ${revenueData.orderIds.length} orders for product ${productId}`);
          const orderDetails = await stickyService.fetchOrderDetails(revenueData.orderIds);
          totalRevenue = orderDetails.totalRevenue;
          totalQuantity = orderDetails.totalQuantity;
          console.log(`Found revenue: $${totalRevenue} from ${revenueData.totalOrders} orders`);
        } else {
          console.log(`No orders found for product ${productId} in the last 5 days`);
        }

        const averageOrderValue = revenueData.totalOrders > 0
          ? totalRevenue / revenueData.totalOrders
          : 0;

        const existingProduct = await Product.findOne({ product_id: productId });

        const baseProductData = {
          name: productData.product_name || 'Unknown Product',
          sku: productData.product_sku || 'NO-SKU',
          category_id: productData.category_id || null,
          price: parseFloat(productData.product_price || 0),
          cost: parseFloat(productData.cost_of_goods_sold || 0),
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalOrders: revenueData.totalOrders,
          totalQuantitySold: totalQuantity,
          averageOrderValue: Math.round(averageOrderValue * 100) / 100,
          refundRate: 15,
          lastUpdated: new Date(),
          isActive: true
        };

        const financials = Product.calculateFinancials({
          totalRevenue: totalRevenue,
          refundRate: 15
        });

        const completeProductData = {
          ...baseProductData,
          ...financials
        };

        console.log(`Calculated financials for ${productId}:`, {
          grossRevenue: totalRevenue,
          totalRefunds: financials.totalRefunds,
          netRevenue: financials.netRevenue,
          totalCosts: financials.totalCosts,
          profitLoss: financials.profitLoss
        });

        const product = await Product.findOneAndUpdate(
          { product_id: productId },
          completeProductData,
          {
            upsert: true,
            new: true,
            runValidators: true
          }
        );

        if (!existingProduct) {
          syncedCount++;
          console.log(`Created new product: ${productData.product_name}`);
        } else {
          updatedCount++;
          console.log(`Updated existing product: ${productData.product_name}`);
        }

        processedProducts.push({
          id: productId,
          name: productData.product_name,
          sku: productData.product_sku,
          price: parseFloat(productData.product_price || 0),
          grossRevenue: Math.round(totalRevenue * 100) / 100,
          refunds: financials.totalRefunds,
          netRevenue: financials.netRevenue,
          totalCosts: financials.totalCosts,
          profitLoss: financials.profitLoss,
          refundRate: 15,
          orders: revenueData.totalOrders,
          quantity: totalQuantity,
          averageOrderValue: Math.round(averageOrderValue * 100) / 100,
          profitMargin: financials.profitMargin,
          dateRange: revenueData.dateRange
        });

      } catch (productError) {
        console.error(`Error processing product ${productId}:`, productError.message);
        errors.push({
          productId,
          productName: productData.product_name || 'Unknown',
          error: productError.message
        });
      }
    }

    const totalProcessed = syncedCount + updatedCount;
    console.log(`Sync completed: ${syncedCount} new, ${updatedCount} updated, ${skippedCount} skipped, ${errors.length} errors`);

    res.json({
      success: true,
      message: 'Product sync completed successfully with caching',
      stats: {
        synced: syncedCount,
        updated: updatedCount,
        skipped: skippedCount,
        total: totalProcessed,
        targetProducts: targetProducts.length,
        errors: errors.length,
        dateRange: '5 days',
        cacheCleared: true
      },
      data: {
        processedProducts,
        errors: errors.length > 0 ? errors : undefined
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in product sync:', error);
    res.status(500).json({
      success: false,
      message: 'Error in product sync',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const targetProducts = stickyService.getTargetProducts();

    let cachedAnalytics = await cacheService.getAnalyticsSummaryWithCache();

    if (cachedAnalytics) {
      console.log('Returning cached analytics data');
      return res.json({
        success: true,
        data: cachedAnalytics,
        source: 'cache',
        timestamp: new Date().toISOString()
      });
    }

    console.log('Generating fresh analytics...');
    const products = await Product.find({
      product_id: { $in: targetProducts },
      isActive: true
    }).sort({ totalRevenue: -1 });

    const totalGrossRevenue = products.reduce((sum, p) => sum + p.totalRevenue, 0);
    const totalRefunds = products.reduce((sum, p) => sum + p.totalRefunds, 0);
    const totalNetRevenue = products.reduce((sum, p) => sum + p.netRevenue, 0);
    const totalCosts = products.reduce((sum, p) => sum + p.totalCosts, 0);
    const totalProfit = products.reduce((sum, p) => sum + p.profitLoss, 0);
    const totalOrders = products.reduce((sum, p) => sum + p.totalOrders, 0);
    const totalQuantity = products.reduce((sum, p) => sum + p.totalQuantitySold, 0);

    const analyticsData = {
      summary: {
        totalProducts: products.length,
        targetProducts: targetProducts.length,
        totalGrossRevenue: Math.round(totalGrossRevenue * 100) / 100,
        totalRefunds: Math.round(totalRefunds * 100) / 100,
        totalNetRevenue: Math.round(totalNetRevenue * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalOrders,
        totalQuantitySold: totalQuantity,
        averageOrderValue: totalOrders > 0 ? Math.round((totalGrossRevenue / totalOrders) * 100) / 100 : 0,
        averageRevenuePerProduct: products.length > 0 ? Math.round((totalNetRevenue / products.length) * 100) / 100 : 0,
        profitMargin: totalNetRevenue > 0 ? Math.round((totalProfit / totalNetRevenue) * 100 * 100) / 100 : 0,
        refundRate: totalGrossRevenue > 0 ? Math.round((totalRefunds / totalGrossRevenue) * 100 * 100) / 100 : 15,
        costRate: totalNetRevenue > 0 ? Math.round((totalCosts / totalNetRevenue) * 100 * 100) / 100 : 10
      },
      dateRange: '5 days',
      products: products.map(p => ({
        id: p.product_id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        grossRevenue: p.totalRevenue,
        refunds: p.totalRefunds,
        netRevenue: p.netRevenue,
        totalCosts: p.totalCosts,
        profitLoss: p.profitLoss,
        refundRate: p.refundRate,
        orders: p.totalOrders,
        quantity: p.totalQuantitySold,
        averageOrderValue: p.averageOrderValue,
        profitMargin: Math.round(p.profitMargin * 100) / 100,
        lastUpdated: p.lastUpdated
      }))
    };

    // Cache the analytics data
    await cacheService.cacheAnalyticsSummary(analyticsData);

    console.log(`Analytics calculated for ${products.length} products and cached`);

    res.json({
      success: true,
      data: analyticsData,
      source: 'fresh',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message
    });
  }
});

// New route: Get cache statistics
router.get('/cache-stats', async (req, res) => {
  try {
    const stats = await cacheService.getCacheStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cache statistics',
      error: error.message
    });
  }
});

export default router;