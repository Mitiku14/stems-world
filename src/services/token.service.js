const crypto = require('crypto');
const Token  = require('../models/Token');
const { TOKEN_EXPIRY } = require('../constants');

const EXPIRY_MAP = {
  emailVerification: TOKEN_EXPIRY.EMAIL_VERIFICATION,
  passwordReset:     TOKEN_EXPIRY.PASSWORD_RESET,
};

const hashToken = (rawToken) =>
  crypto.createHash('sha256').update(rawToken).digest('hex');

const createToken = async (userId, type) => {
  await Token.deleteMany({ userId, type });

  const rawToken    = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);

  await Token.create({
    userId,
    token: hashedToken,
    type,
    expiresAt: new Date(Date.now() + EXPIRY_MAP[type]),
  });

  return rawToken;
};

const findToken = async (rawToken, type) => {
  const tokenDoc = await Token.findOne({ token: hashToken(rawToken), type });
  if (!tokenDoc) return null;

  if (tokenDoc.expiresAt < new Date()) {
    await tokenDoc.deleteOne();
    return null;
  }

  return tokenDoc;
};

const deleteToken = (tokenDoc) => tokenDoc.deleteOne();

module.exports = { createToken, findToken, deleteToken, hashToken };
