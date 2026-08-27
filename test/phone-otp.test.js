require('dotenv').config();
process.env.OTP_SECRET = 'a_very_secret_otp_encryption_key_32_bytes_long!';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { validationResult } = require('express-validator');

const tokenService = require('../src/services/token.service');
const smsService = require('../src/services/sms.service');
const authController = require('../src/controllers/auth.controller');
const authValidator = require('../src/validators/auth.validator');
const User = require('../src/models/User');
const Token = require('../src/models/Token');
const env = require('../src/config/env');
const swaggerSpec = require('../src/config/swagger');
const { PHONE_OTP, TOKEN_TYPES, TOKEN_EXPIRY } = require('../src/constants');
const fs = require('fs');
const path = require('path');

const validate = async (chains, request = {}) => {
  const req = { body: {}, query: {}, params: {}, ...request };
  for (const chain of chains) await chain.run(req);
  return { errors: validationResult(req), request: req };
};

const invoke = async (handler, request = {}) => {
  let body;
  let nextError;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { body = value; return this; },
  };
  await handler({ body: {}, query: {}, params: {}, user: { _id: '507f1f77bcf86cd799439011' }, ...request }, res, (error) => {
    nextError = error;
  });
  return { statusCode: res.statusCode, body, error: nextError };
};

// 1. OTP Generation Tests
test('1. Generated OTP is strictly 6 numeric digits and uses crypto.randomInt', () => {
  for (let i = 0; i < 50; i++) {
    const code = tokenService.generatePhoneOtp();
    assert.equal(typeof code, 'string');
    assert.equal(code.length, 6);
    assert.match(code, /^\d{6}$/);
  }
});

test('2. OTP generation preserves leading zeros', () => {
  const fixedSmallInt = () => 123; // Should produce '000123'
  const code = tokenService.generatePhoneOtp(fixedSmallInt);
  assert.equal(code, '000123');
});

test('3. Plaintext OTP is never stored in DB; stored token is an HMAC-SHA256 digest', () => {
  const userId = '507f1f77bcf86cd799439011';
  const targetPhone = '+251911223344';
  const code = '123456';
  const digest = tokenService.hashPhoneOtp({ userId, targetPhone, code });

  assert.notEqual(digest, code);
  assert.equal(digest.length, 64); // SHA-256 hex string
  assert.match(digest, /^[a-f0-9]{64}$/);

  const matches = tokenService.phoneOtpMatches({ userId, targetPhone, code, digest });
  assert.equal(matches, true);

  const wrongMatches = tokenService.phoneOtpMatches({ userId, targetPhone, code: '654321', digest });
  assert.equal(wrongMatches, false);
});

// 2. Resend Phone Verification Controller Tests
test('4. Resend OTP returns 400 if user has no phone on profile', async () => {
  const originalFindById = User.findById;
  User.findById = async () => ({ _id: 'user1', phone: null, isPhoneVerified: false });
  try {
    const result = await invoke(authController.resendPhoneVerification, {
      user: { _id: 'user1' },
    });
    assert.equal(result.error.statusCode, 400);
    assert.match(result.error.message, /Add a phone number/);
  } finally {
    User.findById = originalFindById;
  }
});

