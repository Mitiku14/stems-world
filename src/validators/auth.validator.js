const { body } = require('express-validator');

// Frontend register form only enforces minLength:6 — backend matches that exactly
const passwordRules = (field) => [
  body(field).notEmpty().withMessage('Password is required'),
  body(field).isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
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
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

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

  body('phone').optional().trim().isMobilePhone().withMessage('Please provide a valid phone number'),

  body('email').not().exists().withMessage('Email cannot be changed via this endpoint'),
  body('password').not().exists().withMessage('Use the change-password endpoint'),
  body('role').not().exists().withMessage('Role cannot be changed'),
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

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  googleSignIn,
};
