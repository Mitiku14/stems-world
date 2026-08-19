const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { COMPETITION_TYPES, COMPETITION_SCOPES, COMPETITION_STATUSES } = require('../constants');

const createCompetitionRules = [
  body('title').trim().notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('description').optional().trim()
    .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
  body('imageUrl').optional({ checkFalsy: true }).trim().isURL().withMessage('Must be a valid URL'),
  body('type').isIn(COMPETITION_TYPES).withMessage(`Type must be one of: ${COMPETITION_TYPES.join(', ')}`),
  body('scope').isIn(COMPETITION_SCOPES).withMessage(`Scope must be one of: ${COMPETITION_SCOPES.join(', ')}`),
  body('registrationOpenDate').optional({ nullable: true }).isISO8601().withMessage('Must be a valid date'),
  body('registrationCloseDate').optional({ nullable: true }).isISO8601().withMessage('Must be a valid date'),
  body('eventStartDate').optional({ nullable: true }).isISO8601().withMessage('Must be a valid date'),
  body('eventEndDate').optional({ nullable: true }).isISO8601().withMessage('Must be a valid date'),
  body('location').optional({ nullable: true }).trim(),
  body('eligibility').optional({ nullable: true }).trim(),
  body('requirements').optional().isArray().withMessage('Requirements must be an array'),
  body('requirements.*').isString().trim().notEmpty(),
  body('maxParticipants').optional({ nullable: true }).isInt({ min: 1 }),
  body('organizer').optional({ nullable: true }).trim(),
  body('contactEmail').optional({ nullable: true }).trim().isEmail(),
  body('status').optional().isIn(COMPETITION_STATUSES),
];

const updateCompetitionRules = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty')
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('description').optional().trim()
    .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
  body('imageUrl').optional({ checkFalsy: true }).trim().isURL().withMessage('Must be a valid URL'),
  body('type').optional().isIn(COMPETITION_TYPES),
  body('scope').optional().isIn(COMPETITION_SCOPES),
  body('registrationOpenDate').optional({ nullable: true }).isISO8601(),
  body('registrationCloseDate').optional({ nullable: true }).isISO8601(),
  body('eventStartDate').optional({ nullable: true }).isISO8601(),
  body('eventEndDate').optional({ nullable: true }).isISO8601(),
  body('location').optional({ nullable: true }).trim(),
  body('eligibility').optional({ nullable: true }).trim(),
  body('requirements').optional().isArray(),
  body('requirements.*').isString().trim().notEmpty(),
  body('maxParticipants').optional({ nullable: true }).isInt({ min: 1 }),
  body('organizer').optional({ nullable: true }).trim(),
  body('contactEmail').optional({ nullable: true }).trim().isEmail(),
  body('status').optional().isIn(COMPETITION_STATUSES),
  body('isActive').optional().isBoolean(),
];

const competitionIdParam = [
  param('id').custom((v) => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid competition ID'),
];

module.exports = { createCompetitionRules, updateCompetitionRules, competitionIdParam };
