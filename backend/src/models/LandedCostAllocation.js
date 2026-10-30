const mongoose = require('mongoose');

const AllocatedLineSchema = new mongoose.Schema(
  {
    stock_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true
    },
    item_code: {
      type: String,
      required: true
    },
    item_name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    original_rate: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    original_value: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    allocated_cost: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    additional_unit_cost: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    new_unit_cost: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    }
  },
  { _id: false }
);

const LandedCostAllocationSchema = new mongoose.Schema(
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
    voucher_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    allocation_date: {
      type: Date,
      default: Date.now,
      index: true
    },
    purchase_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument',
      required: true,
      index: true
    },
    reference_id: {
      type: String,
      trim: true,
      default: null,
      index: true
    },
    charge_type: {
      type: String,
      enum: ['FREIGHT', 'CUSTOMS', 'INSURANCE', 'HANDLING', 'OTHER'],
      default: 'FREIGHT'
    },
    allocation_basis: {
      type: String,
      enum: ['VALUE', 'QUANTITY'],
      default: 'VALUE'
    },
    total_additional_cost: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    expense_ledger_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      required: true
    },
    inventory_ledger_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      required: true
    },
    lines: [AllocatedLineSchema],
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    status: {
      type: String,
      enum: ['DRAFT', 'POSTED', 'CANCELLED'],
      default: 'POSTED'
    },
    notes: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'landed_cost_allocations'
  }
);

LandedCostAllocationSchema.index(
  { tenant_id: 1, company_id: 1, voucher_number: 1 },
  { unique: true }
);

module.exports = mongoose.model('LandedCostAllocation', LandedCostAllocationSchema);
