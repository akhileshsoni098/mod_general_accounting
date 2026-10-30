const mongoose = require('mongoose');

const TdsSectionSchema = new mongoose.Schema(
  {
    section_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true // e.g. "194C", "194J", "194I", "194H", "194Q"
    },
    section_name: {
      type: String,
      required: true,
      trim: true
    },
    rate_individual_huf_percent: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    rate_company_percent: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    threshold_limit: {
      type: Number,
      default: 30000,
      min: 0
    },
    tds_payable_account_code: {
      type: String,
      default: '2105' // TDS Payable (Current Liability)
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tds_sections'
  }
);

module.exports = mongoose.model('TdsSection', TdsSectionSchema);
