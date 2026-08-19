const { body, query, param } = require('express-validator');
const mongoose = require('mongoose');
const { COURSE_CATEGORIES, COURSE_LEVELS } = require('../constants');

const create = [
  body('title').trim().notEmpty().withMessage('Course title is required')
    .isLength({ max: 150 }).withMessage('Title cannot exceed 150 characters'),

  body('description').optional().trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

  body('category').optional()
    .isIn(COURSE_CATEGORIES).withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),

  body('level').optional()
    .isIn(COURSE_LEVELS).withMessage(`Level must be one of: ${COURSE_LEVELS.join(', ')}`),

  body('requiresDocument').optional()
    .isBoolean().withMessage('requiresDocument must be a boolean'),

  body('imageUrl').optional({ checkFalsy: true }).trim()
    .custom((value) => {
      // Allow relative paths starting with '/'
      if (value.startsWith('/')) {
        if (/\s/.test(value)) {
          throw new Error('Relative image path must not contain spaces');
        }
        return true;
      }
      // Otherwise validate as an absolute URL
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('imageUrl must be an HTTP or HTTPS URL');
        }
        return true;
      } catch (err) {
        throw new Error('imageUrl must be a valid URL or relative path starting with /');
      }
    }),

  body('syllabus').optional().isArray().withMessage('Syllabus must be an array'),
  body('syllabus.*').isString().trim().notEmpty().withMessage('Each syllabus item must be a non-empty string'),

  body('instructor').optional({ nullable: true }).trim()
    .isLength({ max: 100 }).withMessage('Instructor name cannot exceed 100 characters'),

  body('duration').optional({ nullable: true }).trim()
    .isLength({ max: 50 }).withMessage('Duration cannot exceed 50 characters'),

  body('requirements').optional().isArray().withMessage('Requirements must be an array'),
  body('requirements.*').isString().trim().notEmpty().withMessage('Each requirement must be a non-empty string'),

  body('registrationOpenDate').optional({ nullable: true })
    .isISO8601().withMessage('registrationOpenDate must be a valid ISO 8601 date'),

  body('registrationCloseDate').optional({ nullable: true })
    .isISO8601().withMessage('registrationCloseDate must be a valid ISO 8601 date'),

  body('season').optional({ nullable: true }).trim()
    .isLength({ max: 50 }).withMessage('Season cannot exceed 50 characters'),

  body('maxStudents').optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('maxStudents must be an integer ≥ 1'),

  body('sites').optional().isArray().withMessage('Sites must be an array'),
  body('sites.*').isMongoId().withMessage('Each site must be a valid MongoDB ID'),
];

const update = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty')
    .isLength({ max: 150 }).withMessage('Title cannot exceed 150 characters'),

  body('description').optional().trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

  body('category').optional()
    .isIn(COURSE_CATEGORIES).withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),

  body('level').optional()
    .isIn(COURSE_LEVELS).withMessage(`Level must be one of: ${COURSE_LEVELS.join(', ')}`),

  body('requiresDocument').optional()
    .isBoolean().withMessage('requiresDocument must be a boolean'),

  body('imageUrl').optional({ checkFalsy: true }).trim()
    .custom((value) => {
      // Allow relative paths starting with '/'
      if (value.startsWith('/')) {
        if (/\s/.test(value)) {
          throw new Error('Relative image path must not contain spaces');
        }
        return true;
      }
      // Otherwise validate as an absolute URL
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('imageUrl must be an HTTP or HTTPS URL');
        }
        return true;
      } catch (err) {
        throw new Error('imageUrl must be a valid URL or relative path starting with /');
      }
    }),

  body('syllabus').optional().isArray().withMessage('Syllabus must be an array'),
  body('syllabus.*').isString().trim().notEmpty().withMessage('Each syllabus item must be a non-empty string'),

  body('instructor').optional({ nullable: true }).trim()
    .isLength({ max: 100 }).withMessage('Instructor name cannot exceed 100 characters'),

  body('duration').optional({ nullable: true }).trim()
    .isLength({ max: 50 }).withMessage('Duration cannot exceed 50 characters'),

  body('requirements').optional().isArray().withMessage('Requirements must be an array'),
  body('requirements.*').isString().trim().notEmpty().withMessage('Each requirement must be a non-empty string'),

  body('registrationOpenDate').optional({ nullable: true })
    .isISO8601().withMessage('registrationOpenDate must be a valid ISO 8601 date'),

  body('registrationCloseDate').optional({ nullable: true })
    .isISO8601().withMessage('registrationCloseDate must be a valid ISO 8601 date'),

  body('season').optional({ nullable: true }).trim()
    .isLength({ max: 50 }).withMessage('Season cannot exceed 50 characters'),

  body('maxStudents').optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('maxStudents must be an integer ≥ 1'),

  body('sites').optional().isArray().withMessage('Sites must be an array'),
  body('sites.*').isMongoId().withMessage('Each site must be a valid MongoDB ID'),
];

const courseIdParam = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid course ID'),
];

const listQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('category').optional()
    .isIn(COURSE_CATEGORIES).withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),
  query('level').optional()
    .isIn(COURSE_LEVELS).withMessage(`Level must be one of: ${COURSE_LEVELS.join(', ')}`),
];

module.exports = { create, update, courseIdParam, listQuery };
