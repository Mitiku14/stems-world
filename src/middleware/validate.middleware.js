const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const validate = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map(({ path, msg }) => ({ field: path, message: msg }));
    return next(new ApiError(422, 'Validation failed', formatted));
  }
  next();
};

module.exports = { validate };
