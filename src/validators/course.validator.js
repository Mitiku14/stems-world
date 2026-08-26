const { body, query, param } = require('express-validator');
const mongoose = require('mongoose');
const { COURSE_CATEGORIES, STEAM_SUBCATEGORIES, COURSE_LEVELS } = require('../constants');
const Course = require('../models/Course');
const Site = require('../models/Site');

const courseSubcategories = Object.values(STEAM_SUBCATEGORIES).flat();

const validateTaxonomyPair = (category, subcategory) => {
  if (STEAM_SUBCATEGORIES[category]?.includes(subcategory)) return true;
  throw new Error(`Subcategory "${subcategory}" is not valid for category "${category}"`);
};

const validateUpdatedTaxonomy = async (payload, req) => {
  const { category, subcategory } = payload;
  if (category === undefined && subcategory === undefined) return true;

  let finalCategory = category;
  let finalSubcategory = subcategory;

  if ((finalCategory === undefined || finalSubcategory === undefined)
      && req.params?.id && mongoose.Types.ObjectId.isValid(req.params.id)) {
    const existing = await Course.findById(req.params.id).select('category subcategory').lean();
    if (!existing) return true;
    finalCategory ??= existing.category;
    finalSubcategory ??= existing.subcategory;
  }

  return validateTaxonomyPair(finalCategory, finalSubcategory);
};

const validateCourseSites = async (sites) => {
  if (!sites || !Array.isArray(sites) || sites.length === 0) return true;

  const stringIds = sites.map((s) => s.toString());
  const uniqueSites = new Set(stringIds);
  if (uniqueSites.size !== sites.length) {
    throw new Error('Duplicate site IDs are not allowed in the same course');
  }

  for (const siteId of stringIds) {
    if (!mongoose.Types.ObjectId.isValid(siteId)) {
      throw new Error(`Invalid site ID format: ${siteId}`);
    }
  }

  const foundSites = await Site.find({
    _id: { $in: sites },
    isActive: true,
  }).select('_id').lean();

  if (foundSites.length !== sites.length) {
    const foundIds = new Set(foundSites.map((s) => s._id.toString()));
    const invalidOrInactive = stringIds.filter((id) => !foundIds.has(id));
    throw new Error(`The following site ID(s) do not exist or are inactive: ${invalidOrInactive.join(', ')}`);
  }

  return true;
};

const create = [
  body('title').trim().notEmpty().withMessage('Course title is required')
    .isLength({ max: 150 }).withMessage('Title cannot exceed 150 characters'),

  body('description').optional().trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

  body('category').notEmpty().withMessage('Course category is required').bail()
    .isIn(COURSE_CATEGORIES).withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),

  body('subcategory').notEmpty().withMessage('Course subcategory is required').bail()
    .isIn(courseSubcategories).withMessage('Subcategory is not recognized').bail()
    .custom((value, { req }) => validateTaxonomyPair(req.body.category, value)),

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
    .isISO8601().withMessage('registrationCloseDate must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (value && req.body.registrationOpenDate) {
        const openDate = new Date(req.body.registrationOpenDate);
        const closeDate = new Date(value);
        if (!isNaN(openDate.getTime()) && closeDate < openDate) {
          throw new Error('registrationCloseDate cannot be earlier than registrationOpenDate');
        }
      }
      return true;
    }),

  body('season').optional({ nullable: true }).trim()
    .isLength({ max: 50 }).withMessage('Season cannot exceed 50 characters'),

  body('maxStudents').optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('maxStudents must be an integer ≥ 1'),

  body('sites').optional().isArray().withMessage('Sites must be an array')
    .custom(validateCourseSites),
  body('sites.*').isMongoId().withMessage('Each site must be a valid MongoDB ID'),
];

const update = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty')
    .isLength({ max: 150 }).withMessage('Title cannot exceed 150 characters'),

  body('description').optional().trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

  body('category').optional()
    .isIn(COURSE_CATEGORIES).withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),

  body('subcategory').optional()
    .isIn(courseSubcategories).withMessage('Subcategory is not recognized'),

  body().custom((payload, { req }) => validateUpdatedTaxonomy(payload, req)),

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
    .isISO8601().withMessage('registrationOpenDate must be a valid ISO 8601 date')
    .custom(async (value, { req }) => {
      if (!value) return true;
      let closeDateStr = req.body.registrationCloseDate;

      if (closeDateStr === undefined && req.params?.id && mongoose.Types.ObjectId.isValid(req.params.id)) {
        const existing = await Course.findById(req.params.id).select('registrationCloseDate').lean();
        if (existing && existing.registrationCloseDate) {
          closeDateStr = existing.registrationCloseDate;
        }
      }

      if (closeDateStr) {
        const openDate = new Date(value);
        const closeDate = new Date(closeDateStr);
        if (!isNaN(closeDate.getTime()) && closeDate < openDate) {
          throw new Error('registrationOpenDate cannot be later than registrationCloseDate');
        }
      }
      return true;
    }),

  body('registrationCloseDate').optional({ nullable: true })
    .isISO8601().withMessage('registrationCloseDate must be a valid ISO 8601 date')
    .custom(async (value, { req }) => {
      if (!value) return true;
      let openDateStr = req.body.registrationOpenDate;

      if (openDateStr === undefined && req.params?.id && mongoose.Types.ObjectId.isValid(req.params.id)) {
        const existing = await Course.findById(req.params.id).select('registrationOpenDate').lean();
        if (existing && existing.registrationOpenDate) {
          openDateStr = existing.registrationOpenDate;
        }
      }

      if (openDateStr) {
        const openDate = new Date(openDateStr);
        const closeDate = new Date(value);
        if (!isNaN(openDate.getTime()) && closeDate < openDate) {
          throw new Error('registrationCloseDate cannot be earlier than registrationOpenDate');
        }
      }
      return true;
    }),

  body('season').optional({ nullable: true }).trim()
    .isLength({ max: 50 }).withMessage('Season cannot exceed 50 characters'),

  body('maxStudents').optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('maxStudents must be an integer ≥ 1'),

  body('sites').optional().isArray().withMessage('Sites must be an array')
    .custom(validateCourseSites),
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
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search query cannot exceed 100 characters'),
  query('category').optional()
    .isIn(COURSE_CATEGORIES).withMessage(`Category must be one of: ${COURSE_CATEGORIES.join(', ')}`),
  query('subcategory').optional()
    .isIn(courseSubcategories).withMessage('Subcategory is not recognized'),
  query().custom((values) => {
    if (!values.category || !values.subcategory) return true;
    return validateTaxonomyPair(values.category, values.subcategory);
  }),
  query('level').optional()
    .isIn(COURSE_LEVELS).withMessage(`Level must be one of: ${COURSE_LEVELS.join(', ')}`),
];

module.exports = { create, update, courseIdParam, listQuery };
