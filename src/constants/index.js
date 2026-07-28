/**
 * Application-wide constants.
 * Always import from here — never hardcode strings in controllers or models.
 */

const ROLES = {
  STUDENT: 'student',
  ADMIN: 'admin',
};

const ENROLLMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const TOKEN_TYPES = {
  EMAIL_VERIFICATION: 'emailVerification',
  PASSWORD_RESET: 'passwordReset',
};

// Token expiry durations (in ms)
const TOKEN_EXPIRY = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,  // 24 hours
  PASSWORD_RESET: 30 * 60 * 1000,            // 30 minutes
};

/**
 * Authentication providers.
 * 'local'  — registered with email + password
 * 'google' — registered via Google OAuth (Sign in with Google)
 */
const AUTH_PROVIDERS = {
  LOCAL: 'local',
  GOOGLE: 'google',
};

/**
 * Course categories and levels.
 * Single source of truth — used by both the Course model enum and course validator.
 * Add new values here only; both schema and validation update automatically.
 */
const COURSE_CATEGORIES = ['programming', 'mathematics', 'language', 'science', 'other'];
const COURSE_LEVELS = ['beginner', 'intermediate', 'advanced', 'all'];

module.exports = {
  ROLES,
  ENROLLMENT_STATUS,
  TOKEN_TYPES,
  TOKEN_EXPIRY,
  AUTH_PROVIDERS,
  COURSE_CATEGORIES,
  COURSE_LEVELS,
};
