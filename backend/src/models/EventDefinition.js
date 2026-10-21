const mongoose = require('mongoose');

const SchemaVersionSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      trim: true // e.g. "1.0.0"
    },
    json_schema: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    sample_payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    description: {
      type: String,
      default: ''
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    created_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { _id: false }
);

const EventDefinitionSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    event_code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true // canonical e.g. "billing.invoice.issued", "policy.issued"
    },
    display_name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    source_module: {
      type: String,
      required: true,
      enum: [
        'COMMERCIAL',
        'COMMISSIONS',
        'BILLING',
        'TREASURY',
        'FINANCE_CLOSE',
        'POLICY',
        'CLAIMS',
        'REINSURANCE',
        'MANUAL',
        'RETAIL_POS',
        'RESTAURANT',
        'HOTEL_PMS',
        'MANUFACTURING',
        'SERVICES',
        'GL'
      ],
      default: 'COMMERCIAL'
    },
    category: {
      type: String,
      trim: true,
      default: 'TRANSACTION'
    },
    current_version: {
      type: String,
      required: true,
      default: '1.0.0'
    },
    versions: [SchemaVersionSchema],
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'event_definitions'
  }
);

EventDefinitionSchema.index({ tenant_id: 1, event_code: 1 }, { unique: true });
EventDefinitionSchema.index({ tenant_id: 1, status: 1 });

module.exports = mongoose.model('EventDefinition', EventDefinitionSchema);
