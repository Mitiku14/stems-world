const crypto = require('crypto');
const Token = require('../models/Token');
const { TOKEN_EXPIRY } = require('../constants');

/**
 * Hashes a raw token string using SHA-256.
 * We store the hash in the DB — the raw token only ever lives in the email link.
 */
const hashToken = (rawToken) => {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

/**
 * Generates a cryptographically random token, stores its hash in the DB,
 * and returns the raw token to be sent in the email link.
 *
 * @param {string} userId - The user's MongoDB ObjectId
 * @param {string} type   - TOKEN_TYPES.EMAIL_VERIFICATION | TOKEN_TYPES.PASSWORD_RESET
 * @returns {string}      - The raw (unhashed) token to embed in the email URL
 */
const createToken = async (userId, type) => {
  // Delete any existing token of this type for this user before creating a new one
  await Token.deleteMany({ userId, type });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);

  // Map camelCase type values to their expiry durations
  const expiryMap = {
    emailVerification: TOKEN_EXPIRY.EMAIL_VERIFICATION,
    passwordReset: TOKEN_EXPIRY.PASSWORD_RESET,
  };

  await Token.create({
    userId,
    token: hashedToken,
    type,
    expiresAt: new Date(Date.now() + expiryMap[type]),
  });

  return rawToken;
};

/**
 * Finds and validates a token.
 * Returns the Token document if valid, or null if not found / expired.
 *
 * @param {string} rawToken - The raw token from the email URL
 * @param {string} type     - Expected token type
 * @returns {object|null}   - Token document or null
 */
const findToken = async (rawToken, type) => {
  const hashedToken = hashToken(rawToken);

  const tokenDoc = await Token.findOne({ token: hashedToken, type });

  if (!tokenDoc) return null;

  // Check expiry manually (belt-and-suspenders alongside the TTL index)
  if (tokenDoc.expiresAt < new Date()) {
    await tokenDoc.deleteOne();
    return null;
  }

  return tokenDoc;
};

/**
 * Deletes a token document after it has been consumed (single-use enforcement).
 */
const deleteToken = async (tokenDoc) => {
  await tokenDoc.deleteOne();
};

module.exports = {
  createToken,
  findToken,
  deleteToken,
  hashToken,
};
