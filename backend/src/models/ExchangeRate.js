const mongoose = require('mongoose');

const ExchangeRateSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null, // null = system global FX rate
      index: true
    },
    from_currency: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3
    },
    to_currency: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3
    },
    effective_date: {
      type: Date,
      required: true,
      index: true
    },
    rate: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    source: {
      type: String,
      default: 'MANUAL'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'exchange_rates'
  }
);

ExchangeRateSchema.index({ tenant_id: 1, from_currency: 1, to_currency: 1, effective_date: -1 });

module.exports = mongoose.model('ExchangeRate', ExchangeRateSchema);
