const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { COURSE_CATEGORIES, COURSE_SUBCATEGORY_SLUG_REGEX } = require('../constants');

const slugRule = (location, field) => location(field)
  .trim()
  .isLength({ min: 1, max: 100 }).withMessage('Slug must be between 1 and 100 characters')
  .matches(COURSE_SUBCATEGORY_SLUG_REGEX)
  .withMessage('Slug must contain only lowercase letters, numbers, and single underscores');

const create = [
  body('name').isString().withMessage('Name must be text').bail()
    .trim().notEmpty().withMessage('Course subcategory name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  slugRule(body, 'slug'),
  body('category').isIn(COURSE_CATEGORIES)
    .withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

const update = [
  body('name').optional().isString().withMessage('Name must be text').bail()
    .trim().notEmpty().withMessage('Course subcategory name cannot be empty')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  slugRule(body, 'slug').optional(),
  body('category').optional().isIn(COURSE_CATEGORIES)
    .withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body().custom((payload) => {
    const allowed = ['name', 'slug', 'category', 'isActive'];
    if (allowed.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) return true;
    throw new Error('At least one Course subcategory field must be provided');
  }),
];

const subcategoryIdParam = [
  param('id').custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage('Invalid Course subcategory ID'),
];

const listQuery = [
  query('category').optional().isIn(COURSE_CATEGORIES)
    .withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),
  query('isActive').optional().isBoolean().withMessage('isActive must be a boolean').bail().toBoolean(),
  query('search').optional().isString().withMessage('Search must be text').bail()
    .trim().isLength({ max: 100 }).withMessage('Search cannot exceed 100 characters'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

module.exports = { create, update, subcategoryIdParam, listQuery };
