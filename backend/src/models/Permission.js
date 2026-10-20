const mongoose = require('mongoose');

const PermissionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    module: {
      type: String,
      required: true,
      enum: ['PLATFORM', 'TENANT_ADMIN', 'GL', 'BILLING_AR', 'COMMISSIONS_FIDUCIARY', 'TREASURY_BANK_REC', 'FINANCE_CLOSE'],
      uppercase: true
    },
    description: {
      type: String,
      required: true
    },
    row_version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'sec_permissions'
  }
);

module.exports = mongoose.model('Permission', PermissionSchema);
