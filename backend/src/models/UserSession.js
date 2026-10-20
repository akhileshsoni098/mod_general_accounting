const mongoose = require('mongoose');

const UserSessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true
    },
    refresh_token_hash: {
      type: String,
      required: true,
      index: true
    },
    family_id: {
      type: String,
      required: true,
      index: true // Group rotated tokens for reuse detection
    },
    is_revoked: {
      type: Boolean,
      default: false,
      index: true
    },
    revoked_at: {
      type: Date,
      default: null
    },
    revoked_reason: {
      type: String,
      default: null
    },
    ip_address: {
      type: String,
      default: null
    },
    user_agent: {
      type: String,
      default: null
    },
    expires_at: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'sec_user_sessions'
  }
);

// TTL index to automatically purge expired session records from MongoDB
UserSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UserSession', UserSessionSchema);
