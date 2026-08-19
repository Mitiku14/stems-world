const { body, param } = require('express-validator');
const mongoose = require('mongoose');

const courseIdParam = [
  param('courseId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid course ID'),
];

const resourceIdParams = [
  param('courseId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid course ID'),
  param('resourceId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid resource ID'),
];

const createResource = [
  ...courseIdParam,

  body('title')
    .trim()
    .notEmpty()
    .withMessage('Resource title is required')
    .isLength({ max: 150 })
    .withMessage('Resource title cannot exceed 150 characters'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('type')
    .trim()
    .isIn(['pdf', 'video', 'external_link', 'document', 'github_repo', 'other'])
    .withMessage('Type must be one of: pdf, video, external_link, document, github_repo, other'),

  body('url')
    .trim()
    .notEmpty()
    .withMessage('Resource URL is required')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Resource URL must be a valid HTTP/HTTPS URL'),

  body('position')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Position must be a non-negative integer'),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

const updateResource = [
  ...resourceIdParams,

  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty')
    .isLength({ max: 150 })
    .withMessage('Resource title cannot exceed 150 characters'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('type')
    .optional()
    .trim()
    .isIn(['pdf', 'video', 'external_link', 'document', 'github_repo', 'other'])
    .withMessage('Type must be one of: pdf, video, external_link, document, github_repo, other'),

  body('url')
    .optional()
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Resource URL must be a valid HTTP/HTTPS URL'),

  body('position')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Position must be a non-negative integer'),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

module.exports = {
  courseIdParam,
  resourceIdParams,
  createResource,
  updateResource,
};
