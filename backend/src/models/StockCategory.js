const mongoose = require('mongoose');

const StockCategorySchema = new mongoose.Schema(
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
    category_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "BEVERAGES", "DAIRY", "FASTENERS"
    },
    category_name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'stock_categories'
  }
);

// Enforce unique category code per company within tenant
StockCategorySchema.index({ tenant_id: 1, company_id: 1, category_code: 1 }, { unique: true });
StockCategorySchema.index({ tenant_id: 1, company_id: 1, status: 1 });

module.exports = mongoose.model('StockCategory', StockCategorySchema);
