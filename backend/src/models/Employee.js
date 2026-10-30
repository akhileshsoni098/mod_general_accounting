const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema(
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
    employee_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "EMP-001"
    },
    full_name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
    },
    department: {
      type: String,
      default: 'GENERAL',
      trim: true
    },
    designation: {
      type: String,
      default: 'STAFF',
      trim: true
    },
    pan_number: {
      type: String,
      default: '',
      trim: true,
      uppercase: true
    },
    bank_account_number: {
      type: String,
      default: '',
      trim: true
    },
    bank_ifsc: {
      type: String,
      default: '',
      trim: true,
      uppercase: true
    },
    date_of_joining: {
      type: Date,
      default: Date.now
    },
    salary_structure_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryStructure',
      default: null
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'employees'
  }
);

EmployeeSchema.index({ tenant_id: 1, company_id: 1, employee_code: 1 }, { unique: true });

module.exports = mongoose.model('Employee', EmployeeSchema);
