const mongoose = require('mongoose');

const TaxProviderSyncLogSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null, // Null for global/platform seed imports
      index: true
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true
    },
    sync_type: {
      type: String,
      required: true,
      enum: [
        'JSON_SEED_IMPORT',
        'PROVIDER_RATE_SYNC',
        'PROVIDER_JURISDICTION_SYNC'
      ],
      index: true
    },
    dataset_version: {
      type: String,
      required: true
    },
    source: {
      type: String,
      required: true
    },
    dry_run: {
      type: Boolean,
      default: false
    },
    summary: {
      total_processed: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      unsupported: { type: Number, default: 0 }
    },
    errors: [
      {
        record_code: { type: String, default: '' },
        reason: { type: String, default: '' }
      }
    ],
    executed_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    started_at: {
      type: Date,
      default: Date.now
    },
    completed_at: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      required: true,
      enum: ['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'],
      default: 'SUCCESS'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tax_provider_sync_logs'
  }
);

TaxProviderSyncLogSchema.index({ sync_type: 1, created_at: -1 });

module.exports = mongoose.model('TaxProviderSyncLog', TaxProviderSyncLogSchema);
