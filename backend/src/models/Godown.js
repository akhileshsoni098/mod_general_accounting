const mongoose = require('mongoose');

const GodownSchema = new mongoose.Schema(
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
    godown_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "MAIN", "SHOP_FLOOR", "GODOWN_NORTH"
    },
    godown_name: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      postal_code: { type: String, default: '' }
    },
    is_default: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'godowns'
  }
);

// Enforce unique godown code per company within tenant
GodownSchema.index({ tenant_id: 1, company_id: 1, godown_code: 1 }, { unique: true });
GodownSchema.index({ tenant_id: 1, company_id: 1, status: 1 });
GodownSchema.index({ tenant_id: 1, company_id: 1, is_default: 1 });

module.exports = mongoose.model('Godown', GodownSchema);
