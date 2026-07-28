const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

/**
 * Global error handler — must be the LAST app.use() in server.js.
 *
 * Handles:
 *  - ApiError (our own operational errors)
 *  - Mongoose ValidationError
 *  - Mongoose duplicate key error (code 11000)
 *  - JWT errors (caught in auth middleware, but as a safety net here)
 *  - Unexpected errors (bugs) — hides details in production
 */
const errorMiddleware = (err, req, res, next) => {
  // Default to 500
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong. Please try again later.';
  let errors = err.errors || [];

  // ── Mongoose validation error ──────────────────────────────────────────────
  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // ── MongoDB duplicate key error ────────────────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
    errors = [{ field, message }];
  }

  // ── Mongoose bad ObjectId ──────────────────────────────────────────────────
  if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for field: ${err.path}`;
  }

  // ── JWT errors (safety net — normally caught in auth middleware) ───────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Session expired. Please log in again.';
  }

  // ── In production, hide unexpected error details ───────────────────────────
  const isProduction = env.nodeEnv === 'production';
  const isUnexpected = !err.isOperational;

  if (isProduction && isUnexpected) {
    statusCode = 500;
    message = 'Something went wrong. Please try again later.';
    errors = [];
  }

  // Log unexpected errors — in production you'd pipe this to a logger like Winston
  if (isUnexpected) {
    console.error('[Unhandled Error]', err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors.length > 0 && { errors }),
    // Only include stack trace in development for debugging
    ...(env.nodeEnv === 'development' && isUnexpected && { stack: err.stack }),
  });
};

module.exports = { errorMiddleware };
