const mongoose = require('mongoose');

const TenantModuleEntitlementSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    module_code: {
      type: String,
      required: true,
      enum: ['GL', 'BILLING_AR', 'COMMISSIONS_FIDUCIARY', 'TREASURY_BANK_REC', 'FINANCE_CLOSE', 'INVENTORY'],
      uppercase: true
    },
    is_enabled: {
      type: Boolean,
      default: true
    },
    config: {
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
    collection: 'tenant_module_entitlements'
  }
);

TenantModuleEntitlementSchema.index({ tenant_id: 1, module_code: 1 }, { unique: true });

module.exports = mongoose.model('TenantModuleEntitlement', TenantModuleEntitlementSchema);
