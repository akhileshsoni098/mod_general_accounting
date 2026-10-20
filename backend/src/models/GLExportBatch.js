const mongoose = require('mongoose');

const GLExportBatchSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    batch_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "ERP-EXP-2026-07-001"
    },
    fiscal_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FiscalPeriod',
      required: true,
      index: true
    },
    snapshot_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TrialBalanceSnapshot',
      required: true
    },
    target_erp: {
      type: String,
      enum: ['SAP_S4HANA', 'NETSUITE', 'GENERIC_CSV', 'GENERIC_JSON'],
      default: 'GENERIC_JSON'
    },
    format_version: {
      type: String,
      default: 'v1.0'
    },
    journal_count: {
      type: Number,
      required: true,
      default: 0
    },
    total_debit: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    total_credit: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    checksum: {
      type: String,
      required: true
    },
    payload_artifact: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['DRAFT', 'GENERATED', 'READY', 'EXPORTED', 'ACKNOWLEDGED', 'FAILED'],
      default: 'GENERATED',
      index: true
    },
    external_acknowledgement_id: {
      type: String,
      default: null // Marked clearly as SIMULATED in dev environment
    },
    exported_at: {
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
    collection: 'gl_export_batches'
  }
);

GLExportBatchSchema.index({ tenant_id: 1, batch_number: 1 }, { unique: true });

module.exports = mongoose.model('GLExportBatch', GLExportBatchSchema);
