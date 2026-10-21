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
      enum: [
        'PLATFORM',
        'TENANT_ADMIN',
        'GL',
        'BILLING_AR',
        'TREASURY_BANK_REC',
        'FINANCE_CLOSE',
        'INVENTORY',
        'COMMERCIAL',
        'RETAIL_POS',
        'RESTAURANT',
        'HOTEL_PMS',
        'MANUFACTURING',
        'GENERAL',
        'COMMISSIONS_FIDUCIARY'
      ],
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
