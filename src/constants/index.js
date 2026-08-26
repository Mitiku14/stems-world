const ROLES = {
  STUDENT: 'student',
  ADMIN: 'admin',
};

const ENROLLMENT_STATUS = {
  PENDING:  'pending',
  ACCEPTED: 'accepted',  // matches frontend: "accepted" (not "approved")
  REJECTED: 'rejected',
};

const TOKEN_TYPES = {
  EMAIL_VERIFICATION: 'emailVerification',
  PASSWORD_RESET:     'passwordReset',
};

const TOKEN_EXPIRY = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET:     30 * 60 * 1000,       // 30 minutes
};

const AUTH_PROVIDERS = {
  LOCAL:  'local',
  GOOGLE: 'google',
};

const COURSE_CATEGORIES = ['science', 'technology', 'engineering', 'arts', 'mathematics'];
const COURSE_SUBCATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const COURSE_LEVELS     = ['beginner', 'intermediate', 'advanced', 'all'];

const COMPETITION_TYPES = ['competition', 'hackathon', 'workshop', 'training', 'event'];
const COMPETITION_SCOPES = ['local', 'national', 'international'];
const COMPETITION_STATUSES = ['draft', 'upcoming', 'open', 'closed', 'completed', 'cancelled'];

module.exports = {
  ROLES,
  ENROLLMENT_STATUS,
  TOKEN_TYPES,
  TOKEN_EXPIRY,
  AUTH_PROVIDERS,
  COURSE_CATEGORIES,
  COURSE_SUBCATEGORY_SLUG_REGEX,
  COURSE_LEVELS,
  COMPETITION_TYPES,
  COMPETITION_SCOPES,
  COMPETITION_STATUSES,
};
