const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { ENROLLMENT_STATUS } = require('../constants');

const validStatuses = Object.values(ENROLLMENT_STATUS);

// Anonymous enrollment — frontend sends: studentName, email, courseType (string), academicPdf (file)
// courseType can be either a MongoDB ObjectId OR a frontendId string like "cs-1", "math-3"
const submit = [
  body('studentName')
    .trim().notEmpty().withMessage('Student name is required')
    .isLength({ max: 100 }).withMessage('Student name cannot exceed 100 characters'),

  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('courseType')
    .trim().notEmpty().withMessage('Course is required'),
];

const enrollmentIdParam = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid enrollment ID'),
];

// rejectionReason is optional — frontend has no input for it
const reject = [
  ...enrollmentIdParam,
  body('rejectionReason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Rejection reason cannot exceed 500 characters'),
];

const adminListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional()
    .isIn(validStatuses).withMessage(`Status must be one of: ${validStatuses.join(', ')}`),
];

module.exports = { submit, enrollmentIdParam, reject, adminListQuery };
