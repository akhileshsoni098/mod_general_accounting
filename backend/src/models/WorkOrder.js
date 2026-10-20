const mongoose = require('mongoose');

const WorkOrderSchema = new mongoose.Schema(
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
      trim: true,
      uppercase: true
    },
    bom_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ManufacturingBOM',
      required: true
    },
    finished_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockItem',
      required: true
    },
    planned_quantity: {
      type: Number,
      required: true,
      min: 0.0001
    },
    completed_quantity: {
      type: Number,
      default: 0
    },
    scrap_quantity: {
      type: Number,
      default: 0
    },
    raw_materials_godown_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Godown',
      required: true
    },
    finished_goods_godown_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Godown',
      required: true
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
      index: true
    },
    raw_materials_issued: {
      type: Boolean,
      default: false
    },
    finished_goods_received: {
      type: Boolean,
      default: false
    },
    total_cost: {
      type: Number,
      default: 0
    },
    unit_cost: {
      type: Number,
      default: 0
    },
    journal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journal'
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'work_orders'
  }
);

WorkOrderSchema.index({ tenant_id: 1, company_id: 1, order_number: 1 }, { unique: true });

module.exports = mongoose.model('WorkOrder', WorkOrderSchema);
