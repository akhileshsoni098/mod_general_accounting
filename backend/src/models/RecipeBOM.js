const mongoose = require('mongoose');

const RecipeBOMSchema = new mongoose.Schema(
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
    menu_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true,
      index: true
    },
    variant_name: {
      type: String,
      default: 'STANDARD',
      trim: true,
      uppercase: true
    },
    yield_quantity: {
      type: Number,
      required: true,
      default: 1
    },
    yield_uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement'
    },
    ingredients: [
      {
        ingredient_item_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'StockItem',
          required: true
        },
        quantity: {
          type: Number,
          required: true
        },
        uom_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'UnitOfMeasurement',
          required: true
        },
        waste_percentage: {
          type: Number,
          default: 0
        }
      }
    ],
    is_active: {
      type: Boolean,
      default: true
    },
    version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'recipe_boms'
  }
);

RecipeBOMSchema.index({ tenant_id: 1, company_id: 1, menu_item_id: 1, variant_name: 1 }, { unique: true });

module.exports = mongoose.model('RecipeBOM', RecipeBOMSchema);
