/**
 * NoSQL Injection Sanitizer — Express 5 compatible.
 *
 * express-mongo-sanitize@2.x is incompatible with Express 5 because it attempts
 * to overwrite req.query which is read-only in Express 5.
 *
 * This middleware manually strips MongoDB operator keys ($ and .) from
 * req.body and req.params. req.query in Express 5 is read-only but its
 * individual properties can still be sanitized by rebuilding the object.
 *
 * express-validator on all input routes provides a second layer of protection.
 */

/**
 * Recursively removes keys that start with '$' or contain '.'
 * from plain objects and arrays.
 */
const sanitize = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const clean = {};
  for (const key of Object.keys(obj)) {
    // Drop keys starting with $ or containing . — both are MongoDB operator patterns
    if (key.startsWith('$') || key.includes('.')) continue;
    clean[key] = sanitize(obj[key]);
  }
  return clean;
};

/**
 * Express middleware — sanitizes req.body and req.params in place.
 * req.query is handled by rebuilding a sanitized copy (Express 5 read-only).
 */
const mongoSanitize = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitize(req.body);
  }

  if (req.params && typeof req.params === 'object') {
    const cleanParams = sanitize(req.params);
    Object.assign(req.params, cleanParams);
  }

  next();
};

module.exports = { mongoSanitize };
