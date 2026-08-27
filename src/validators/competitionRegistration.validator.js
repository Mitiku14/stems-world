const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { ENROLLMENT_STATUS, COMPETITION_PROGRESSION_STATUSES } = require('../constants');

const validStatuses = Object.values(ENROLLMENT_STATUS);

const submitRegistrationRules = [
  param('id').custom((v) => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid competition ID'),
  
  body('fullName')
    .trim().notEmpty().withMessage('Full name is required')
    .isLength({ max: 100 }).withMessage('Full name cannot exceed 100 characters'),
    
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('phone').optional({ nullable: true }).trim().isLength({ max: 20 }),
  body('academicFile')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Academic file must be a valid HTTP/HTTPS URL'),
  body('grade').optional({ nullable: true }).trim().isLength({ max: 50 }),
  body('school').optional({ nullable: true }).trim().isLength({ max: 150 }),
  
  body('skills').optional().isArray().withMessage('Skills must be an array'),
  body('skills.*').isString().trim().notEmpty(),

  body('motivation').optional({ nullable: true }).trim().isLength({ max: 2000 }),
  body('teamName').optional({ nullable: true }).trim().isLength({ max: 100 }),
  
  body('teamMembers').optional().isArray().withMessage('Team members must be an array'),
  body('teamMembers.*').isString().trim().notEmpty(),
];

const registrationIdParam = [
  param('id').custom((v) => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid registration ID'),
];

const rejectRegistrationRules = [
  ...registrationIdParam,
  body('rejectionReason')
    .trim().notEmpty().withMessage('Rejection reason is required when rejecting a registration.')
    .isLength({ max: 500 }).withMessage('Rejection reason cannot exceed 500 characters'),
];

const roundActionRules = [
  ...registrationIdParam,
  body('roundId')
    .notEmpty().withMessage('roundId is required.')
    .custom((v) => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid roundId'),
];

const adminListQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(validStatuses),
  query('progressionStatus').optional().isIn(COMPETITION_PROGRESSION_STATUSES),
  query('competitionId').optional().custom((v) => mongoose.Types.ObjectId.isValid(v)),
  query('search').optional().isString().trim().isLength({ max: 100 }),
];

module.exports = {
  submitRegistrationRules,
  registrationIdParam,
  rejectRegistrationRules,
  roundActionRules,
  adminListQuery,
};
