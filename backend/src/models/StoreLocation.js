const mongoose = require('mongoose');

const StoreLocationSchema = new mongoose.Schema(
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
    location_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: 'Pune' },
      state: { type: String, default: 'Maharashtra' },
      postal_code: { type: String, default: '411001' },
      country: { type: String, default: 'India' }
    },
    phone: {
      type: String,
      default: ''
    },
    email: {
      type: String,
      default: ''
    },
    enabled_channels: [
      {
        type: String,
        enum: ['DINE_IN', 'TAKEAWAY', 'KIOSK', 'TABLE_QR', 'DELIVERY', 'DRIVE_THRU'],
        default: ['DINE_IN', 'TAKEAWAY', 'KIOSK']
      }
    ],
    kiosk_settings: {
      is_enabled: { type: Boolean, default: true },
      welcome_title: { type: String, default: 'Welcome to Fresh Handcrafted Pizzas' },
      welcome_subtitle: { type: String, default: 'Customize your crust, toppings & scan QR to pay' },
      idle_timeout_seconds: { type: Number, default: 90 },
      primary_color: { type: String, default: '#059669' }
    },
    kitchen_stations: [
      {
        code: { type: String, required: true, uppercase: true },
        name: { type: String, required: true },
        is_active: { type: Boolean, default: true }
      }
    ],
    default_godown_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Godown'
    },
    default_pos_cash_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerAccount'
    },
    default_tax_rate_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxRateConfig'
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'store_locations'
  }
);

StoreLocationSchema.index({ tenant_id: 1, company_id: 1, location_code: 1 }, { unique: true });
StoreLocationSchema.index({ tenant_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('StoreLocation', StoreLocationSchema);
