const mongoose = require('mongoose');
const { TOKEN_TYPES } = require('../constants');

const tokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // SHA-256 hash of the raw token — raw token lives only in the email link
    token: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: Object.values(TOKEN_TYPES),
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Present only for phoneVerification tokens. It binds an OTP to the
    // exact canonical phone identity that was current when the OTP was issued.
    targetPhone: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// TTL index — MongoDB automatically removes expired documents (~60s precision)
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
tokenSchema.index({ token: 1 });
tokenSchema.index({ userId: 1, type: 1 });
tokenSchema.index(
  { userId: 1, type: 1 },
  {
    name: 'phone_verification_one_active_per_user',
    unique: true,
    partialFilterExpression: { type: TOKEN_TYPES.PHONE_VERIFICATION },
  }
);

module.exports = mongoose.model('Token', tokenSchema);
