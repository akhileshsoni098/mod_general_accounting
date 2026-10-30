const mongoose = require('mongoose');

const ProductVariantSchema = new mongoose.Schema(
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
    base_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true,
      index: true
    },
    menu_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      index: true
    },
    variant_name: {
      type: String,
      required: true,
      trim: true
    },
    variant_code: {
      type: String,
      trim: true,
      uppercase: true
    },
    sku: {
      type: String,
      trim: true
    },
    price_adjustment: {
      type: Number,
      default: 0
    },
    price: {
      type: Number,
      default: 0
    },
    recipe_bom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecipeBOM',
      default: null
    },
    is_default: {
      type: Boolean,
      default: false
    },
    is_active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'restaurant_product_variants'
  }
);

ProductVariantSchema.pre('validate', function () {
  if (!this.menu_item_id && this.base_item_id) {
    this.menu_item_id = this.base_item_id;
  }
  if (!this.base_item_id && this.menu_item_id) {
    this.base_item_id = this.menu_item_id;
  }
  if (!this.variant_code) {
    this.variant_code = (this.sku || this.variant_name || '').toUpperCase().trim();
  }
  if (!this.sku) {
    this.sku = this.variant_code;
  }
  if (this.price === undefined || this.price === 0) {
    this.price = this.price_adjustment || 0;
  }
  if (this.price_adjustment === undefined || this.price_adjustment === 0) {
    this.price_adjustment = this.price || 0;
  }
});

ProductVariantSchema.index({ tenant_id: 1, company_id: 1, base_item_id: 1, variant_name: 1 });
ProductVariantSchema.index({ tenant_id: 1, company_id: 1, menu_item_id: 1, variant_code: 1 });

module.exports = mongoose.model('ProductVariant', ProductVariantSchema);
