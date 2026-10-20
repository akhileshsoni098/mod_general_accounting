const mongoose = require('mongoose');

const PartyRoleSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    party_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      required: true,
      index: true
    },
    role_type: {
      type: String,
      enum: [
        'CUSTOMER',
        'SUPPLIER',
        'VENDOR',
        'DEBTOR',
        'CREDITOR',
        'GUEST',
        'EMPLOYEE',
        'PARTNER',
        'AGENT',
        'CARRIER',
        'MGA',
        'BROKER',
        'POLICYHOLDER',
        'PRODUCER',
        'REINSURER',
        'REGULATOR'
      ],
      required: true,
      uppercase: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE'
    },
    effective_from: {
      type: Date,
      default: Date.now
    },
    effective_to: {
      type: Date,
      default: null
    },
    role_details: {
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
    collection: 'counterparty_party_roles'
  }
);

// Compound tenant boundary index ensuring uniqueness of role_type per party per tenant
PartyRoleSchema.index({ tenant_id: 1, party_id: 1, role_type: 1 }, { unique: true });
PartyRoleSchema.index({ tenant_id: 1, role_type: 1, status: 1 });

module.exports = mongoose.model('PartyRole', PartyRoleSchema);
