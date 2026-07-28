const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { ENROLLMENT_STATUS } = require('../constants');

const submit = [
  body('courseId')
    .notEmpty().withMessage('Course ID is required')
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage('Invalid course ID'),
];

const enrollmentIdParam = [
  param('id')
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage('Invalid enrollment ID'),
];

const reject = [
  ...enrollmentIdParam,

  body('rejectionReason')
    .trim()
    .notEmpty().withMessage('Rejection reason is required')
    .isLength({ min: 10, max: 500 }).withMessage('Rejection reason must be 10–500 characters'),
];

// Shared pagination + status filter validation for admin list endpoints
const adminListQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

  query('status')
    .optional()
    .isIn(Object.values(ENROLLMENT_STATUS))
    .withMessage(`Status must be one of: ${Object.values(ENROLLMENT_STATUS).join(', ')}`),
];

module.exports = { submit, enrollmentIdParam, reject, adminListQuery };
