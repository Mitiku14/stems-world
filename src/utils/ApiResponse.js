/**
 * Standard API response helper.
 * Ensures every response has the same shape across the entire API.
 *
 * Usage:
 *   res.status(200).json(new ApiResponse(200, 'Success', data));
 *   res.status(201).json(new ApiResponse(201, 'Created'));
 */
class ApiResponse {
  constructor(statusCode, message, data = null) {
    this.success = statusCode < 400;
    this.message = message;
    if (data !== null) {
      this.data = data;
    }
  }
}

module.exports = ApiResponse;
