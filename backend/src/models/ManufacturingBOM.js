const mongoose = require('mongoose');

const ManufacturingBOMSchema = new mongoose.Schema(
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
    bom_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    bom_name: {
      type: String,
      required: true,
      trim: true
    },
    finished_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true,
      index: true
    },
    output_quantity: {
      type: Number,
      required: true,
      default: 1
    },
    output_uom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UnitOfMeasurement'
    },
    raw_materials: [
      {
        item_id: {
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
        scrap_percentage: {
          type: Number,
          default: 0
        }
      }
    ],
    overhead_costs: [
      {
        cost_name: {
          type: String,
          required: true
        },
        cost_amount: {
          type: Number,
          required: true
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
    collection: 'manufacturing_boms'
  }
);

ManufacturingBOMSchema.index({ tenant_id: 1, company_id: 1, bom_number: 1 }, { unique: true });

module.exports = mongoose.model('ManufacturingBOM', ManufacturingBOMSchema);
