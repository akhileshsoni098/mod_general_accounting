const mongoose = require('mongoose');

const StockGroupSchema = new mongoose.Schema(
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
    group_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "RAW_MAT", "FINISHED_GOODS"
    },
    group_name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    parent_group_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockGroup',
      default: null,
      index: true
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
    collection: 'stock_groups'
  }
);

// Enforce unique group code per company within tenant
StockGroupSchema.index({ tenant_id: 1, company_id: 1, group_code: 1 }, { unique: true });
StockGroupSchema.index({ tenant_id: 1, company_id: 1, status: 1 });
StockGroupSchema.index({ tenant_id: 1, company_id: 1, parent_group_id: 1 });

module.exports = mongoose.model('StockGroup', StockGroupSchema);
