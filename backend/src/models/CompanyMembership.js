const mongoose = require('mongoose');

const CompanyMembershipSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INVITED', 'SUSPENDED'],
      default: 'ACTIVE'
    },
    is_default: {
      type: Boolean,
      default: false
    },
    joined_at: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'company_memberships'
  }
);

// Enforce unique user membership per company within tenant
CompanyMembershipSchema.index({ tenant_id: 1, company_id: 1, user_id: 1 }, { unique: true });
CompanyMembershipSchema.index({ user_id: 1, status: 1 });
CompanyMembershipSchema.index({ company_id: 1, status: 1 });

module.exports = mongoose.model('CompanyMembership', CompanyMembershipSchema);
