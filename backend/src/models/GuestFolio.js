const mongoose = require('mongoose');

const FolioChargeLineSchema = new mongoose.Schema(
  {
    charge_type: {
      type: String,
      enum: ['ROOM_CHARGE', 'FOOD_BEVERAGE', 'LAUNDRY', 'AMENITY', 'TAX', 'PAYMENT', 'DISCOUNT'],
      required: true
    },
    description: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    posted_by_night_audit: {
      type: Boolean,
      default: false
    },
    night_audit_date: {
      type: String,
      default: '' // YYYY-MM-DD
    }
  },
  { _id: true }
);

const GuestFolioSchema = new mongoose.Schema(
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
    reservation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HotelReservation',
      required: true,
      index: true
    },
    folio_number: {
      type: String,
      required: true,
      trim: true
    },
    guest_name: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['OPEN', 'SETTLED', 'CANCELLED'],
      default: 'OPEN',
      index: true
    },
    charges: [FolioChargeLineSchema],
    total_charges: {
      type: Number,
      default: 0
    },
    total_payments: {
      type: Number,
      default: 0
    },
    balance_due: {
      type: Number,
      default: 0
    },
    commercial_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'guest_folios'
  }
);

GuestFolioSchema.index({ tenant_id: 1, company_id: 1, folio_number: 1 }, { unique: true });

module.exports = mongoose.model('GuestFolio', GuestFolioSchema);
