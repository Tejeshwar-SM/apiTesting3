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

productSchema.pre('save', function(next) {
  if (this.price > 0) {
    this.profitMargin = ((this.price - this.cost) / this.price) * 100;
  }
  next();
});

export default mongoose.model('Product', productSchema);
