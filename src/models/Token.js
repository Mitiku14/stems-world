const mongoose = require('mongoose');
const { TOKEN_TYPES } = require('../constants');

const tokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // We store a SHA-256 hash of the token — the raw token only lives in the email link.
    // This way a compromised DB cannot be used to hijack accounts.
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
  {
    timestamps: true,
  }
);

// MongoDB TTL index — automatically deletes expired token documents from the collection.
// The background job runs approximately every 60 seconds.
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast lookup by token hash
tokenSchema.index({ token: 1 });

// Fast lookup to find all tokens for a user (e.g., delete old ones on re-send)
tokenSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model('Token', tokenSchema);
