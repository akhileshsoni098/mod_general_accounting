const mongoose = require('mongoose');

const PlatformAuditLogSchema = new mongoose.Schema(
  {
    actor_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    actor_email: {
      type: String,
      required: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    target_tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true
    },
    target_company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company'
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ip_address: {
      type: String,
      default: ''
    },
    user_agent: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'platform_audit_logs'
  }
);

module.exports = mongoose.model('PlatformAuditLog', PlatformAuditLogSchema);
