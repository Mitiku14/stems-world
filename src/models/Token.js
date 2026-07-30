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
  },
  { timestamps: true }
);

// TTL index — MongoDB automatically removes expired documents (~60s precision)
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
tokenSchema.index({ token: 1 });
tokenSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model('Token', tokenSchema);
