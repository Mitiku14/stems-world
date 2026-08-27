const { body } = require('express-validator');
const { COMMUNICATION_CHANNELS } = require('../constants');
const normalizePhone = require('../utils/normalizePhone');

const passwordRules = (field) => [
  body(field).notEmpty().withMessage('Password is required'),
  body(field).isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

// Frontend signup sends: { fullName, email, password }
// No username field exists in the frontend form.
const register = [
  body('fullName')
    .trim().notEmpty().withMessage('Full name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),

  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  ...passwordRules('password'),
];

// Frontend login sends: { email, password }
// The frontend uses email field directly (not a combined "identifier" field).
const login = [
  body('email').optional().trim(),
  body('identifier').optional().trim(),
  body().custom((_, { req }) => {
    const id = req.body.email || req.body.identifier;
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new Error('Email or username identifier is required');
    }
    if (id.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(id.trim())) {
        throw new Error('Please provide a valid email address');
      }
    }
    return true;
  }),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPassword = [
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
];

const resetPassword = [
  ...passwordRules('password'),

  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
];

const updateProfile = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),

  body('phone')
    .optional({ nullable: true })
    .customSanitizer((value) => (typeof value === 'string' ? value.trim() : value))
    .custom((value) => {
      if (value === null || value === '') return true;
      normalizePhone(value);
      return true;
    }).withMessage('Please provide a valid Ethiopian local or international phone number')
    .customSanitizer((value) => {
      if (value === null || value === '') return null;
      try {
        return normalizePhone(value);
      } catch {
        return value;
      }
    }),

  body('preferredCommunication')
    .optional()
    .isIn(Object.values(COMMUNICATION_CHANNELS))
    .withMessage('Preferred communication must be email or phone'),

  body('email').not().exists().withMessage('Email cannot be changed via this endpoint'),
  body('password').not().exists().withMessage('Use the change-password endpoint'),
  body('role').not().exists().withMessage('Role cannot be changed'),
  body('isPhoneVerified').not().exists().withMessage('Phone verification cannot be changed directly'),
];

const changePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),

  ...passwordRules('newPassword'),

  body('newPassword').custom((value, { req }) => {
    if (value === req.body.currentPassword) {
      throw new Error('New password must be different from your current password');
    }
    return true;
  }),
];

const googleSignIn = [
  body('idToken').trim().notEmpty().withMessage('Google ID token is required'),
];

const verifyPhone = [
  body('code')
    .trim()
    .notEmpty().withMessage('Verification code is required')
    .isString().withMessage('Verification code must be a string')
    .matches(/^\d{6}$/).withMessage('Verification code must be exactly 6 digits'),
];

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  googleSignIn,
  verifyPhone,
};
