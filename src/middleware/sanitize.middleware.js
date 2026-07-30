// express-mongo-sanitize@2.x is incompatible with Express 5 (req.query is read-only).
// This replacement strips MongoDB operator keys ($, .) from req.body and req.params.

const sanitize = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  return Object.keys(obj).reduce((clean, key) => {
    if (!key.startsWith('$') && !key.includes('.')) {
      clean[key] = sanitize(obj[key]);
    }
    return clean;
  }, {});
};

const mongoSanitize = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitize(req.body);
  }
  if (req.params && typeof req.params === 'object') {
    Object.assign(req.params, sanitize(req.params));
  }
  next();
};

module.exports = { mongoSanitize };
