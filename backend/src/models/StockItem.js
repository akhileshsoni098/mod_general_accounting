const mongoose = require('mongoose');

const UomConversionSubSchema = new mongoose.Schema(
  {
    alternate_uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      required: true
    },
    // 1 Alternate Unit = conversion_factor * Base Unit (e.g. 1 BOX = 10 PCS)
    conversion_factor: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    }
  },
  { _id: false }
);

const StockItemSchema = new mongoose.Schema(
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
    item_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "ITM-001"
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "SKU-HDW-001"
    },
    item_name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    barcodes: [
      {
        type: String,
        trim: true,
        uppercase: true
      }
    ],
    stock_group_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockGroup',
      default: null,
      index: true
    },
    stock_category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockCategory',
      default: null,
      index: true
    },
    base_uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      required: true,
      index: true
    },
    purchase_uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      default: null
    },
    sales_uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      default: null
    },
    uom_conversions: [UomConversionSubSchema],
    purchase_price: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    sales_price: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    standard_cost: {
      type: Number,
      default: 0
    },
    standard_selling_price: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    reorder_level: {
      type: Number,
      default: 0
    },
    costing_method: {
      type: String,
      enum: ['FIFO', 'MOVING_AVERAGE', 'AVERAGE_COST', 'STANDARD_COST'],
      default: 'MOVING_AVERAGE'
    },
    tax_rate: {
      type: Number,
      default: 0
    },
    hsn_sac_code: {
      type: String,
      trim: true,
      default: ''
    },
    is_stock_tracked: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'stock_items'
  }
);

// Enforce unique item code and SKU per company within tenant
StockItemSchema.index({ tenant_id: 1, company_id: 1, item_code: 1 }, { unique: true });
StockItemSchema.index({ tenant_id: 1, company_id: 1, sku: 1 }, { unique: true });
StockItemSchema.index({ tenant_id: 1, company_id: 1, barcodes: 1 });
StockItemSchema.index({ tenant_id: 1, company_id: 1, stock_group_id: 1 });
StockItemSchema.index({ tenant_id: 1, company_id: 1, status: 1 });

module.exports = mongoose.model('StockItem', StockItemSchema);
