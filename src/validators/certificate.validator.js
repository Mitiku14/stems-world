const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

const certificateIdParam = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid certificate ID'),
];

const verifyParam = [
  param('certificateNumber')
    .trim()
    .notEmpty()
    .withMessage('Certificate number is required')
    .isLength({ min: 5, max: 50 })
    .withMessage('Invalid certificate number format'),
];

const issueBody = [
  body('studentProfileId')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid student profile ID'),

  body('type')
    .trim()
    .isIn(['course_completion', 'competition_achievement', 'hackathon_winner', 'special_recognition'])
    .withMessage('Invalid certificate type'),

  body('title')
    .trim()
    .notEmpty()
    .withMessage('Certificate title is required')
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),

  body('courseId')
    .optional({ nullable: true })
    .custom((v) => !v || mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid course ID'),

  body('competitionId')
    .optional({ nullable: true })
    .custom((v) => !v || mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid competition ID'),

  body('gradeOrRank')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Grade or rank cannot exceed 100 characters'),
];

const myListQuery = [
  query('studentProfileId')
    .optional()
    .custom((v) => !v || mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid student profile ID'),
];

const adminListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['valid', 'revoked']).withMessage('Status must be valid or revoked'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search query cannot exceed 100 characters'),
];

module.exports = {
  certificateIdParam,
  verifyParam,
  issueBody,
  myListQuery,
  adminListQuery,
};
