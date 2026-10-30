const mongoose = require('mongoose');

const PayrollEmployeeLineSchema = new mongoose.Schema(
  {
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    employee_code: { type: String, required: true },
    employee_name: { type: String, required: true },
    basic: { type: mongoose.Schema.Types.Decimal128, required: true },
    hra: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0.00') },
    conveyance: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0.00') },
    special_allowance: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0.00') },
    gross_pay: { type: mongoose.Schema.Types.Decimal128, required: true },
    epf: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0.00') },
    esi: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0.00') },
    pt: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0.00') },
    tds: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0.00') },
    total_deductions: { type: mongoose.Schema.Types.Decimal128, required: true },
    net_pay: { type: mongoose.Schema.Types.Decimal128, required: true }
  },
  { _id: false }
);

const PayrollRunSchema = new mongoose.Schema(
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
    month_year: {
      type: String,
      required: true // e.g. "2026-10"
    },
    run_date: {
      type: Date,
      default: Date.now
    },
    total_gross_pay: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    total_epf: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    total_esi: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    total_pt: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    total_tds: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_net_pay: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    employee_lines: [PayrollEmployeeLineSchema],
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    disbursement_journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    status: {
      type: String,
      enum: ['DRAFT', 'POSTED', 'DISBURSED'],
      default: 'POSTED'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'payroll_runs'
  }
);

PayrollRunSchema.index(
  { tenant_id: 1, company_id: 1, month_year: 1 },
  { unique: true }
);

module.exports = mongoose.model('PayrollRun', PayrollRunSchema);
