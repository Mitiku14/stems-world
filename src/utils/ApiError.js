/**
 * Custom API error class.
 * Throw this anywhere in the app — the global error middleware catches it.
 *
 * Usage:
 *   throw new ApiError(404, 'Course not found');
 *   throw new ApiError(422, 'Validation failed', [{ field: 'email', message: '...' }]);
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;   // field-level validation errors array (optional)
    this.isOperational = true; // marks this as a known, handled error
  }
}

module.exports = ApiError;
