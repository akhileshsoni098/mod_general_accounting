const mongoose = require('mongoose');

const FiduciaryAccountSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    account_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "FID-TX-TRUST-01"
    },
    account_name: {
      type: String,
      required: true,
      trim: true
    },
    account_type: {
      type: String,
      enum: ['PREMIUM_TRUST', 'CLAIMS_ESCROW', 'COMMISSION_CLEARING'],
      default: 'PREMIUM_TRUST'
    },
    jurisdiction_statute: {
      type: String,
      default: 'TEXAS_INS_CODE_4053'
    },
    gl_account_code: {
      type: String,
      required: true,
      default: '1010' // Segregated statutory fiduciary premium trust account
    },
    bank_reference_token: {
      type: String,
      required: true,
      trim: true // e.g. "tok_frost_tx_trust_9941" (masked vault token, no raw account numbers)
    },
    bank_name: {
      type: String,
      default: 'Frost Bank, N.A. (Austin, TX)'
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    fiduciary_hold_days: {
      type: Number,
      default: 30 // Demo assumption: 30-day holding rule for earned MGA sweep
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'RESTRICTED', 'CLOSED'],
      default: 'ACTIVE'
    },
    notes: {
      type: String,
      default: 'Segregated Premium Trust Account per Texas Insurance Code § 4053'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'fiduciary_accounts'
  }
);

FiduciaryAccountSchema.index({ tenant_id: 1, account_code: 1 }, { unique: true });

module.exports = mongoose.model('FiduciaryAccount', FiduciaryAccountSchema);
