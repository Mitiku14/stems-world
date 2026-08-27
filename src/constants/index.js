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
  PHONE_VERIFICATION: 'phoneVerification',
  PASSWORD_RESET:     'passwordReset',
};

const TOKEN_EXPIRY = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000, // 24 hours
  PHONE_VERIFICATION: 5 * 60 * 1000,       // 5 minutes (future OTP flow)
  PASSWORD_RESET:     30 * 60 * 1000,       // 30 minutes
};

const PHONE_OTP = Object.freeze({
  DIGITS: 6,
  MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_MS: 60 * 1000,
});

const AUTH_PROVIDERS = {
  LOCAL:  'local',
  GOOGLE: 'google',
};

const COMMUNICATION_CHANNELS = {
  EMAIL: 'email',
  PHONE: 'phone',
};

const COURSE_CATEGORIES = ['science', 'technology', 'engineering', 'arts', 'mathematics'];
const COURSE_SUBCATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const COURSE_LEVELS     = ['beginner', 'intermediate', 'advanced', 'all'];

const COMPETITION_CATEGORIES = ['steam_innovation', 'olympiad'];
const COMPETITION_TYPES = ['individual', 'team'];
const COMPETITION_SCOPES = ['local', 'national', 'international'];
const COMPETITION_STATUSES = ['draft', 'published', 'completed', 'cancelled'];
const COMPETITION_PROGRESSION_STATUSES = ['not_started', 'in_progress', 'eliminated', 'completed'];
const COMPETITION_ROUND_STATUSES = ['pending', 'passed', 'failed'];

module.exports = {
  ROLES,
  ENROLLMENT_STATUS,
  TOKEN_TYPES,
  TOKEN_EXPIRY,
  PHONE_OTP,
  AUTH_PROVIDERS,
  COMMUNICATION_CHANNELS,
  COURSE_CATEGORIES,
  COURSE_SUBCATEGORY_SLUG_REGEX,
  COURSE_LEVELS,
  COMPETITION_CATEGORIES,
  COMPETITION_TYPES,
  COMPETITION_SCOPES,
  COMPETITION_STATUSES,
  COMPETITION_PROGRESSION_STATUSES,
  COMPETITION_ROUND_STATUSES,
};
