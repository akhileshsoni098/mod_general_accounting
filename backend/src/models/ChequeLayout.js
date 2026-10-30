const mongoose = require('mongoose');

const ChequeLayoutSchema = new mongoose.Schema(
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
    bank_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount',
      default: null,
      index: true
    },
    bank_name: {
      type: String,
      required: true,
      trim: true
    },
    layout_name: {
      type: String,
      required: true,
      trim: true
    },
    cheque_width_mm: {
      type: Number,
      default: 203 // Standard Indian CTS-2010 cheque width: 203mm (8 inches)
    },
    cheque_height_mm: {
      type: Number,
      default: 93 // Standard Indian CTS-2010 cheque height: 93mm (3.66 inches)
    },
    date_coordinates: {
      x_mm: { type: Number, default: 153 },
      y_mm: { type: Number, default: 12 },
      letter_spacing_mm: { type: Number, default: 4.8 },
      format: { type: String, default: 'DDMMYYYY' }
    },
    payee_coordinates: {
      x_mm: { type: Number, default: 22 },
      y_mm: { type: Number, default: 28 },
      max_width_mm: { type: Number, default: 135 }
    },
    amount_words_coordinates: {
      line1_x_mm: { type: Number, default: 28 },
      line1_y_mm: { type: Number, default: 38 },
      line2_x_mm: { type: Number, default: 15 },
      line2_y_mm: { type: Number, default: 46 },
      max_chars_line1: { type: Number, default: 45 }
    },
    amount_figures_coordinates: {
      x_mm: { type: Number, default: 152 },
      y_mm: { type: Number, default: 44 },
      prefix: { type: String, default: '**₹ ' }
    },
    ac_payee_crossing: {
      enabled: { type: Boolean, default: true },
      x_mm: { type: Number, default: 18 },
      y_mm: { type: Number, default: 8 },
      text: { type: String, default: 'A/C PAYEE ONLY' }
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'cheque_layouts'
  }
);

ChequeLayoutSchema.index({ tenant_id: 1, company_id: 1, layout_name: 1 }, { unique: true });

module.exports = mongoose.model('ChequeLayout', ChequeLayoutSchema);
