const mongoose = require('mongoose');

const TdsDeductionSchema = new mongoose.Schema(
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
    deductee_party_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      required: true,
      index: true
    },
    pan_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    section_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "194C"
    },
    bill_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument',
      default: null,
      index: true
    },
    gross_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    tds_rate_percent: {
      type: Number,
      required: true
    },
    tds_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    net_payable_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    deduction_date: {
      type: Date,
      default: Date.now,
      index: true
    },
    quarter: {
      type: String,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
      required: true
    },
    financial_year: {
      type: String,
      required: true // e.g. "2026-2027"
    },
    challan_number: {
      type: String,
      default: null,
      trim: true
    },
    challan_bsr_code: {
      type: String,
      default: null
    },
    challan_date: {
      type: Date,
      default: null
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    status: {
      type: String,
      enum: ['DEDUCTED', 'DEPOSITED', 'CHALLAN_LINKED'],
      default: 'DEDUCTED'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tds_deductions'
  }
);

TdsDeductionSchema.index(
  { tenant_id: 1, company_id: 1, financial_year: 1, quarter: 1 }
);

module.exports = mongoose.model('TdsDeduction', TdsDeductionSchema);
