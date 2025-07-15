import express from 'express';
import Product from '../models/Product.js';
import stickyService from '../services/stickyService.js';

const router = express.Router();


router.use((req, res, next) => {
  console.log(`Products Route: ${req.method} ${req.path}`);
  next();
});

router.get('/debug-env', (req, res) => {
  res.json({
    STICKY_BASE_URL: process.env.STICKY_BASE_URL || 'NOT SET',
    STICKY_USERNAME: process.env.STICKY_USERNAME || 'NOT SET', 
    STICKY_PASSWORD: process.env.STICKY_PASSWORD ? 'SET' : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV || 'NOT SET'
  });
});


router.get('/test-sticky', async (req, res) => {
  try {
    console.log('Testing Sticky.io API connection...');
    
    
    const testResult = await stickyService.fetchProducts();
    
    console.log('Test response received:', {
      productCount: Object.keys(testResult || {}).length,
      productIds: Object.keys(testResult || {})
    });
    
    res.json({
      success: true,
      message: 'Sticky.io API test successful',
      data: {
        productCount: Object.keys(testResult || {}).length,
        productIds: Object.keys(testResult || {}),
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
    
    console.log(`Returning ${products.length} products`);
    
    res.json({
      success: true,
      data: products,
      total: products.length,
      dateRange: '5 days',
      targetProducts: targetProducts,
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
    console.log('Starting optimized sync for target products...');
    
    const stickyProducts = await stickyService.fetchProducts();
    const targetProducts = stickyService.getTargetProducts();
    
    let syncedCount = 0;
    let updatedCount = 0;
    let processedProducts = [];
    let errors = [];
    let skippedCount = 0;

    console.log(`Processing ${Object.keys(stickyProducts).length} products from Sticky.io`);
    console.log(`Target products: ${targetProducts.join(', ')}`);

    
    for (const [productId, productData] of Object.entries(stickyProducts)) {
      if (!targetProducts.includes(productId)) {
        console.log(` Skipping product ${productId} - not in target list`);
        skippedCount++;
        continue;
      }

      try {
        console.log(`Processing target product: ${productId} - ${productData.product_name}`);
        
        
        const revenueData = await stickyService.fetchProductRevenue(productId);
        
        let totalRevenue = 0;
        let totalQuantity = 0;

        
        if (revenueData.orderIds.length > 0) {
          console.log(`Processing ${revenueData.orderIds.length} orders for product ${productId}`);
          const orderDetails = await stickyService.fetchOrderDetails(revenueData.orderIds);
          totalRevenue = orderDetails.totalRevenue;
          totalQuantity = orderDetails.totalQuantity;
        } else {
          console.log(` No orders found for product ${productId} in the last 5 days`);
        }

        const averageOrderValue = revenueData.totalOrders > 0 
          ? totalRevenue / revenueData.totalOrders 
          : 0;

        
        const existingProduct = await Product.findOne({ product_id: productId });
        
        
        const product = await Product.findOneAndUpdate(
          { product_id: productId },
          {
            name: productData.product_name || 'Unknown Product',
            sku: productData.product_sku || 'NO-SKU',
            category_id: productData.category_id || null,
            price: parseFloat(productData.product_price || 0),
            cost: parseFloat(productData.cost_of_goods_sold || 0),
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalOrders: revenueData.totalOrders,
            totalQuantitySold: totalQuantity,
            averageOrderValue: Math.round(averageOrderValue * 100) / 100,
            lastUpdated: new Date(),
            isActive: true
          },
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
          revenue: Math.round(totalRevenue * 100) / 100,
          orders: revenueData.totalOrders,
          quantity: totalQuantity,
          averageOrderValue: Math.round(averageOrderValue * 100) / 100,
          profitMargin: product.profitMargin,
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
      message: 'Product sync completed successfully',
      stats: {
        synced: syncedCount,
        updated: updatedCount,
        skipped: skippedCount,
        total: totalProcessed,
        targetProducts: targetProducts.length,
        errors: errors.length,
        dateRange: '5 days'
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

// GET /api/products/analytics - Get product analytics
router.get('/analytics', async (req, res) => {
  try {
    const targetProducts = stickyService.getTargetProducts();
    
    const products = await Product.find({ 
      product_id: { $in: targetProducts },
      isActive: true 
    }).sort({ totalRevenue: -1 });

    // Calculate analytics
    const totalRevenue = products.reduce((sum, p) => sum + p.totalRevenue, 0);
    const totalOrders = products.reduce((sum, p) => sum + p.totalOrders, 0);
    const totalQuantity = products.reduce((sum, p) => sum + p.totalQuantitySold, 0);
    const totalCost = products.reduce((sum, p) => sum + (p.cost * p.totalQuantitySold), 0);
    const totalProfit = totalRevenue - totalCost;

    console.log(`Analytics calculated for ${products.length} products`);

    res.json({
      success: true,
      data: {
        summary: {
          totalProducts: products.length,
          targetProducts: targetProducts.length,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalOrders,
          totalQuantitySold: totalQuantity,
          totalCost: Math.round(totalCost * 100) / 100,
          totalProfit: Math.round(totalProfit * 100) / 100,
          averageOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
          averageRevenuePerProduct: products.length > 0 ? Math.round((totalRevenue / products.length) * 100) / 100 : 0,
          profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100 : 0
        },
        dateRange: '5 days',
        products: products.map(p => ({
          id: p.product_id,
          name: p.name,
          sku: p.sku,
          revenue: p.totalRevenue,
          orders: p.totalOrders,
          quantity: p.totalQuantitySold,
          averageOrderValue: p.averageOrderValue,
          profitMargin: Math.round(p.profitMargin * 100) / 100,
          profitPerUnit: Math.round((p.price - p.cost) * 100) / 100,
          lastUpdated: p.lastUpdated
        }))
      },
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

export default router;