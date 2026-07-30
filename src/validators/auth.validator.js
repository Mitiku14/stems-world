const { body } = require('express-validator');

const passwordRules = (field) => [
  body(field).notEmpty().withMessage(`${field === 'password' ? 'Password' : 'New password'} is required`),
  body(field).isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body(field).matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter'),
  body(field).matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter'),
  body(field).matches(/[0-9]/).withMessage('Password must contain at least one number'),
];

const register = [
  body('username')
    .trim().notEmpty().withMessage('Username is required')
    .isLength({ min: 4, max: 30 }).withMessage('Username must be 4–30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),

  body('name')
    .trim().notEmpty().withMessage('Full name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),

  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  ...passwordRules('password'),

  body('phone').optional().trim().isMobilePhone().withMessage('Please provide a valid phone number'),
];

const login = [
  body('identifier').trim().notEmpty().withMessage('Email or username is required'),
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
    if (value === req.body.currentPassword) throw new Error('New password must be different from your current password');
    return true;
  }),
];

const googleSignIn = [
  body('idToken').trim().notEmpty().withMessage('Google ID token is required'),
];

module.exports = { register, login, forgotPassword, resetPassword, updateProfile, changePassword, googleSignIn };
