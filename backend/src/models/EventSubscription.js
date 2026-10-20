const mongoose = require('mongoose');

const EventSubscriptionSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    subscription_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    consumer_name: {
      type: String,
      required: true,
      trim: true
    },
    event_type: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    },
    description: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'event_subscriptions'
  }
);

EventSubscriptionSchema.index({ tenant_id: 1, consumer_name: 1, event_type: 1 }, { unique: true });
EventSubscriptionSchema.index({ tenant_id: 1, is_active: 1 });

module.exports = mongoose.model('EventSubscription', EventSubscriptionSchema);
