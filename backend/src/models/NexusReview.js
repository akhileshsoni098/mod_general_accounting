const mongoose = require('mongoose');

const NexusReviewSchema = new mongoose.Schema(
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
    jurisdiction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxJurisdiction',
      required: true,
      index: true
    },
    review_status: {
      type: String,
      required: true,
      enum: [
        'NOT_REVIEWED',
        'REVIEW_REQUIRED',
        'POTENTIAL_NEXUS',
        'CONFIRMED_BY_REVIEWER',
        'NO_NEXUS_IDENTIFIED',
        'REGISTRATION_REQUIRED',
        'REGISTRATION_COMPLETED'
      ],
      default: 'NOT_REVIEWED',
      index: true
    },
    nexus_type: {
      type: String,
      required: true,
      enum: [
        'PHYSICAL',
        'ECONOMIC',
        'AFFILIATE',
        'MARKETPLACE',
        'CLICK_THROUGH',
        'EMPLOYEE_REMOTE',
        'TRADE_SHOW',
        'OTHER'
      ],
      default: 'PHYSICAL'
    },
    evidence_sources: {
      type: [String],
      default: [] // e.g. ["WAREHOUSE_FACILITY", "REMOTE_SALES_REP", "WAYFAIR_THRESHOLD_REACHED"]
    },
    reviewer_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewed_at: {
      type: Date,
      default: null
    },
    decision_notes: {
      type: String,
      default: '',
      trim: true
    },
    follow_up_action: {
      type: String,
      default: '',
      trim: true
    },
    follow_up_date: {
      type: Date,
      default: null
    },
    related_registration_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxRegistration',
      default: null
    },
    audit_history: [
      {
        status: { type: String, required: true },
        changed_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changed_at: { type: Date, default: Date.now },
        notes: { type: String, default: '' }
      }
    ],
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'nexus_reviews'
  }
);

NexusReviewSchema.index({ tenant_id: 1, company_id: 1, jurisdiction_id: 1 }, { unique: true });
NexusReviewSchema.index({ tenant_id: 1, company_id: 1, review_status: 1 });

module.exports = mongoose.model('NexusReview', NexusReviewSchema);
