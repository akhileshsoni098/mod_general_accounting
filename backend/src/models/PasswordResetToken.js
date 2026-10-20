const mongoose = require('mongoose');

const PasswordResetTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    token_hash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    is_used: {
      type: Boolean,
      default: false,
      index: true
    },
    used_at: {
      type: Date,
      default: null
    },
    expires_at: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'sec_password_reset_tokens'
  }
);

// TTL index to automatically purge expired tokens from MongoDB
PasswordResetTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
