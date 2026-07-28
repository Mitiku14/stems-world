const mongoose = require('mongoose');
const { ROLES, AUTH_PROVIDERS } = require('../constants');

const userSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────

    username: {
      type: String,
      // Not required at schema level — OAuth users get an auto-generated username.
      // The registration controller enforces it for local sign-ups.
      unique: true,
      sparse: true,       // sparse: allows multiple null values without index collision
      lowercase: true,
      trim: true,
      minlength: [4, 'Username must be at least 4 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },

    name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },

    // ── Credentials ───────────────────────────────────────────────────────────

    password: {
      type: String,
      // Not required at schema level — OAuth users have no password.
      // The registration controller enforces it for local sign-ups.
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,      // never returned in queries by default
    },

    // ── OAuth ─────────────────────────────────────────────────────────────────

    /**
     * How this account was originally created.
     * Used to gate password-specific features (change-password, forgot-password)
     * and to surface the correct "sign in with" hint on the frontend.
     */
    authProvider: {
      type: String,
      enum: Object.values(AUTH_PROVIDERS),
      default: AUTH_PROVIDERS.LOCAL,
    },

    /**
     * Google's stable user identifier (the 'sub' claim from the ID token).
     * Never changes even if the user renames their Google account.
     * Used as the primary lookup key for returning Google sign-in users.
     * sparse: allows local users to have null without triggering unique violations.
     */
    googleId: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
    },

    /**
     * Profile picture URL — populated from Google's picture claim on first sign-in.
     * Can also be set manually by local users in the future.
     */
    avatar: {
      type: String,
      default: null,
    },

    // ── Contact ───────────────────────────────────────────────────────────────

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Access control ────────────────────────────────────────────────────────

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.STUDENT,
    },

    /**
     * true  — email confirmed (via link for local, auto-true for Google).
     * false — account created but email not yet verified (local sign-ups only).
     */
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    /**
     * false — admin has disabled this account.
     * Checked on every authenticated request by verifyToken middleware.
     */
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
