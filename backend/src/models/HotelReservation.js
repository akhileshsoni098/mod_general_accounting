const mongoose = require('mongoose');

const HotelReservationSchema = new mongoose.Schema(
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
    reservation_number: {
      type: String,
      required: true,
      trim: true
    },
    guest_name: {
      type: String,
      required: true,
      trim: true
    },
    guest_email: {
      type: String,
      default: ''
    },
    guest_phone: {
      type: String,
      default: ''
    },
    guest_id_proof: {
      type: String,
      default: ''
    },
    room_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HotelRoomType',
      required: true
    },
    room_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HotelRoom'
    },
    check_in_date: {
      type: Date,
      required: true
    },
    check_out_date: {
      type: Date,
      required: true
    },
    nights: {
      type: Number,
      required: true,
      min: 1
    },
    rate_per_night: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'],
      default: 'CONFIRMED',
      index: true
    },
    deposit_amount: {
      type: Number,
      default: 0
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'hotel_reservations'
  }
);

HotelReservationSchema.index({ tenant_id: 1, company_id: 1, reservation_number: 1 }, { unique: true });

module.exports = mongoose.model('HotelReservation', HotelReservationSchema);
