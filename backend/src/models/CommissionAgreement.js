const mongoose = require('mongoose');

const CommissionAgreementSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    agreement_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "AGR-SUMMIT-HARBOR", "AGR-HARBOR-BRIGHTLINE"
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    contract_reference: {
      type: String,
      trim: true,
      default: null
    },
    payer_party_id: {
      type: String,
      required: true,
      trim: true // e.g. "CARRIER-SUMMIT" or "MGA-HARBOR"
    },
    payer_party_name: {
      type: String,
      required: true,
      trim: true
    },
    payee_party_id: {
      type: String,
      required: true,
      trim: true // e.g. "MGA-HARBOR" or "BROKER-BRIGHTLINE"
    },
    payee_party_name: {
      type: String,
      required: true,
      trim: true
    },
    agreement_type: {
      type: String,
      required: true,
      enum: ['CARRIER_TO_MGA', 'MGA_TO_BROKER', 'BROKER_TO_PRODUCER', 'DIRECT_REPRESENTATION'],
      default: 'CARRIER_TO_MGA'
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    effective_from: {
      type: Date,
      required: true
    },
    effective_to: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true
    },
    terms_version: {
      type: String,
      default: 'v1.0'
    },
    description: {
      type: String,
      default: ''
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'commission_agreements'
  }
);

CommissionAgreementSchema.index({ tenant_id: 1, agreement_code: 1 }, { unique: true });

module.exports = mongoose.model('CommissionAgreement', CommissionAgreementSchema);
