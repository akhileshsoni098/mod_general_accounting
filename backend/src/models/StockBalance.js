const mongoose = require('mongoose');

const StockBalanceSchema = new mongoose.Schema(
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
    stock_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true,
      index: true
    },
    godown_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Godown',
      required: true,
      index: true
    },
    base_uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      required: true
    },
    quantity_on_hand: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0.0000')
    },
    average_unit_cost: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_inventory_value: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    last_movement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockMovement',
      default: null
    },
    last_movement_date: {
      type: Date,
      default: null
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'stock_balances'
  }
);

// Enforce unique balance record per item & godown within company
StockBalanceSchema.index(
  { tenant_id: 1, company_id: 1, stock_item_id: 1, godown_id: 1 },
  { unique: true }
);
StockBalanceSchema.index({ tenant_id: 1, company_id: 1, quantity_on_hand: 1 });

module.exports = mongoose.model('StockBalance', StockBalanceSchema);
