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
    stockItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
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
        'SALES_RETURN',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'PHYSICAL_ADJUSTMENT',
        'REVERSAL',
        'RECIPE_CONSUMPTION',
        'PRODUCTION_ISSUE',
        'PRODUCTION_RECEIPT',
        'WASTAGE',
        'QUARANTINE_IN',
        'QUARANTINE_RELEASE',
        'SCRAP_DISPOSAL',
        'SPOILAGE_DISPOSAL'
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
      required: true,
      get: (v) => (v != null ? Number(v.toString()) : v)
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
    sourceDocumentId: {
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
    batch_number: {
      type: String,
      default: '',
      trim: true
    },
    serial_numbers: [
      {
        type: String,
        trim: true
      }
    ],
    expiry_date: {
      type: Date,
      default: null
    },
    disposition: {
      type: String,
      enum: ['RESTOCK', 'QUARANTINE', 'SCRAP', 'SPOILAGE', 'PRICE_ADJUSTMENT_ONLY'],
      default: 'RESTOCK'
    },
    inspection_status: {
      type: String,
      enum: ['PASSED', 'PENDING_INSPECTION', 'FAILED', 'NOT_APPLICABLE'],
      default: 'NOT_APPLICABLE'
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
    },
    gl_status: {
      type: String,
      enum: ['NOT_APPLICABLE', 'PENDING', 'POSTED', 'REVERSED'],
      default: 'PENDING',
      index: true
    },
    gl_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null,
      index: true
    },
    gl_posted_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'stock_movements',
    toObject: { getters: true },
    toJSON: { getters: true }
  }
);

StockMovementSchema.pre('validate', function () {
  if (this.stock_item_id && !this.stockItemId) {
    this.stockItemId = this.stock_item_id;
  }
  if (this.stockItemId && !this.stock_item_id) {
    this.stock_item_id = this.stockItemId;
  }
  if (this.source_document_id && !this.sourceDocumentId) {
    this.sourceDocumentId = this.source_document_id;
  }
  if (this.sourceDocumentId && !this.source_document_id) {
    this.source_document_id = this.sourceDocumentId;
  }
});

// Enforce unique idempotency key per company
StockMovementSchema.index({ tenant_id: 1, company_id: 1, idempotency_key: 1 }, { unique: true });
StockMovementSchema.index({ tenant_id: 1, company_id: 1, stock_item_id: 1, godown_id: 1, effective_date: -1 });
StockMovementSchema.index({ tenant_id: 1, company_id: 1, stockItemId: 1, godown_id: 1, effective_date: -1 });
StockMovementSchema.index({ tenant_id: 1, company_id: 1, movement_type: 1 });

module.exports = mongoose.model('StockMovement', StockMovementSchema);
