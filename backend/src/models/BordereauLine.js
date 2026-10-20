const mongoose = require('mongoose');

const BordereauLineSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    run_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BordereauRun',
      required: true,
      index: true
    },
    line_number: {
      type: Number,
      required: true
    },
    source_entity_type: {
      type: String,
      default: 'POLICY_COVERAGE'
    },
    source_entity_id: {
      type: String,
      required: true // e.g. "POL-TX-8821-COV-AUTO_LIAB"
    },
    policy_number: {
      type: String,
      required: true
    },
    insured_name: {
      type: String,
      default: 'Lone Pine Trucking LLC'
    },
    coverage_type: {
      type: String,
      required: true // e.g. "AUTO_LIABILITY", "PHYSICAL_DAMAGE", "CARGO"
    },
    risk_state: {
      type: String,
      default: 'TX',
      trim: true,
      uppercase: true
    },
    line_of_business: {
      type: String,
      default: 'COMMERCIAL_AUTO',
      trim: true
    },
    carrier_party_id: {
      type: String,
      default: 'CARRIER-SUMMIT',
      trim: true
    },
    carrier_name: {
      type: String,
      default: 'Summit Mutual Insurance',
      trim: true
    },
    broker_party_id: {
      type: String,
      default: 'BROKER-BRIGHTLINE',
      trim: true
    },
    broker_name: {
      type: String,
      default: 'Brightline Agency',
      trim: true
    },
    dimensions: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    effective_date: {
      type: Date,
      required: true
    },
    expiration_date: {
      type: Date,
      required: true
    },
    gross_premium: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    mga_commission_pct: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    mga_commission_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    net_due_carrier: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    validation_status: {
      type: String,
      enum: ['VALID', 'INVALID', 'WARNING'],
      default: 'VALID'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'bordereau_lines'
  }
);

BordereauLineSchema.index({ tenant_id: 1, run_id: 1, line_number: 1 }, { unique: true });
BordereauLineSchema.index({ tenant_id: 1, run_id: 1, source_entity_id: 1 }, { unique: true });

module.exports = mongoose.model('BordereauLine', BordereauLineSchema);
