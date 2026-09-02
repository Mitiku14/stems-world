const { body, param } = require('express-validator');
const mongoose = require('mongoose');
const { normalizeNameComponent } = require('../utils/studentProfile');

const requiredName = (field, label) => body(field)
  .exists({ checkNull: true }).withMessage(`${label} is required`).bail()
  .isString().withMessage(`${label} must be text`).bail()
  .customSanitizer(normalizeNameComponent)
  .notEmpty().withMessage(`${label} is required`);

const optionalName = (field, label) => body(field)
  .optional()
  .isString().withMessage(`${label} must be text`).bail()
  .customSanitizer(normalizeNameComponent)
  .notEmpty().withMessage(`${label} cannot be empty`);

const optionalText = (field, label) => body(field)
  .optional({ nullable: true })
  .isString().withMessage(`${label} must be text`).bail()
  .trim();

const rejectControlledField = (field) => body(field)
  .not().exists()
  .withMessage(`${field} is server-controlled and cannot be supplied`);

const create = [
  requiredName('givenName', 'Given name'),
  requiredName('fatherName', 'Father name'),
  requiredName('grandfatherName', 'Grandfather name'),
  optionalText('grade', 'Grade'),
  optionalText('school', 'School'),
  rejectControlledField('parentUser'),
  rejectControlledField('slot'),
  rejectControlledField('_id'),
  rejectControlledField('isActive'),
];

const update = [
  optionalName('givenName', 'Given name'),
  optionalName('fatherName', 'Father name'),
  optionalName('grandfatherName', 'Grandfather name'),
  optionalText('grade', 'Grade'),
  optionalText('school', 'School'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean').toBoolean(),
  rejectControlledField('parentUser'),
  rejectControlledField('slot'),
  rejectControlledField('_id'),
];

const studentProfileIdParam = [
  param('id')
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage('Invalid student profile ID'),
];

module.exports = { create, update, studentProfileIdParam };
