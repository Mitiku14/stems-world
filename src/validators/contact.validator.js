const { body, query } = require('express-validator');

// Matches ContactForm.tsx fields: name, email, subject, message
const submit = [
  body('name')
    .trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),

  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('subject')
    .trim().notEmpty().withMessage('Subject is required')
    .isLength({ max: 200 }).withMessage('Subject cannot exceed 200 characters'),

  body('message')
    .trim().notEmpty().withMessage('Message is required')
    .isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters'),
];

const listQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search query cannot exceed 100 characters'),
];

module.exports = { submit, listQuery };
