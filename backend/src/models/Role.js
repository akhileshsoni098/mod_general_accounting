const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null, // null indicates system/platform-wide standard role template
      index: true
    },
    code: {
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
    description: {
      type: String,
      default: ''
    },
    is_system_role: {
      type: Boolean,
      default: false
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'sec_roles'
  }
);

RoleSchema.index({ tenant_id: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Role', RoleSchema);
