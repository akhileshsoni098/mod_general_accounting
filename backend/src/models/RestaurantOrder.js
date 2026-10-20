const mongoose = require('mongoose');

const RestaurantOrderItemSchema = new mongoose.Schema(
  {
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true
    },
    item_name: {
      type: String,
      required: true
    },
    variant_name: {
      type: String,
      default: 'STANDARD'
    },
    modifiers: [
      {
        type: String,
        trim: true
      }
    ],
    quantity: {
      type: Number,
      required: true,
      min: 0.0001
    },
    unit_price: {
      type: Number,
      required: true,
      min: 0
    },
    tax_rate_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxRateConfig'
    },
    tax_amount: {
      type: Number,
      default: 0
    },
    line_total: {
      type: Number,
      required: true
    },
    kot_number: {
      type: String,
      default: ''
    },
    kot_status: {
      type: String,
      enum: ['PENDING', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED'],
      default: 'PENDING'
    }
  },
  { _id: true }
);

const RestaurantOrderSchema = new mongoose.Schema(
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
    order_number: {
      type: String,
      required: true,
      trim: true
    },
    order_type: {
      type: String,
      enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      default: 'DINE_IN',
      index: true
    },
    table_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RestaurantTable'
    },
    customer_name: {
      type: String,
      default: 'Walk-in Guest'
    },
    customer_phone: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['DRAFT', 'CONFIRMED', 'KITCHEN_IN_PROGRESS', 'READY', 'SERVED', 'BILLED', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
      index: true
    },
    items: [RestaurantOrderItemSchema],
    subtotal: {
      type: Number,
      default: 0
    },
    tax_total: {
      type: Number,
      default: 0
    },
    discount_total: {
      type: Number,
      default: 0
    },
    grand_total: {
      type: Number,
      default: 0
    },
    commercial_document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommercialDocument'
    },
    ingredients_consumed: {
      type: Boolean,
      default: false
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'restaurant_orders'
  }
);

RestaurantOrderSchema.index({ tenant_id: 1, company_id: 1, order_number: 1 }, { unique: true });

module.exports = mongoose.model('RestaurantOrder', RestaurantOrderSchema);
