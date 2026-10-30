const mongoose = require('mongoose');

const RawMaterialIssuedSchema = new mongoose.Schema(
  {
    stock_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true
    },
    item_name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.0001
    },
    uom: {
      type: String,
      default: 'PCS'
    },
    source_godown_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Godown',
      default: null
    }
  },
  { _id: false }
);

const FinishedGoodsExpectedSchema = new mongoose.Schema(
  {
    stock_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true
    },
    item_name: {
      type: String,
      required: true
    },
    quantity_expected: {
      type: Number,
      required: true,
      min: 0.0001
    },
    scrap_expected: {
      type: Number,
      default: 0
    },
    target_godown_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Godown',
      default: null
    }
  },
  { _id: false }
);

const JobWorkReceiptSchema = new mongoose.Schema(
  {
    receipt_date: {
      type: Date,
      default: Date.now
    },
    delivery_challan_number: {
      type: String,
      default: ''
    },
    quantity_received: {
      type: Number,
      required: true,
      min: 0
    },
    scrap_quantity_received: {
      type: Number,
      default: 0
    },
    processing_charges: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    }
  },
  { _id: false }
);

const JobWorkOrderSchema = new mongoose.Schema(
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
    order_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    order_type: {
      type: String,
      enum: ['OUTWARD', 'INWARD'],
      default: 'OUTWARD'
    },
    party_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      required: true,
      index: true
    },
    issue_date: {
      type: Date,
      default: Date.now
    },
    expected_completion_date: {
      type: Date,
      default: null
    },
    raw_materials_issued: [RawMaterialIssuedSchema],
    finished_goods_expected: [FinishedGoodsExpectedSchema],
    receipts: [JobWorkReceiptSchema],
    total_quantity_received: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['ISSUED', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'],
      default: 'ISSUED'
    },
    notes: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'job_work_orders'
  }
);

JobWorkOrderSchema.index({ tenant_id: 1, company_id: 1, order_number: 1 }, { unique: true });

module.exports = mongoose.model('JobWorkOrder', JobWorkOrderSchema);
