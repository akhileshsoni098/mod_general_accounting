const mongoose = require('mongoose');

const HotelRoomSchema = new mongoose.Schema(
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
    room_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    room_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HotelRoomType',
      required: true
    },
    floor: {
      type: String,
      default: '1'
    },
    status: {
      type: String,
      enum: ['CLEAN', 'DIRTY', 'OCCUPIED', 'MAINTENANCE', 'OUT_OF_SERVICE'],
      default: 'CLEAN',
      index: true
    },
    current_reservation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HotelReservation'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'hotel_rooms'
  }
);

HotelRoomSchema.index({ tenant_id: 1, company_id: 1, room_number: 1 }, { unique: true });

module.exports = mongoose.model('HotelRoom', HotelRoomSchema);
