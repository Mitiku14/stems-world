class ApiResponse {
  constructor(statusCode, message, data = null) {
    this.success = statusCode < 400;
    this.message = message;
    if (data !== null) this.data = data;
  }
}

module.exports = ApiResponse;
