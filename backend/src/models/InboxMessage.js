const mongoose = require('mongoose');

const InboxMessageSchema = new mongoose.Schema(
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
      trim: true,
      index: true
    },
    consumer_name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    event_type: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    event_version: {
      type: String,
      required: true,
      default: '1.0.0',
      trim: true
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'PROCESSING', 'PROCESSED', 'RETRY', 'DEAD_LETTER'],
      default: 'RECEIVED',
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
      default: null
    },
    last_error_code: {
      type: String,
      default: null
    },
    last_error_category: {
      type: String,
      default: null
    },
    last_error_message: {
      type: String,
      default: null
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
    received_at: {
      type: Date,
      default: Date.now
    },
    processed_at: {
      type: Date,
      default: null
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    replayed_at: {
      type: Date,
      default: null
    },
    replayed_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    replay_reason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'inbox_messages'
  }
);

// Idempotent delivery guarantee: (tenant_id, consumer_name, event_id)
InboxMessageSchema.index({ tenant_id: 1, consumer_name: 1, event_id: 1 }, { unique: true });
InboxMessageSchema.index({ status: 1, next_retry_at: 1 });
InboxMessageSchema.index({ tenant_id: 1, status: 1 });

module.exports = mongoose.model('InboxMessage', InboxMessageSchema);
