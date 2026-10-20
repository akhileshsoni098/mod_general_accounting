const mongoose = require('mongoose');

const CommissionSplitSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    schedule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionSchedule',
      required: true,
      index: true
    },
    split_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "SPLIT-BRIGHTLINE-AGENCY", "SPLIT-BRIGHTLINE-JAMES"
    },
    recipient_party_id: {
      type: String,
      required: true,
      trim: true // e.g. "AGENCY-BRIGHTLINE", "PRODUCER-JAMES"
    },
    recipient_party_name: {
      type: String,
      required: true,
      trim: true
    },
    parent_recipient_id: {
      type: String,
      default: null // for hierarchical splits
    },
    tier_level: {
      type: Number,
      default: 1
    },
    split_percentage: {
      type: mongoose.Schema.Types.Decimal128,
      required: true // e.g. 70.00 for Brightline Agency, 30.00 for James
    },
    effective_from: {
      type: Date,
      required: true
    },
    effective_to: {
      type: Date,
      default: null
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'commission_splits'
  }
);

CommissionSplitSchema.index({ tenant_id: 1, schedule_id: 1, recipient_party_id: 1 }, { unique: true });

module.exports = mongoose.model('CommissionSplit', CommissionSplitSchema);
