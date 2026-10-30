const mongoose = require('mongoose');

const RestaurantTableSchema = new mongoose.Schema(
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
    table_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    section: {
      type: String,
      default: 'MAIN_HALL',
      trim: true,
      uppercase: true
    },
    capacity: {
      type: Number,
      default: 4
    },
    status: {
      type: String,
      enum: ['VACANT', 'OCCUPIED', 'RESERVED', 'BILLED'],
      default: 'VACANT',
      index: true
    },
    current_order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RestaurantOrder'
    },
    location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StoreLocation',
      default: null,
      index: true
    },
    table_qr_token: {
      type: String,
      default: null,
      index: true
    },
    is_active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'restaurant_tables'
  }
);

RestaurantTableSchema.index({ tenant_id: 1, company_id: 1, table_number: 1 }, { unique: true });

module.exports = mongoose.model('RestaurantTable', RestaurantTableSchema);
