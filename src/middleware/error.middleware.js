const mongoose = require('mongoose');
const env = require('../config/env');

const errorMiddleware = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message   || 'Something went wrong. Please try again later.';
  let errors     = err.errors    || [];

  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
    errors = [{ field, message }];
  }

  if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for field: ${err.path}`;
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Session expired. Please log in again.';
  }

  const isProduction = env.nodeEnv === 'production';
  const isUnexpected = !err.isOperational;

  if (isProduction && isUnexpected) {
    statusCode = 500;
    message = 'Something went wrong. Please try again later.';
    errors = [];
  }

  if (isUnexpected) console.error('[Unhandled Error]', err);

  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors.length > 0 && { errors }),
    ...(env.nodeEnv === 'development' && isUnexpected && { stack: err.stack }),
  });
};

module.exports = { errorMiddleware };
