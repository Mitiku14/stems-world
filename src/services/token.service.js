const crypto = require('crypto');
const mongoose = require('mongoose');
const Token  = require('../models/Token');
const User = require('../models/User');
const env = require('../config/env');
const { E164_PHONE_REGEX } = require('../utils/normalizePhone');
const { TOKEN_TYPES, TOKEN_EXPIRY, PHONE_OTP } = require('../constants');

const EXPIRY_MAP = {
  emailVerification: TOKEN_EXPIRY.EMAIL_VERIFICATION,
  phoneVerification: TOKEN_EXPIRY.PHONE_VERIFICATION,
  passwordReset:     TOKEN_EXPIRY.PASSWORD_RESET,
};

const hashToken = (rawToken) =>
  crypto.createHash('sha256').update(rawToken).digest('hex');

const isPhoneOtpConfigured = () => (
  typeof env.otp.secret === 'string' && env.otp.secret.length >= 32
);

const getOtpSecret = () => {
  if (!isPhoneOtpConfigured()) {
    throw new Error('OTP_SECRET must contain at least 32 characters before phone verification can be used');
  }
  return env.otp.secret;
};

const generatePhoneOtp = (randomInt = crypto.randomInt) => (
  String(randomInt(0, 10 ** PHONE_OTP.DIGITS)).padStart(PHONE_OTP.DIGITS, '0')
);

const phoneOtpPayload = (userId, targetPhone, code) => (
  [TOKEN_TYPES.PHONE_VERIFICATION, String(userId), targetPhone, code].join('\0')
);

const hashPhoneOtp = ({ userId, targetPhone, code }, secret = getOtpSecret()) => (
  crypto
    .createHmac('sha256', secret)
    .update(phoneOtpPayload(userId, targetPhone, code))
    .digest('hex')
);

