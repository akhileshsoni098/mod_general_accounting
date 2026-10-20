const mongoose = require('mongoose');

const UnitOfMeasurementSchema = new mongoose.Schema(
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
    unit_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true // e.g. "PCS", "KG", "GRAM", "LTR", "MTR", "BOX"
    },
    unit_name: {
      type: String,
      required: true,
      trim: true // e.g. "Pieces", "Kilograms"
    },
    unit_type: {
      type: String,
      required: true,
      enum: ['COUNT', 'MASS', 'VOLUME', 'LENGTH', 'AREA', 'TIME', 'PACKAGING', 'CUSTOM'],
      default: 'COUNT'
    },
    decimal_places: {
      type: Number,
      required: true,
      min: 0,
      max: 4,
      default: 0
    },
    is_system_standard: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'units_of_measurement'
  }
);

// Enforce unique unit code per company within tenant
UnitOfMeasurementSchema.index({ tenant_id: 1, company_id: 1, unit_code: 1 }, { unique: true });
UnitOfMeasurementSchema.index({ tenant_id: 1, company_id: 1, status: 1 });
UnitOfMeasurementSchema.index({ tenant_id: 1, company_id: 1, unit_type: 1 });

module.exports = mongoose.model('UnitOfMeasurement', UnitOfMeasurementSchema);
