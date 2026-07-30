const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { ENROLLMENT_STATUS } = require('../constants');

const validStatuses = Object.values(ENROLLMENT_STATUS);

const submit = [
  body('courseId')
    .notEmpty().withMessage('Course ID is required')
    .custom((v) => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid course ID'),
];

const enrollmentIdParam = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid enrollment ID'),
];

const reject = [
  ...enrollmentIdParam,
  body('rejectionReason').trim().notEmpty().withMessage('Rejection reason is required')
    .isLength({ min: 10, max: 500 }).withMessage('Rejection reason must be 10–500 characters'),
];

const adminListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional()
    .isIn(validStatuses).withMessage(`Status must be one of: ${validStatuses.join(', ')}`),
];

module.exports = { submit, enrollmentIdParam, reject, adminListQuery };