const phoneOtpMatches = ({ userId, targetPhone, code, digest }) => {
  const candidate = Buffer.from(hashPhoneOtp({ userId, targetPhone, code }), 'hex');
  const stored = Buffer.from(String(digest || ''), 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
};

const createToken = async (userId, type) => {
  if (!Object.prototype.hasOwnProperty.call(EXPIRY_MAP, type)) {
    throw new Error(`Unsupported token type: ${type}`);
  }
  const expiry = EXPIRY_MAP[type];

  await Token.deleteMany({ userId, type });

  const rawToken    = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);

  await Token.create({
    userId,
    token: hashedToken,
    type,
    expiresAt: new Date(Date.now() + expiry),
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

const assertCanonicalTargetPhone = (targetPhone) => {
  if (typeof targetPhone !== 'string' || !E164_PHONE_REGEX.test(targetPhone)) {
    throw new TypeError('Phone verification requires a canonical E.164 target phone');
  }
};

const createPhoneVerificationOtp = async (userId, targetPhone) => {
  assertCanonicalTargetPhone(targetPhone);
  getOtpSecret();

  const runOperation = async (session) => {
    const now = new Date();
    const existing = await Token.findOne(
      { userId, type: TOKEN_TYPES.PHONE_VERIFICATION },
      null,
      session ? { session } : {}
    );

    const existingCreatedAt = existing?.createdAt && new Date(existing.createdAt);
    const isActive = existing?.expiresAt && new Date(existing.expiresAt) > now;
    const isCoolingDown = existingCreatedAt
      && now.getTime() - existingCreatedAt.getTime() < PHONE_OTP.RESEND_COOLDOWN_MS;

    if (existing?.targetPhone === targetPhone && isActive && isCoolingDown) {
      return { status: 'cooldown' };
    }

    const code = generatePhoneOtp();
    const digest = hashPhoneOtp({ userId, targetPhone, code });
    await Token.deleteMany({ userId, type: TOKEN_TYPES.PHONE_VERIFICATION }, session ? { session } : {});
    const [tokenDoc] = await Token.create([{
      userId,
      token: digest,
      type: TOKEN_TYPES.PHONE_VERIFICATION,
      targetPhone,
      attempts: 0,
      expiresAt: new Date(now.getTime() + TOKEN_EXPIRY.PHONE_VERIFICATION),
    }], session ? { session } : {});

    return {
      status: 'created',
      code,
      cleanupKey: { tokenId: tokenDoc._id, digest },
    };
  };

  if (mongoose.connection.readyState !== 1) {
    return await runOperation(null);
  }

  try {
    return await mongoose.connection.transaction(runOperation);
  } catch (error) {
    if (error.message && (
      error.message.includes('Transaction numbers are only allowed') ||
      error.message.includes('buffering timed out') ||
      error.name === 'MongooseError'
    )) {
      return await runOperation(null);
    }
    throw error;
  }
};

const discardPhoneVerificationOtp = ({ tokenId, digest }) => Token.deleteOne({
  _id: tokenId,
  token: digest,
  type: TOKEN_TYPES.PHONE_VERIFICATION,
});

const deletePhoneVerificationTokens = (userId, options = {}) => Token.deleteMany(
  { userId, type: TOKEN_TYPES.PHONE_VERIFICATION },
  options
);

const activeAttemptsFilter = {
  $or: [
    { attempts: { $lt: PHONE_OTP.MAX_ATTEMPTS } },
    { attempts: { $exists: false } },
  ],
};

const verificationStateChanged = () => {
  const error = new Error('Phone verification state changed');
  error.code = 'PHONE_VERIFICATION_STATE_CHANGED';
  return error;
};

const verifyPhoneVerificationOtp = async ({ userId, targetPhone, code }) => {
  assertCanonicalTargetPhone(targetPhone);
  if (!/^\d{6}$/.test(code)) return { status: 'invalid' };
  getOtpSecret();

  const runVerify = async (session) => {
    const now = new Date();
    const tokenDoc = await Token.findOne({
      userId,
      type: TOKEN_TYPES.PHONE_VERIFICATION,
      targetPhone,
      expiresAt: { $gt: now },
      ...activeAttemptsFilter,
    }, null, session ? { session } : {});

    if (!tokenDoc) return { status: 'invalid' };

    const matches = phoneOtpMatches({
      userId,
      targetPhone,
      code,
      digest: tokenDoc.token,
    });

    if (!matches) {
      const updated = await Token.findOneAndUpdate({
        _id: tokenDoc._id,
        userId,
        type: TOKEN_TYPES.PHONE_VERIFICATION,
        targetPhone,
        expiresAt: { $gt: now },
        ...activeAttemptsFilter,
      }, {
        $inc: { attempts: 1 },
      }, {
        new: true,
        ...(session ? { session } : {}),
      });

      if (updated?.attempts >= PHONE_OTP.MAX_ATTEMPTS) {
        await Token.deleteOne({
          _id: updated._id,
          attempts: { $gte: PHONE_OTP.MAX_ATTEMPTS },
        }, session ? { session } : {});
      }
      return { status: 'invalid' };
    }

    const consumed = await Token.findOneAndDelete({
      _id: tokenDoc._id,
      userId,
      type: TOKEN_TYPES.PHONE_VERIFICATION,
      targetPhone,
      expiresAt: { $gt: now },
      ...activeAttemptsFilter,
    }, session ? { session } : {});
    if (!consumed) return { status: 'invalid' };

    const user = await User.findOneAndUpdate({
      _id: userId,
      phone: targetPhone,
      isPhoneVerified: { $ne: true },
    }, {
      $set: { isPhoneVerified: true },
    }, {
      new: true,
      runValidators: true,
      ...(session ? { session } : {}),
    });

    if (!user) throw verificationStateChanged();
    return { status: 'verified', user };
  };

  if (mongoose.connection.readyState !== 1) {
    return await runVerify(null);
  }

  try {
    return await mongoose.connection.transaction(runVerify);
  } catch (error) {
    if (error.code === 'PHONE_VERIFICATION_STATE_CHANGED') return { status: 'invalid' };
    if (error.message && (
      error.message.includes('Transaction numbers are only allowed') ||
      error.message.includes('buffering timed out') ||
      error.name === 'MongooseError'
    )) {
      return await runVerify(null);
    }
    throw error;
  }
};

module.exports = {
  createToken,
  findToken,
  deleteToken,
  hashToken,
  isPhoneOtpConfigured,
  generatePhoneOtp,
  hashPhoneOtp,
  phoneOtpMatches,
  createPhoneVerificationOtp,
  verifyPhoneVerificationOtp,
  discardPhoneVerificationOtp,
  deletePhoneVerificationTokens,
};
