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

const TOKEN_EXPIRY = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET: 30 * 60 * 1000,           // 30 minutes
};

const AUTH_PROVIDERS = {
  LOCAL: 'local',
  GOOGLE: 'google',
};

// Single source of truth for course enums — used by both model and validator
const COURSE_CATEGORIES = ['programming', 'mathematics', 'language', 'science', 'other'];
const COURSE_LEVELS     = ['beginner', 'intermediate', 'advanced', 'all'];

module.exports = {
  ROLES,
  ENROLLMENT_STATUS,
  TOKEN_TYPES,
  TOKEN_EXPIRY,
  AUTH_PROVIDERS,
  COURSE_CATEGORIES,
  COURSE_LEVELS,
};
