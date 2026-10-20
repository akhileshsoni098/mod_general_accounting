const mongoose = require('mongoose');

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    plan_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    plan_name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    max_companies: {
      type: Number,
      required: true,
      default: 1
    },
    max_users: {
      type: Number,
      required: true,
      default: 2
    },
    max_documents_per_month: {
      type: Number,
      required: true,
      default: 100 // -1 for unlimited
    },
    price_per_month: {
      type: Number,
      required: true,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true
    },
    allowed_modules: [
      {
        type: String,
        uppercase: true
      }
    ],
    is_active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'subscription_plans'
  }
);

module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
