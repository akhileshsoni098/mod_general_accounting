const mongoose = require('mongoose');

const DimensionDefinitionSchema = new mongoose.Schema(
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
      default: null,
      index: true
    },
    dimension_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    display_name: {
      type: String,
      required: true,
      trim: true
    },
    dimension_type: {
      type: String,
      enum: ['COUNTERPARTY', 'TEXT', 'LOOKUP_LIST', 'ORGANIZATION_UNIT', 'POLICY', 'CUSTOM'],
      default: 'CUSTOM'
    },
    target_role: {
      type: String, // e.g. 'CARRIER', 'BROKER', 'MGA', 'REINSURER', 'POLICYHOLDER'
      default: null,
      uppercase: true
    },
    is_required: {
      type: Boolean,
      default: false
    },
    is_system: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    },
    description: {
      type: String,
      default: ''
    },
    allowed_values: [
      {
        type: String,
        trim: true
      }
    ],
    default_value: {
      type: String,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'dimension_definitions'
  }
);

DimensionDefinitionSchema.index({ tenant_id: 1, company_id: 1, dimension_code: 1 }, { unique: true });

module.exports = mongoose.model('DimensionDefinition', DimensionDefinitionSchema);
