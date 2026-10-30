const mongoose = require('mongoose');

const ChequeRegisterSchema = new mongoose.Schema(
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
      required: true,
      index: true
    },
    cheque_number: {
      type: String,
      required: true,
      trim: true
    },
    cheque_date: {
      type: Date,
      required: true
    },
    payee_name: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true
    },
    amount_in_words: {
      type: String,
      required: true
    },
    voucher_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal',
      default: null
    },
    status: {
      type: String,
      enum: ['ISSUED', 'CLEARED', 'CANCELLED', 'STALE'],
      default: 'ISSUED'
    },
    printed_at: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'cheque_register'
  }
);

ChequeRegisterSchema.index(
  { tenant_id: 1, company_id: 1, bank_account_id: 1, cheque_number: 1 },
  { unique: true }
);

module.exports = mongoose.model('ChequeRegister', ChequeRegisterSchema);
