const mongoose = require('mongoose');

const BordereauDefinitionSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    definition_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "BORD-SUMMIT-MONTHLY"
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    carrier_party_id: {
      type: String,
      required: true,
      trim: true // e.g. "CARRIER-SUMMIT"
    },
    bordereau_type: {
      type: String,
      enum: ['PREMIUM', 'CLAIMS', 'COMMISSION_SETTLEMENT'],
      default: 'PREMIUM'
    },
    reporting_frequency: {
      type: String,
      enum: ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'AD_HOC'],
      default: 'MONTHLY'
    },
    output_formats: {
      type: [String],
      default: ['JSON', 'CSV']
    },
    line_granularity: {
      type: String,
      enum: ['POLICY_COVERAGE', 'INSTALLMENT', 'TRANSACTION_SUMMARY'],
      default: 'POLICY_COVERAGE'
    },
    required_fields: {
      type: [String],
      default: [
        'policy_number',
        'coverage_type',
        'effective_date',
        'expiration_date',
        'gross_premium',
        'mga_commission_pct',
        'mga_commission_amount',
        'net_due_carrier'
      ]
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
    collection: 'bordereau_definitions'
  }
);

BordereauDefinitionSchema.index({ tenant_id: 1, definition_code: 1 }, { unique: true });

module.exports = mongoose.model('BordereauDefinition', BordereauDefinitionSchema);
