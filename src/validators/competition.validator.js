const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const {
  COMPETITION_CATEGORIES,
  COMPETITION_TYPES,
  COMPETITION_SCOPES,
  COMPETITION_STATUSES,
} = require('../constants');
const Competition = require('../models/Competition');

const competitionRoundsRule = () =>
  body('rounds')
    .optional()
    .isArray()
    .withMessage('Rounds must be an array')
    .bail()
    .custom((rounds) => {
      if (rounds.length > 20) {
        throw new Error('Competition cannot have more than 20 rounds');
      }

      const suppliedIds = [];
      const names = [];
      const orders = [];

      rounds.forEach((round, index) => {
        if (!round || typeof round !== 'object' || Array.isArray(round)) {
          throw new Error(`Round ${index + 1} must be an object`);
        }

        if (round._id !== undefined && round._id !== null && round._id !== '') {
          if (!mongoose.Types.ObjectId.isValid(round._id)) {
            throw new Error(`Round ${index + 1} has an invalid _id`);
          }
          suppliedIds.push(String(round._id).toLowerCase());
        }

        if (typeof round.name !== 'string' || !round.name.trim()) {
          throw new Error(`Round ${index + 1} name is required`);
        }
        if (round.name.trim().length > 100) {
          throw new Error(`Round ${index + 1} name cannot exceed 100 characters`);
        }
        names.push(round.name.trim().toLowerCase());

        const order = Number(round.order);
        if (!Number.isInteger(order) || order < 1) {
          throw new Error(`Round ${index + 1} order must be an integer of at least 1`);
        }
        orders.push(order);
      });

      if (new Set(suppliedIds).size !== suppliedIds.length) {
        throw new Error('Round IDs must be unique within a competition');
      }
      if (new Set(names).size !== names.length) {
        throw new Error('Round names must be unique within a competition');
      }

      const sortedOrders = [...orders].sort((a, b) => a - b);
      if (!sortedOrders.every((order, index) => order === index + 1)) {
        throw new Error('Round orders must be unique contiguous integers starting at 1 (1, 2, 3... N)');
      }

      return true;
    });

const validateDateOrder = (isUpdate = false) =>
  body().custom(async (_value, { req }) => {
    let dates = req.body;
    if (isUpdate && mongoose.Types.ObjectId.isValid(req.params.id)) {
      const existing = await Competition.findById(req.params.id)
        .select('registrationOpenDate registrationCloseDate eventStartDate eventEndDate')
        .lean();
      if (existing) dates = { ...existing, ...req.body };
    }

    const registrationOpen = dates.registrationOpenDate ? new Date(dates.registrationOpenDate) : null;
    const registrationClose = dates.registrationCloseDate ? new Date(dates.registrationCloseDate) : null;
    const eventStart = dates.eventStartDate ? new Date(dates.eventStartDate) : null;
    const eventEnd = dates.eventEndDate ? new Date(dates.eventEndDate) : null;

    if (registrationOpen && registrationClose && registrationOpen >= registrationClose) {
      throw new Error('registrationOpenDate must be earlier than registrationCloseDate');
    }
    if (eventStart && eventEnd && eventStart > eventEnd) {
      throw new Error('eventStartDate cannot be later than eventEndDate');
    }
    if (registrationClose && eventStart && registrationClose > eventStart) {
      throw new Error('registrationCloseDate cannot be later than eventStartDate');
    }
    return true;
  });

const createCompetitionRules = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters'),
  body('imageUrl').optional({ checkFalsy: true }).trim().isURL().withMessage('Must be a valid URL'),
  body('category')
    .isIn(COMPETITION_CATEGORIES)
    .withMessage(`Category must be one of: ${COMPETITION_CATEGORIES.join(', ')}`),
  body('type')
    .isIn(COMPETITION_TYPES)
    .withMessage(`Type must be one of: ${COMPETITION_TYPES.join(', ')}`),
  body('scope')
    .isIn(COMPETITION_SCOPES)
    .withMessage(`Scope must be one of: ${COMPETITION_SCOPES.join(', ')}`),
  body('registrationOpenDate')
    .exists().withMessage('registrationOpenDate is required').bail()
    .notEmpty().withMessage('registrationOpenDate is required').bail()
    .isISO8601().withMessage('Must be a valid date'),
  body('registrationCloseDate')
    .exists().withMessage('registrationCloseDate is required').bail()
    .notEmpty().withMessage('registrationCloseDate is required').bail()
    .isISO8601().withMessage('Must be a valid date'),
  body('eventStartDate').optional({ nullable: true }).isISO8601().withMessage('Must be a valid date'),
  body('eventEndDate').optional({ nullable: true }).isISO8601().withMessage('Must be a valid date'),
  body('location').optional({ nullable: true }).trim(),
  body('requirements').optional().isArray().withMessage('Requirements must be an array'),
  body('requirements.*').isString().trim().notEmpty(),
  competitionRoundsRule(),
  body('maxRegistrations').optional({ nullable: true }).isInt({ min: 1 }),
  body('maxParticipants').optional({ nullable: true }).isInt({ min: 1 }),
  body('organizer').optional({ nullable: true }).trim(),
  body('contactEmail').optional({ nullable: true }).trim().isEmail(),
  body('status').optional().isIn(COMPETITION_STATUSES),
  validateDateOrder(),
];

const updateCompetitionRules = [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty')
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters'),
  body('imageUrl').optional({ checkFalsy: true }).trim().isURL().withMessage('Must be a valid URL'),
  body('category').optional().isIn(COMPETITION_CATEGORIES),
  body('type').optional().isIn(COMPETITION_TYPES),
  body('scope').optional().isIn(COMPETITION_SCOPES),
  body('registrationOpenDate').optional({ nullable: true }).isISO8601(),
  body('registrationCloseDate').optional({ nullable: true }).isISO8601(),
  body('eventStartDate').optional({ nullable: true }).isISO8601(),
  body('eventEndDate').optional({ nullable: true }).isISO8601(),
  body('location').optional({ nullable: true }).trim(),
  body('requirements').optional().isArray(),
  body('requirements.*').isString().trim().notEmpty(),
  competitionRoundsRule(),
  body('maxRegistrations').optional({ nullable: true }).isInt({ min: 1 }),
  body('maxParticipants').optional({ nullable: true }).isInt({ min: 1 }),
  body('organizer').optional({ nullable: true }).trim(),
  body('contactEmail').optional({ nullable: true }).trim().isEmail(),
  body('status').optional().isIn(COMPETITION_STATUSES),
  body('isActive').optional().isBoolean(),
  body('createdBy').not().exists().withMessage('createdBy cannot be changed'),
  validateDateOrder(true),
];

const competitionIdParam = [
  param('id').custom((v) => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid competition ID'),
];

const listQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category')
    .optional()
    .isIn(COMPETITION_CATEGORIES)
    .withMessage(`Category must be one of: ${COMPETITION_CATEGORIES.join(', ')}`),
  query('type')
    .optional()
    .isIn(COMPETITION_TYPES)
    .withMessage(`Type must be one of: ${COMPETITION_TYPES.join(', ')}`),
  query('scope')
    .optional()
    .isIn(COMPETITION_SCOPES)
    .withMessage(`Scope must be one of: ${COMPETITION_SCOPES.join(', ')}`),
];

module.exports = { createCompetitionRules, updateCompetitionRules, competitionIdParam, listQuery };
