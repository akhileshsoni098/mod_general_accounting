const mongoose = require('mongoose');

const StockMovementSchema = new mongoose.Schema(
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
    movement_type: {
      type: String,
      required: true,
      enum: [
        'OPENING_STOCK',
        'PURCHASE_RECEIPT',
        'SALES_ISSUE',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'PHYSICAL_ADJUSTMENT',
        'REVERSAL'
      ],
      index: true
    },
    direction: {
      type: String,
      required: true,
      enum: ['IN', 'OUT']
    },
    // The entered quantity in transaction UOM (always positive magnitude)
    quantity: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    // Signed quantity in base unit (+ for IN, - for OUT)
    base_quantity: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      required: true
    },
    base_uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      required: true
    },
    conversion_factor: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('1.0')
    },
    unit_rate: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_cost: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    source_document_type: {
      type: String,
      default: 'OPENING_STOCK'
    },
    source_document_id: {
      type: String,
      default: null,
      index: true
    },
    source_line_id: {
      type: String,
      default: null
    },
    idempotency_key: {
      type: String,
      required: true,
      trim: true
    },
    effective_date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    created_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reversal_of_movement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockMovement',
      default: null,
      index: true
    },
    is_reversed: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'stock_movements'
  }
);

// Enforce unique idempotency key per company
StockMovementSchema.index({ tenant_id: 1, company_id: 1, idempotency_key: 1 }, { unique: true });
StockMovementSchema.index({ tenant_id: 1, company_id: 1, stock_item_id: 1, godown_id: 1, effective_date: -1 });
StockMovementSchema.index({ tenant_id: 1, company_id: 1, movement_type: 1 });

module.exports = mongoose.model('StockMovement', StockMovementSchema);