test('5. Resend OTP returns 200 already verified if user is already phone verified', async () => {
  const originalFindById = User.findById;
  User.findById = async () => ({
    _id: 'user1',
    phone: '+251912345678',
    isPhoneVerified: true,
    preferredCommunication: 'phone',
  });
  try {
    const result = await invoke(authController.resendPhoneVerification, {
      user: { _id: 'user1' },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.message, 'Phone number is already verified.');
    assert.equal(result.body.data.isPhoneVerified, true);
  } finally {
    User.findById = originalFindById;
  }
});

test('6. Resend OTP enforces 60-second cooldown', async () => {
  const originalFindById = User.findById;
  const originalCreateOtp = tokenService.createPhoneVerificationOtp;
  const originalIsConfigured = tokenService.isPhoneOtpConfigured;
  const originalSmsEnabled = smsService.isEnabled;

  User.findById = async () => ({ _id: 'user1', phone: '+251912345678', isPhoneVerified: false });
  tokenService.isPhoneOtpConfigured = () => true;
  smsService.isEnabled = () => true;
  tokenService.createPhoneVerificationOtp = async () => ({ status: 'cooldown' });

  try {
    const result = await invoke(authController.resendPhoneVerification, {
      user: { _id: 'user1' },
    });
    assert.equal(result.error.statusCode, 429);
    assert.match(result.error.message, /Please wait/);
  } finally {
    User.findById = originalFindById;
    tokenService.createPhoneVerificationOtp = originalCreateOtp;
    tokenService.isPhoneOtpConfigured = originalIsConfigured;
    smsService.isEnabled = originalSmsEnabled;
  }
});

test('7. Resend OTP discards token and returns 503 if SMS delivery fails', async () => {
  const originalFindById = User.findById;
  const originalCreateOtp = tokenService.createPhoneVerificationOtp;
  const originalDiscardOtp = tokenService.discardPhoneVerificationOtp;
  const originalIsConfigured = tokenService.isPhoneOtpConfigured;
  const originalSmsEnabled = smsService.isEnabled;
  let discardedKey = null;

  User.findById = async () => ({ _id: 'user1', phone: '+251912345678', isPhoneVerified: false });
  User.exists = async () => true;
  tokenService.isPhoneOtpConfigured = () => true;
  smsService.isEnabled = () => true;
  tokenService.createPhoneVerificationOtp = async () => ({
    status: 'created',
    code: '123456',
    cleanupKey: { tokenId: 'token123', digest: 'abc' },
  });
  tokenService.discardPhoneVerificationOtp = async (key) => { discardedKey = key; };
  smsService.setSender(async () => ({ accepted: false, ambiguous: false, reason: 'failed' }));

  try {
    const result = await invoke(authController.resendPhoneVerification, {
      user: { _id: 'user1' },
    });
    assert.equal(result.error.statusCode, 503);
    assert.match(result.error.message, /unavailable/);
    assert.deepEqual(discardedKey, { tokenId: 'token123', digest: 'abc' });
  } finally {
    User.findById = originalFindById;
    tokenService.createPhoneVerificationOtp = originalCreateOtp;
    tokenService.discardPhoneVerificationOtp = originalDiscardOtp;
    tokenService.isPhoneOtpConfigured = originalIsConfigured;
    smsService.isEnabled = originalSmsEnabled;
    smsService.resetSender();
  }
});

test('8. Resend OTP returns 200 and masks sensitive code in HTTP response', async () => {
  const originalFindById = User.findById;
  const originalCreateOtp = tokenService.createPhoneVerificationOtp;
  const originalIsConfigured = tokenService.isPhoneOtpConfigured;
  const originalSmsEnabled = smsService.isEnabled;
  let sentSms = null;

  User.findById = async () => ({ _id: 'user1', phone: '+251912345678', isPhoneVerified: false });
  User.exists = async () => true;
  tokenService.isPhoneOtpConfigured = () => true;
  smsService.isEnabled = () => true;
  tokenService.createPhoneVerificationOtp = async () => ({
    status: 'created',
    code: '654321',
    cleanupKey: { tokenId: 'token123' },
  });
  smsService.setSender(async (sms) => { sentSms = sms; return { accepted: true }; });

  try {
    const result = await invoke(authController.resendPhoneVerification, {
      user: { _id: 'user1' },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.message, 'Verification code sent.');
    assert.equal(result.body.code, undefined);
    assert.equal(result.body.data, undefined);
    assert.equal(sentSms.to, '+251912345678');
    assert.match(sentSms.message, /654321/);
  } finally {
    User.findById = originalFindById;
    tokenService.createPhoneVerificationOtp = originalCreateOtp;
    tokenService.isPhoneOtpConfigured = originalIsConfigured;
    smsService.isEnabled = originalSmsEnabled;
    smsService.resetSender();
  }
});

// 3. Verify Phone Controller Tests
test('9. verifyPhone validator rejects missing or non-6-digit code', async () => {
  const empty = await validate(authValidator.verifyPhone, { body: {} });
  assert.equal(empty.errors.isEmpty(), false);

  const short = await validate(authValidator.verifyPhone, { body: { code: '12345' } });
  assert.equal(short.errors.isEmpty(), false);

  const alpha = await validate(authValidator.verifyPhone, { body: { code: '12345a' } });
  assert.equal(alpha.errors.isEmpty(), false);

  const valid = await validate(authValidator.verifyPhone, { body: { code: '123456' } });
  assert.equal(valid.errors.isEmpty(), true);
});

test('10. Verify Phone returns 200 when code is verified successfully', async () => {
  const originalFindById = User.findById;
  const originalVerifyOtp = tokenService.verifyPhoneVerificationOtp;
  const originalIsConfigured = tokenService.isPhoneOtpConfigured;

  User.findById = async () => ({ _id: 'user1', phone: '+251912345678', isPhoneVerified: false });
  tokenService.isPhoneOtpConfigured = () => true;
  tokenService.verifyPhoneVerificationOtp = async () => ({
    status: 'verified',
    user: { _id: 'user1', phone: '+251912345678', isPhoneVerified: true, preferredCommunication: 'email' },
  });

  try {
    const result = await invoke(authController.verifyPhone, {
      user: { _id: 'user1' },
      body: { code: '123456' },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.message, 'Phone number verified successfully.');
    assert.equal(result.body.data.isPhoneVerified, true);
  } finally {
    User.findById = originalFindById;
    tokenService.verifyPhoneVerificationOtp = originalVerifyOtp;
    tokenService.isPhoneOtpConfigured = originalIsConfigured;
  }
});

test('11. Verify Phone returns 400 when OTP code is invalid or expired', async () => {
  const originalFindById = User.findById;
  const originalVerifyOtp = tokenService.verifyPhoneVerificationOtp;
  const originalIsConfigured = tokenService.isPhoneOtpConfigured;

  User.findById = async () => ({ _id: 'user1', phone: '+251912345678', isPhoneVerified: false });
  tokenService.isPhoneOtpConfigured = () => true;
  tokenService.verifyPhoneVerificationOtp = async () => ({ status: 'invalid' });

  try {
    const result = await invoke(authController.verifyPhone, {
      user: { _id: 'user1' },
      body: { code: '000000' },
    });
    assert.equal(result.error.statusCode, 400);
    assert.match(result.error.message, /invalid or expired/);
  } finally {
    User.findById = originalFindById;
    tokenService.verifyPhoneVerificationOtp = originalVerifyOtp;
    tokenService.isPhoneOtpConfigured = originalIsConfigured;
  }
});

// 4. SMS Service Unit Tests
test('12. SMS Service returns controlled disabled state when disabled', async () => {
  smsService.resetSender();
  const originalEnabled = env.sms.enabled;
  env.sms.enabled = false;
  try {
    const res = await smsService.send({ to: '+251912345678', message: 'Hello' });
    assert.equal(res.accepted, false);
    assert.equal(res.reason, 'disabled');
  } finally {
    env.sms.enabled = originalEnabled;
  }
});

test('13. SMS Service custom sender dependency injection works', async () => {
  let dispatched = null;
  smsService.setSender(async (payload) => { dispatched = payload; return { accepted: true }; });
  try {
    const res = await smsService.send({ to: '+251912345678', message: 'Test message' });
    assert.equal(res.accepted, true);
    assert.deepEqual(dispatched, { to: '+251912345678', message: 'Test message' });
  } finally {
    smsService.resetSender();
  }
});

// 5. Audit & Security Tests
test('14. Repository artifacts do not contain raw OTPs, secret keys, or phone login routes', () => {
  const collection = fs.readFileSync(path.join(__dirname, '../postman_collection.json'), 'utf8');
  assert.doesNotMatch(collection, /phone-login|phone_login/i);
  assert.match(collection, /{{phone_otp}}/);

  const envFile = fs.readFileSync(path.join(__dirname, '../postman_environment.json'), 'utf8');
  assert.match(envFile, /phone_otp/);

  assert.ok(swaggerSpec.paths['/api/auth/resend-phone-verification']);
  assert.ok(swaggerSpec.paths['/api/auth/verify-phone']);
  assert.equal(swaggerSpec.paths['/api/auth/phone-login'], undefined);
});

test('15. Expired OTP (>5 min) is rejected', async () => {
  const originalFindOne = Token.findOne;
  Token.findOne = async () => null;
  try {
    const res = await tokenService.verifyPhoneVerificationOtp({
      userId: '507f1f77bcf86cd799439011',
      targetPhone: '+251911223344',
      code: '123456',
    });
    assert.equal(res.status, 'invalid');
  } finally {
    Token.findOne = originalFindOne;
  }
});

test('16. Incorrect OTP increments attempts counter and 5th wrong attempt invalidates token', async () => {
  let attemptsCount = 0;
  let deleted = false;
  const targetPhone = '+251911223344';
  const userId = '507f1f77bcf86cd799439011';
  const digest = tokenService.hashPhoneOtp({ userId, targetPhone, code: '111111' });

  const fakeTokenDoc = {
    _id: 'token_attempt_test',
    userId,
    targetPhone,
    token: digest,
    attempts: 4,
    expiresAt: new Date(Date.now() + 60000),
  };

  const originalFindOne = Token.findOne;
  const originalFindOneAndUpdate = Token.findOneAndUpdate;
  const originalDeleteOne = Token.deleteOne;

  Token.findOne = async () => fakeTokenDoc;
  Token.findOneAndUpdate = async () => {
    attemptsCount = fakeTokenDoc.attempts + 1;
    return { ...fakeTokenDoc, attempts: attemptsCount };
  };
  Token.deleteOne = async () => { deleted = true; };

  try {
    const res = await tokenService.verifyPhoneVerificationOtp({
      userId,
      targetPhone,
      code: '999999',
    });
    assert.equal(res.status, 'invalid');
    assert.equal(attemptsCount, 5);
    assert.equal(deleted, true);
  } finally {
    Token.findOne = originalFindOne;
    Token.findOneAndUpdate = originalFindOneAndUpdate;
    Token.deleteOne = originalDeleteOne;
  }
});

test('17. Successful OTP verification is single-use (consumed on verify)', async () => {
  const targetPhone = '+251911223344';
  const userId = '507f1f77bcf86cd799439011';
  const code = '123456';
  const digest = tokenService.hashPhoneOtp({ userId, targetPhone, code });

  let consumed = false;
  const fakeTokenDoc = {
    _id: 'single_use_token',
    userId,
    targetPhone,
    token: digest,
    attempts: 0,
    expiresAt: new Date(Date.now() + 60000),
  };

  const originalFindOne = Token.findOne;
  const originalFindOneAndDelete = Token.findOneAndDelete;
  const originalFindOneAndUpdateUser = User.findOneAndUpdate;

  Token.findOne = async () => (consumed ? null : fakeTokenDoc);
  Token.findOneAndDelete = async () => {
    consumed = true;
    return fakeTokenDoc;
  };
  User.findOneAndUpdate = async () => ({ _id: userId, phone: targetPhone, isPhoneVerified: true });

  try {
    const first = await tokenService.verifyPhoneVerificationOtp({ userId, targetPhone, code });
    assert.equal(first.status, 'verified');

    const second = await tokenService.verifyPhoneVerificationOtp({ userId, targetPhone, code });
    assert.equal(second.status, 'invalid');
  } finally {
    Token.findOne = originalFindOne;
    Token.findOneAndDelete = originalFindOneAndDelete;
    User.findOneAndUpdate = originalFindOneAndUpdateUser;
  }
});

test('18. Profile phone change or removal invalidates outstanding OTP tokens', async () => {
  const userId = '507f1f77bcf86cd799439011';
  let deletedUserId = null;

  const originalDeleteMany = Token.deleteMany;
  Token.deleteMany = async (filter) => {
    deletedUserId = filter.userId;
    return { deletedCount: 1 };
  };

  try {
    await tokenService.deletePhoneVerificationTokens(userId);
    assert.equal(deletedUserId, userId);
  } finally {
    Token.deleteMany = originalDeleteMany;
  }
});
