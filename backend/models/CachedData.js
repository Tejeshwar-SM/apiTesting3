import mongoose from 'mongoose';

const cachedDataSchema = new mongoose.Schema({
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  cacheType: {
    type: String,
    required: true,
    enum: ['sticky_products', 'sticky_revenue', 'analytics_summary', 'product_details'],
    index: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  metadata: {
    productId: String,
    dateRange: String,
    version: {
      type: String,
      default: '1.0'
    }
  }
}, {
  timestamps: true
});

// Auto-delete expired documents
cachedDataSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helper methods
cachedDataSchema.statics.isExpired = function(doc) {
  return new Date() > doc.expiresAt;
};

cachedDataSchema.statics.createCacheKey = function(type, identifier = '') {
  return `${type}:${identifier}:${Date.now()}`.replace(/:{2,}/g, ':').replace(/:$/, '');
};

export default mongoose.model('CachedData', cachedDataSchema);