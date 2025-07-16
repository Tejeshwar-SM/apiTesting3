import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  
  product_id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    required: true
  },
  category_id: String,
  
  
  cost: {
    type: Number,
    default: 0
  },
  price: {
    type: Number,
    required: true
  },
  
  totalRevenue: {
    type: Number,
    default: 0
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  totalQuantitySold: {
    type: Number,
    default: 0
  },
  
  // Financial calculations
  refundRate: {
    type: Number,
    default: 15 // 15% default refund rate
  },
  totalRefunds: {
    type: Number,
    default: 0
  },
  netRevenue: {
    type: Number,
    default: 0
  },
  totalCosts: {
    type: Number,
    default: 0
  },
  profitLoss: {
    type: Number,
    default: 0
  },
  
  profitMargin: {
    type: Number,
    default: 0
  },
  averageOrderValue: {
    type: Number,
    default: 0
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Static method to calculate all financial metrics
productSchema.statics.calculateFinancials = function(productData) {
  const grossRevenue = productData.totalRevenue || 0; // Gross revenue from Sticky
  const refundRate = productData.refundRate || 15;
  
  // Step 1: Calculate refunds (15% of GROSS revenue)
  const totalRefunds = grossRevenue * (refundRate / 100);
  
  // Step 2: Calculate net revenue (gross - refunds)
  const netRevenue = grossRevenue - totalRefunds;
  
  // Step 3: Calculate total costs (10% of NET revenue) 
  const totalCosts = netRevenue * 0.10;
  
  // Step 4: Calculate P&L (net revenue - total costs)
  const profitLoss = netRevenue - totalCosts;
  
  // Step 5: Calculate profit margin based on net revenue
  const profitMargin = netRevenue > 0 ? (profitLoss / netRevenue) * 100 : 0;
  
  return {
    totalRefunds: Math.round(totalRefunds * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
    totalCosts: Math.round(totalCosts * 100) / 100,
    profitLoss: Math.round(profitLoss * 100) / 100,
    profitMargin: Math.round(profitMargin * 100) / 100
  };
};

export default mongoose.model('Product', productSchema);