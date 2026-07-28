const ApiError = require('../utils/ApiError');

/**
 * requireRole(...roles)
 * ---------------------
 * Authorization middleware — must always be used AFTER verifyToken.
 * Accepts one or more allowed roles.
 *
 * Usage:
 *   router.get('/admin/dashboard', verifyToken, requireRole('admin'), handler);
 *   router.post('/enroll', verifyToken, requireRole('student'), handler);
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated.'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action.'));
    }

    next();
  };
};

module.exports = { requireRole };
