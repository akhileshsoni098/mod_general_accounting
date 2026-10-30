const mongoose = require('mongoose');

const RestaurantConfigSchema = new mongoose.Schema(
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
    location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StoreLocation',
      default: null,
      index: true
    },
    operating_mode: {
      type: String,
      enum: ['QSR_KIOSK', 'DINE_IN', 'QUICK_COUNTER', 'CLOUD_KITCHEN', 'CAFE'],
      default: 'QSR_KIOSK'
    },
    customer_info_policy: {
      name: {
        type: String,
        enum: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        default: 'OPTIONAL'
      },
      phone: {
        type: String,
        enum: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        default: 'REQUIRED'
      },
      email: {
        type: String,
        enum: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        default: 'OPTIONAL'
      },
      address: {
        type: String,
        enum: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        default: 'HIDDEN'
      },
      allow_anonymous_walkin: {
        type: Boolean,
        default: true
      }
    },
    modifier_rules: {
      allow_ingredient_removal: {
        type: Boolean,
        default: true
      },
      removals_reduce_price: {
        type: Boolean,
        default: false
      },
      allow_chargeable_add_ons: {
        type: Boolean,
        default: true
      },
      enforce_stock_availability: {
        type: Boolean,
        default: true
      }
    },
    payment_policy: {
      settlement_timing: {
        type: String,
        enum: ['PRE_PAID', 'POST_PAID'],
        default: 'PRE_PAID'
      },
      supported_methods: [
        {
          type: String,
          enum: ['UPI_DYNAMIC_QR', 'CASH', 'CARD_EDC', 'GATEWAY_VERIFIED'],
          default: ['UPI_DYNAMIC_QR', 'CASH']
        }
      ],
      upi_vpa: {
        type: String,
        default: 'pizzapalace@icici'
      },
      merchant_display_name: {
        type: String,
        default: 'Pizza Palace Enterprises Ltd'
      },
      auto_print_receipt_on_pay: {
        type: Boolean,
        default: true
      }
    },
    order_dispatch_policy: {
      auto_send_to_kitchen_on_pay: {
        type: Boolean,
        default: true
      },
      require_cashier_acceptance: {
        type: Boolean,
        default: false
      },
      sound_alerts: {
        type: Boolean,
        default: true
      }
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'restaurant_configs'
  }
);

RestaurantConfigSchema.index({ tenant_id: 1, company_id: 1, location_id: 1 }, { unique: true });

module.exports = mongoose.model('RestaurantConfig', RestaurantConfigSchema);
