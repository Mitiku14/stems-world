const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * validate
 * --------
 * Reads the results of express-validator chains that ran before this middleware.
 * If there are errors, throws a 422 with structured field-level error details.
 * If clean, calls next() to proceed to the controller.
 *
 * Usage in routes:
 *   router.post('/register', authValidator.register, validate, authController.register);
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Map to a clean { field, message } shape
    const formatted = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));

    return next(new ApiError(422, 'Validation failed', formatted));
  }

  next();
};

module.exports = { validate };
