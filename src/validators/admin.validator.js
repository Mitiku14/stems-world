const { body } = require('express-validator');

const createAdmin = [
  body('name')
    .trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),

  body('username')
    .trim().notEmpty().withMessage('Username is required')
    .isLength({ min: 4, max: 30 }).withMessage('Username must be between 4 and 30 characters'),

  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

module.exports = {
  createAdmin,
};
