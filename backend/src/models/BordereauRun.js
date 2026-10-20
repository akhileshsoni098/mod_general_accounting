const mongoose = require('mongoose');

const BordereauRunSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    run_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "BRUN-2026-00001"
    },
    definition_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BordereauDefinition',
      required: true,
      index: true
    },
    reporting_period: {
      type: String,
      required: true // e.g. "2026-07"
    },
    as_of_date: {
      type: Date,
      default: Date.now
    },
    run_version: {
      type: Number,
      default: 1
    },
    status: {
      type: String,
      enum: ['DRAFT', 'GENERATED', 'VALIDATED', 'SIMULATED_SENT', 'ACCEPTED', 'REJECTED', 'FAILED'],
      default: 'GENERATED',
      index: true
    },
    total_lines: {
      type: Number,
      default: 0
    },
    total_gross_premium: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_commission_withheld: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    total_net_due_carrier: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    validation_errors: {
      type: [String],
      default: []
    },
    output_hash: {
      type: String,
      default: null
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
    reporting_frequency: {
      type: String,
      default: 'MONTHLY'
    },
    transmission_protocol: {
      type: String,
      default: 'ACORD_XML_EDI' // ACORD_XML_EDI, SFTP_SECURE, DIRECT_API
    },
    transmission_status: {
      type: String,
      default: 'NOT_TRANSMITTED' // NOT_TRANSMITTED, TRANSMITTED, ACCEPTED, FAILED
    },
    transmitted_at: {
      type: Date,
      default: null
    },
    carrier_ack_id: {
      type: String,
      default: null
    },
    transmission_notes: {
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
    collection: 'bordereau_runs'
  }
);

BordereauRunSchema.index({ tenant_id: 1, run_number: 1 }, { unique: true });
BordereauRunSchema.index({ tenant_id: 1, definition_id: 1, reporting_period: 1, run_version: 1 }, { unique: true });

module.exports = mongoose.model('BordereauRun', BordereauRunSchema);
