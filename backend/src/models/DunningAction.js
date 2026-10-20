const mongoose = require('mongoose');

const DunningActionSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    delinquency_case_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DelinquencyCase',
      required: true,
      index: true
    },
    action_type: {
      type: String,
      enum: ['FIRST_PAST_DUE_NOTICE', 'FINAL_DEMAND_LETTER', 'CANCELLATION_NOTICE', 'COLLECTION_CALL'],
      required: true
    },
    action_step: {
      type: Number,
      required: true
    },
    action_date: {
      type: Date,
      default: Date.now
    },
    is_simulated: {
      type: Boolean,
      default: true
    },
    delivery_status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'FAILED', 'PENDING'],
      default: 'SENT'
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    collection: 'dunning_actions'
  }
);

DunningActionSchema.index({ tenant_id: 1, delinquency_case_id: 1, action_step: 1 }, { unique: true });

module.exports = mongoose.model('DunningAction', DunningActionSchema);
