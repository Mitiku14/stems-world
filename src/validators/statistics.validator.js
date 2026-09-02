const { body } = require('express-validator');

const STATISTIC_FIELDS = Object.freeze([
  'registeredStudents',
  'totalCoursesGiven',
  'annualLearningCapacity',
  'competitionParticipants',
]);

const TOP_LEVEL_FIELDS = new Set([...STATISTIC_FIELDS, 'showPlus']);
const SHOW_PLUS_FIELDS = new Set(STATISTIC_FIELDS);

const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const patchStatistics = [
  body().custom((value) => {
    if (!isObject(value)) throw new Error('Request body must be a JSON object');

    const fields = Object.keys(value);
    if (fields.length === 0) throw new Error('At least one statistics field is required');

    const unknownFields = fields.filter((field) => !TOP_LEVEL_FIELDS.has(field));
    if (unknownFields.length > 0) {
      throw new Error(`Unknown statistics field(s): ${unknownFields.join(', ')}`);
    }

    for (const field of STATISTIC_FIELDS) {
      if (!hasOwn(value, field)) continue;
      if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
        throw new Error(`${field} must be a non-negative safe integer`);
      }
    }

    if (hasOwn(value, 'showPlus')) {
      if (!isObject(value.showPlus)) throw new Error('showPlus must be a JSON object');

      const showPlusFields = Object.keys(value.showPlus);
      if (showPlusFields.length === 0) {
        throw new Error('showPlus must contain at least one recognized field');
      }

      const unknownShowPlusFields = showPlusFields.filter((field) => !SHOW_PLUS_FIELDS.has(field));
      if (unknownShowPlusFields.length > 0) {
        throw new Error(`Unknown showPlus field(s): ${unknownShowPlusFields.join(', ')}`);
      }

      for (const field of showPlusFields) {
        if (typeof value.showPlus[field] !== 'boolean') {
          throw new Error(`showPlus.${field} must be a boolean`);
        }
      }
    }

    return true;
  }),
];

module.exports = { patchStatistics, STATISTIC_FIELDS };
