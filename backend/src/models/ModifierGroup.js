const mongoose = require('mongoose');

const ModifierOptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      trim: true,
      uppercase: true
    },
    price_adjustment: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    is_default: {
      type: Boolean,
      default: false
    },
    // Raw material inventory link for stock auto-consumption
    ingredient_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      default: null
    },
    quantity_to_consume: {
      type: Number,
      default: 0
    },
    uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement',
      default: null
    },
    is_active: {
      type: Boolean,
      default: true
    }
  },
  { _id: true }
);

const ModifierGroupSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true
    },
    display_title: {
      type: String,
      default: 'Choose Options'
    },
    min_selections: {
      type: Number,
      default: 0,
      min: 0
    },
    max_selections: {
      type: Number,
      default: 10,
      min: 1
    },
    is_required: {
      type: Boolean,
      default: false
    },
    allow_multiple_quantities: {
      type: Boolean,
      default: false
    },
    options: [ModifierOptionSchema],
    applicable_item_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StockItem'
      }
    ],
    applicable_category_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StockCategory'
      }
    ],
    is_active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'restaurant_modifier_groups'
  }
);

ModifierGroupSchema.index({ tenant_id: 1, company_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ModifierGroup', ModifierGroupSchema);
