const mongoose = require('mongoose');

const HotelRoomTypeSchema = new mongoose.Schema(
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
    type_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    type_name: {
      type: String,
      required: true,
      trim: true
    },
    base_rate: {
      type: Number,
      required: true,
      min: 0
    },
    max_occupancy: {
      type: Number,
      default: 2
    },
    amenities: [
      {
        type: String,
        trim: true
      }
    ],
    is_active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'hotel_room_types'
  }
);

HotelRoomTypeSchema.index({ tenant_id: 1, company_id: 1, type_code: 1 }, { unique: true });

module.exports = mongoose.model('HotelRoomType', HotelRoomTypeSchema);
