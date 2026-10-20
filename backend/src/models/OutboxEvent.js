const mongoose = require('mongoose');

const OutboxEventSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    event_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    event_type: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    event_version: {
      type: String,
      required: true,
      default: '1.0.0',
      trim: true
    },
    source_module: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    source_entity_type: {
      type: String,
      required: true,
      trim: true
    },
    source_entity_id: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    source_transaction_id: {
      type: String,
      default: null,
      trim: true
    },
    correlation_id: {
      type: String,
      default: null,
      trim: true,
      index: true
    },
    causation_id: {
      type: String,
      default: null,
      trim: true
    },
    occurred_at: {
      type: Date,
      default: Date.now
    },
    recorded_at: {
      type: Date,
      default: Date.now
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    trace_metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'PUBLISHED', 'RETRY', 'DEAD_LETTER'],
      default: 'PENDING',
      index: true
    },
    attempt_count: {
      type: Number,
      default: 0
    },
    max_attempts: {
      type: Number,
      default: 5
    },
    next_retry_at: {
      type: Date,
      default: null,
      index: true
    },
    lease_owner: {
      type: String,
      default: null
    },
    lease_expires_at: {
      type: Date,
      default: null,
      index: true
    },
    last_error_category: {
      type: String,
      default: null
    },
    last_error_message: {
      type: String,
      default: null
    },
    published_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'outbox_events'
  }
);

OutboxEventSchema.index({ tenant_id: 1, event_id: 1 }, { unique: true });
OutboxEventSchema.index({ status: 1, next_retry_at: 1, lease_expires_at: 1 });
OutboxEventSchema.index({ tenant_id: 1, status: 1 });
OutboxEventSchema.index({ tenant_id: 1, correlation_id: 1 });

module.exports = mongoose.model('OutboxEvent', OutboxEventSchema);
