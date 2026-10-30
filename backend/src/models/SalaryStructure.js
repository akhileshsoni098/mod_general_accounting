const mongoose = require('mongoose');

const SalaryStructureSchema = new mongoose.Schema(
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
    structure_name: {
      type: String,
      required: true,
      trim: true // e.g. "Standard Kitchen Staff", "Executive Management"
    },
    basic_pay: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    hra: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    conveyance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    special_allowance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    epf_employee_percent: {
      type: Number,
      default: 12.0 // 12% of basic
    },
    esi_employee_percent: {
      type: Number,
      default: 0.75 // 0.75% of gross if gross <= 21000
    },
    professional_tax_monthly: {
      type: Number,
      default: 200 // Rs. 200 standard PT
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'salary_structures'
  }
);

SalaryStructureSchema.index({ tenant_id: 1, company_id: 1, structure_name: 1 }, { unique: true });

module.exports = mongoose.model('SalaryStructure', SalaryStructureSchema);
