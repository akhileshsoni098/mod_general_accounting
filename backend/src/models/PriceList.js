const mongoose = require('mongoose');

const PriceListSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    price_level_name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "WHOLESALE", "RETAIL", "DEALER", "EXPORT"
    },
    stock_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true,
      index: true
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true
    },
    min_quantity: {
      type: Number,
      default: 1,
      min: 0
    },
    rate: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    discount_percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    effective_from: {
      type: Date,
      default: Date.now
    },
    effective_to: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'price_lists'
  }
);

PriceListSchema.index(
  { tenant_id: 1, company_id: 1, price_level_name: 1, stock_item_id: 1, min_quantity: 1 },
  { unique: true }
);

module.exports = mongoose.model('PriceList', PriceListSchema);
