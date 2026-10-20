const mongoose = require('mongoose');

const PeriodCloseTaskSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    fiscal_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FiscalPeriod',
      required: true,
      index: true
    },
    task_step: {
      type: Number,
      required: true,
      min: 1,
      max: 7
    },
    task_name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    prerequisite_steps: {
      type: [Number],
      default: []
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
      default: 'PENDING',
      index: true
    },
    evidence_summary: {
      type: String,
      default: ''
    },
    error_details: {
      type: String,
      default: null
    },
    completed_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    completed_at: {
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
    collection: 'period_close_tasks'
  }
);

PeriodCloseTaskSchema.index({ tenant_id: 1, fiscal_period_id: 1, task_step: 1 }, { unique: true });

module.exports = mongoose.model('PeriodCloseTask', PeriodCloseTaskSchema);
