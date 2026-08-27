require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');

const normalizePhone = require('../src/utils/normalizePhone');
const User = require('../src/models/User');
const Token = require('../src/models/Token');
const authValidator = require('../src/validators/auth.validator');
const authController = require('../src/controllers/auth.controller');
const adminController = require('../src/controllers/admin.controller');
const tokenService = require('../src/services/token.service');
const emailService = require('../src/services/email.service');
const swaggerSpec = require('../src/config/swagger');
const env = require('../src/config/env');
const {
  TOKEN_TYPES,
  TOKEN_EXPIRY,
  AUTH_PROVIDERS,
  COMMUNICATION_CHANNELS,
} = require('../src/constants');
const {
  PHONE_CATEGORIES,
  PHONE_INDEX,
  FUTURE_EMAIL_INDEX,
  classifyPhone,
  isApplyRequested,
  buildContactPlan,
  assertSafeApplyTarget,
  assertNoPhoneConflicts,
  assertCompatiblePhoneIndexes,
} = require('../scripts/migrate-user-contact-indexes');

const validate = async (chains, body, user) => {
  const req = { body: { ...body }, query: {}, params: {}, user };
  for (const chain of chains) await chain.run(req);
  return { errors: validationResult(req), req };
};

const invoke = async (handler, request = {}) => {
  let body;
  let error;
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { body = value; return this; },
  };
  await handler(
    { body: {}, params: {}, query: {}, ...request },
    response,
    (nextError) => { error = nextError; }
  );
  return { status: error?.statusCode || response.statusCode, error, body };
};

const existingUser = (overrides = {}) => User.hydrate({
  _id: new mongoose.Types.ObjectId(),
  username: 'contact_user',
  name: 'Contact User',
  email: 'contact@example.com',
  role: 'student',
  authProvider: AUTH_PROVIDERS.LOCAL,
  isEmailVerified: true,
  isActive: true,
  ...overrides,
});

test('phone normalizer canonicalizes equivalent Ethiopian forms and rejects malformed values', () => {
  const equivalent = [
    '0912345678',
    '+251912345678',
    '+251 912 345 678',
    '0912-345-678',
  ].map(normalizePhone);

  assert.deepEqual(equivalent, Array(4).fill('+251912345678'));
  for (const invalid of ['invalid text', '0912', '+012345678']) {
    assert.throws(() => normalizePhone(invalid), /Phone must be/);
  }
});

test('User contact fields stay optional and backward compatible while enforcing verified phone preference', async () => {
  assert.equal(User.schema.path('email').isRequired, true);
  assert.equal(User.schema.path('phone').options.unique, undefined);
  assert.equal(User.schema.path('isPhoneVerified').defaultValue, false);
  assert.equal(User.schema.path('preferredCommunication').defaultValue, COMMUNICATION_CHANNELS.EMAIL);

  const withoutPhone = new User({ name: 'Email User', email: 'email-user@example.com' });
  await withoutPhone.validate();
  assert.equal(withoutPhone.phone, null);
  assert.equal(withoutPhone.isPhoneVerified, false);
  assert.equal(withoutPhone.preferredCommunication, COMMUNICATION_CHANNELS.EMAIL);

  const withPhone = new User({
    name: 'Phone User',
    email: 'phone-user@example.com',
    phone: '0912-345-678',
    isPhoneVerified: true,
  });
  await withPhone.validate();
  assert.equal(withPhone.phone, '+251912345678');
  assert.equal(withPhone.isPhoneVerified, false);

  const unverifiedPreference = new User({
    name: 'Unsafe Preference',
    email: 'unsafe-preference@example.com',
    phone: '+251912345678',
    preferredCommunication: COMMUNICATION_CHANNELS.PHONE,
  });
  await assert.rejects(unverifiedPreference.validate(), /verified phone number/);
});

test('profile validation normalizes phone input and preserves email-only registration contract', async () => {
  const local = await validate(authValidator.updateProfile, { phone: '0912-345-678' });
  assert.equal(local.errors.isEmpty(), true);
  assert.equal(local.req.body.phone, '+251912345678');

  const removal = await validate(authValidator.updateProfile, { phone: null });
  assert.equal(removal.errors.isEmpty(), true);
  assert.equal(removal.req.body.phone, null);

  const invalid = await validate(authValidator.updateProfile, { phone: 'invalid text' });
  assert.equal(invalid.errors.isEmpty(), false);

  const directVerification = await validate(authValidator.updateProfile, { isPhoneVerified: true });
  assert.equal(directVerification.errors.isEmpty(), false);

  const missingEmail = await validate(authValidator.register, {
    fullName: 'Email Still Required',
    password: 'Password123!',
  });
  assert.equal(missingEmail.errors.isEmpty(), false);
  assert.equal(missingEmail.errors.array().some(({ path: field }) => field === 'email'), true);
});

test('profile phone changes reset verification, removal falls back to email, and phone preference requires verification', async () => {
  const originalFindById = User.findById;
  const originalDeleteMany = Token.deleteMany;
  Token.deleteMany = async () => {};
  try {
    const changed = existingUser({ phone: '+251911111111', isPhoneVerified: true });
    changed.save = async function save() { await this.validate(); return this; };
    User.findById = async () => changed;
    const changedResult = await invoke(authController.updateMe, {
      user: changed,
      body: { phone: '0922-222-222' },
    });
    assert.equal(changedResult.status, 200);
    assert.equal(changed.phone, '+251922222222');
    assert.equal(changed.isPhoneVerified, false);
    assert.equal(changedResult.body.data.isPhoneVerified, false);

    const removed = existingUser({
      phone: '+251933333333',
      isPhoneVerified: true,
      preferredCommunication: COMMUNICATION_CHANNELS.PHONE,
    });
    removed.save = async function save() { await this.validate(); return this; };
    User.findById = async () => removed;
    const removedResult = await invoke(authController.updateMe, {
      user: removed,
      body: { phone: null },
    });
    assert.equal(removedResult.status, 200);
    assert.equal(removed.phone, null);
    assert.equal(removed.isPhoneVerified, false);
    assert.equal(removed.preferredCommunication, COMMUNICATION_CHANNELS.EMAIL);

    const unverified = existingUser({ phone: '+251944444444', isPhoneVerified: false });
    unverified.save = async function save() { await this.validate(); return this; };
    User.findById = async () => unverified;
    const preferenceResult = await invoke(authController.updateMe, {
      user: unverified,
      body: { preferredCommunication: COMMUNICATION_CHANNELS.PHONE },
    });
    assert.equal(preferenceResult.status, 400);
    assert.match(preferenceResult.error.message, /verified phone number/);
  } finally {
    User.findById = originalFindById;
    Token.deleteMany = originalDeleteMany;
  }
});

test('current-user and admin student responses expose backward-compatible contact state', async () => {
  const legacyUser = existingUser();
  const profile = await invoke(authController.getMe, { user: legacyUser });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.phone, null);
  assert.equal(profile.body.data.isPhoneVerified, false);
  assert.equal(profile.body.data.preferredCommunication, COMMUNICATION_CHANNELS.EMAIL);

  const originals = { find: User.find, countDocuments: User.countDocuments };
  const rawLegacyUser = {
    _id: legacyUser._id,
    username: legacyUser.username,
    name: legacyUser.name,
    email: legacyUser.email,
    isEmailVerified: true,
    isActive: true,
  };
  const query = {
    select() { return query; },
    sort() { return query; },
    skip() { return query; },
    limit() { return query; },
    lean: async () => [rawLegacyUser],
  };
  User.find = () => query;
  User.countDocuments = async () => 1;

  try {
    const admin = await invoke(adminController.getAllStudents, {
      query: { page: '1', limit: '10' },
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.data.students[0].phone, null);
    assert.equal(admin.body.data.students[0].isPhoneVerified, false);
    assert.equal(
      admin.body.data.students[0].preferredCommunication,
      COMMUNICATION_CHANNELS.EMAIL
    );
  } finally {
    User.find = originals.find;
    User.countDocuments = originals.countDocuments;
  }
});

test('Token foundation accepts phone verification attempts without changing existing token purposes', () => {
  const base = {
    userId: new mongoose.Types.ObjectId(),
    token: 'hashed-token',
    expiresAt: new Date(Date.now() + 60_000),
  };

  for (const type of [
    TOKEN_TYPES.EMAIL_VERIFICATION,
    TOKEN_TYPES.PHONE_VERIFICATION,
    TOKEN_TYPES.PASSWORD_RESET,
  ]) {
    const token = new Token({ ...base, type });
    assert.equal(token.validateSync(), undefined);
    assert.equal(token.attempts, 0);
  }
  assert.equal(TOKEN_TYPES.EMAIL_VERIFICATION, 'emailVerification');
  assert.equal(TOKEN_TYPES.PASSWORD_RESET, 'passwordReset');
  assert.ok(TOKEN_EXPIRY.EMAIL_VERIFICATION > 0);
  assert.ok(TOKEN_EXPIRY.PHONE_VERIFICATION > 0);
  assert.ok(TOKEN_EXPIRY.PASSWORD_RESET > 0);
});

test('token service assigns configured expiries and rejects unsupported token types cleanly', async () => {
  const originalDeleteMany = Token.deleteMany;
  const originalCreate = Token.create;
  const createdTokens = [];
  const deletedTokens = [];

  Token.deleteMany = async (filter) => deletedTokens.push(filter);
  Token.create = async (payload) => {
    createdTokens.push(payload);
    return payload;
  };

  try {
    const userId = new mongoose.Types.ObjectId();
    const expectedExpiries = [
      [TOKEN_TYPES.EMAIL_VERIFICATION, 24 * 60 * 60 * 1000],
      [TOKEN_TYPES.PASSWORD_RESET, 30 * 60 * 1000],
      [TOKEN_TYPES.PHONE_VERIFICATION, 5 * 60 * 1000],
    ];

    for (const [type, ttl] of expectedExpiries) {
      const startedAt = Date.now();
      await tokenService.createToken(userId, type);
      const finishedAt = Date.now();
      const { expiresAt } = createdTokens.at(-1);

      assert.ok(expiresAt instanceof Date);
      assert.equal(Number.isNaN(expiresAt.getTime()), false);
      assert.ok(expiresAt.getTime() >= startedAt + ttl);
      assert.ok(expiresAt.getTime() <= finishedAt + ttl);
    }

    assert.equal(TOKEN_EXPIRY.EMAIL_VERIFICATION, 24 * 60 * 60 * 1000);
    assert.equal(TOKEN_EXPIRY.PASSWORD_RESET, 30 * 60 * 1000);
    assert.equal(TOKEN_EXPIRY.PHONE_VERIFICATION, 5 * 60 * 1000);

    const deletesBeforeUnsupportedType = deletedTokens.length;
    await assert.rejects(
      tokenService.createToken(userId, 'toString'),
      /Unsupported token type/
    );
    assert.equal(deletedTokens.length, deletesBeforeUnsupportedType);
    assert.equal(createdTokens.length, expectedExpiries.length);
  } finally {
    Token.deleteMany = originalDeleteMany;
    Token.create = originalCreate;
  }
});

test('email registration, verification, login, username login, password reset, and JWT contract regressions remain intact', async () => {
  const originals = {
    findOne: User.findOne,
    findById: User.findById,
    create: User.create,
    createToken: tokenService.createToken,
    findToken: tokenService.findToken,
    deleteToken: tokenService.deleteToken,
    sendVerificationEmail: emailService.sendVerificationEmail,
    sendWelcomeEmail: emailService.sendWelcomeEmail,
    sendPasswordResetEmail: emailService.sendPasswordResetEmail,
    hash: bcrypt.hash,
    compare: bcrypt.compare,
  };

  const userId = new mongoose.Types.ObjectId();
  const localUser = existingUser({
    _id: userId,
    username: 'email_login_user',
    email: 'email-login@example.com',
    password: 'hashed:Password123!',
  });
  localUser.password = 'hashed:Password123!';
  localUser.save = async () => localUser;
  let createdPayload;
  let lastLookup;

  try {
    bcrypt.hash = async (value) => `hashed:${value}`;
    bcrypt.compare = async (value, hashed) => hashed === `hashed:${value}`;
    tokenService.createToken = async (_id, type) => `raw-${type}`;
    tokenService.findToken = async (_raw, type) => ({ userId, type, deleteOne: async () => {} });
    tokenService.deleteToken = async () => {};
    emailService.sendVerificationEmail = async () => {};
    emailService.sendWelcomeEmail = () => {};
    emailService.sendPasswordResetEmail = async () => {};

    User.findOne = (query) => (
      query.username
        ? { lean: async () => null }
        : Promise.resolve(null)
    );
    User.create = async (payload) => {
      createdPayload = payload;
      return { _id: userId, ...payload };
    };
    const registration = await invoke(authController.register, {
      body: { fullName: 'Email User', email: 'email-login@example.com', password: 'Password123!' },
    });
    assert.equal(registration.status, 201);
    assert.equal(createdPayload.email, 'email-login@example.com');
    assert.equal(createdPayload.phone, undefined);

    const verificationUser = existingUser({ _id: userId, isEmailVerified: false });
    verificationUser.save = async () => verificationUser;
    User.findById = async () => verificationUser;
    const verification = await invoke(authController.verifyEmail, { params: { token: 'email-token' } });
    assert.equal(verification.status, 200);
    assert.equal(verificationUser.isEmailVerified, true);

    User.findOne = (query) => {
      lastLookup = query;
      return { select: async () => localUser };
    };
    const emailLogin = await invoke(authController.login, {
      body: { email: 'EMAIL-LOGIN@EXAMPLE.COM', password: 'Password123!' },
    });
    assert.equal(emailLogin.status, 200);
    assert.deepEqual(lastLookup, { email: 'email-login@example.com' });

    const usernameLogin = await invoke(authController.login, {
      body: { identifier: 'EMAIL_LOGIN_USER', password: 'Password123!' },
    });
    assert.equal(usernameLogin.status, 200);
    assert.deepEqual(lastLookup, { username: 'email_login_user' });

    const decoded = jwt.verify(usernameLogin.body.data.token, env.jwt.secret);
    assert.equal(decoded.id, userId.toString());
    assert.equal(decoded.role, 'student');
    assert.equal(decoded.email, undefined);
    assert.equal(decoded.phone, undefined);

    User.findOne = async () => localUser;
    const forgot = await invoke(authController.forgotPassword, {
      body: { email: localUser.email },
    });
    assert.equal(forgot.status, 200);

    const resetUser = { ...localUser, password: 'hashed:OldPassword123!', save: async () => {} };
    User.findById = () => ({ select: async () => resetUser });
    const reset = await invoke(authController.resetPassword, {
      params: { token: 'reset-token' },
      body: { password: 'NewPassword123!' },
    });
    assert.equal(reset.status, 200);
    assert.equal(resetUser.password, 'hashed:NewPassword123!');
  } finally {
    User.findOne = originals.findOne;
    User.findById = originals.findById;
    User.create = originals.create;
    tokenService.createToken = originals.createToken;
    tokenService.findToken = originals.findToken;
    tokenService.deleteToken = originals.deleteToken;
    emailService.sendVerificationEmail = originals.sendVerificationEmail;
    emailService.sendWelcomeEmail = originals.sendWelcomeEmail;
    emailService.sendPasswordResetEmail = originals.sendPasswordResetEmail;
    bcrypt.hash = originals.hash;
    bcrypt.compare = originals.compare;
  }
});

test('returning, linked, and new Google users remain email-based with optional phone and unchanged JWTs', async () => {
  const originals = {
    verifyIdToken: OAuth2Client.prototype.verifyIdToken,
    findOne: User.findOne,
    create: User.create,
    sendWelcomeEmail: emailService.sendWelcomeEmail,
  };
  const returning = existingUser({ googleId: 'google-returning', authProvider: AUTH_PROVIDERS.GOOGLE });
  const linked = existingUser({ email: 'linked@example.com', isEmailVerified: false });
  linked.save = async () => linked;
  let newGooglePayload;
  const payloads = {
    returning: { sub: 'google-returning', email: 'returning@example.com', name: 'Returning', email_verified: true },
    linked: { sub: 'google-linked', email: 'linked@example.com', name: 'Linked', email_verified: true },
    new: { sub: 'google-new', email: 'new-google@example.com', name: 'New Google', email_verified: true },
  };

  try {
    OAuth2Client.prototype.verifyIdToken = async ({ idToken }) => ({
      getPayload: () => payloads[idToken],
    });
    User.findOne = (query) => {
      if (query.username) return { lean: async () => null };
      if (query.googleId === 'google-returning') return Promise.resolve(returning);
      if (query.email === 'linked@example.com') return Promise.resolve(linked);
      return Promise.resolve(null);
    };
    User.create = async (payload) => {
      newGooglePayload = payload;
      return existingUser({ ...payload, _id: new mongoose.Types.ObjectId() });
    };
    emailService.sendWelcomeEmail = () => {};

    const returningResult = await invoke(authController.googleSignIn, { body: { idToken: 'returning' } });
    assert.equal(returningResult.status, 200);

    const linkedResult = await invoke(authController.googleSignIn, { body: { idToken: 'linked' } });
    assert.equal(linkedResult.status, 200);
    assert.equal(linked.googleId, 'google-linked');
    assert.equal(linked.isEmailVerified, true);

    const newResult = await invoke(authController.googleSignIn, { body: { idToken: 'new' } });
    assert.equal(newResult.status, 201);
    assert.equal(newGooglePayload.email, 'new-google@example.com');
    assert.equal(newGooglePayload.phone, undefined);
    assert.equal(newGooglePayload.isEmailVerified, true);

    const decoded = jwt.verify(newResult.body.data.token, env.jwt.secret);
    assert.deepEqual(
      Object.keys(decoded).filter((key) => !['iat', 'exp'].includes(key)).sort(),
      ['id', 'role']
    );
  } finally {
    OAuth2Client.prototype.verifyIdToken = originals.verifyIdToken;
    User.findOne = originals.findOne;
    User.create = originals.create;
    emailService.sendWelcomeEmail = originals.sendWelcomeEmail;
  }
});

test('contact migration planning is dry-run-safe, conflict-aware, guarded, and idempotent', () => {
  const users = [
    { _id: '1', email: 'one@example.com', phone: '0912345678', authProvider: AUTH_PROVIDERS.LOCAL },
    { _id: '2', email: 'two@example.com', phone: '+251 912 345 678', authProvider: AUTH_PROVIDERS.GOOGLE },
    { _id: '3', email: 'three@example.com', phone: 'invalid text', authProvider: AUTH_PROVIDERS.LOCAL },
    { _id: '4', email: 'four@example.com', phone: '251911111111', authProvider: AUTH_PROVIDERS.LOCAL },
    { _id: '5', email: 'five@example.com', phone: '', authProvider: AUTH_PROVIDERS.LOCAL },
    { _id: '6', email: 'ONE@example.com', phone: null, authProvider: AUTH_PROVIDERS.LOCAL },
  ];
  const snapshot = JSON.parse(JSON.stringify(users));
  const plan = buildContactPlan(users, [{ name: 'email_1', key: { email: 1 }, unique: true }]);

  assert.deepEqual(users, snapshot);
  assert.equal(plan.summary.totalUsers, 6);
  assert.equal(plan.summary.duplicateCanonicalPhones, 1);
  assert.equal(plan.summary.invalidPhones, 1);
  assert.equal(plan.summary.ambiguousPhones, 1);
  assert.equal(plan.summary.emptyPhoneStrings, 1);
  assert.equal(plan.summary.duplicateEmails, 1);
  assert.equal(plan.phoneValues.filter(({ category }) => category === PHONE_CATEGORIES.DUPLICATE).length, 2);
  assert.deepEqual(plan.canonicalPhoneDuplicates[0].userIds, ['1', '2']);
  assert.throws(() => assertNoPhoneConflicts(plan), /MANUAL PRODUCT\/DATA DECISION REQUIRED/);

  assert.equal(isApplyRequested(['node', 'script']), false);
  assert.equal(isApplyRequested(['node', 'script', '--apply']), true);

  assert.equal(classifyPhone('0912345678').category, PHONE_CATEGORIES.SAFE_NORMALIZATION);
  assert.equal(classifyPhone('invalid text').category, PHONE_CATEGORIES.INVALID);
  assert.equal(classifyPhone('251912345678').category, PHONE_CATEGORIES.AMBIGUOUS);

  const safeArgs = ['node', 'script', '--apply', '--confirm-development', '--confirm-user-contact-indexes'];
  assert.doesNotThrow(() => assertSafeApplyTarget({
    nodeEnv: 'development', host: 'localhost', database: 'stems_test', argv: safeArgs,
  }));
  assert.throws(() => assertSafeApplyTarget({
    nodeEnv: 'production', host: 'cluster.mongodb.net', database: 'stems_prod', argv: safeArgs,
  }), /outside NODE_ENV=development/);
  assert.throws(() => assertSafeApplyTarget({
    nodeEnv: 'development', host: 'cluster.mongodb.net', database: 'stems', argv: safeArgs,
  }), /could not be proven/);

  const canonical = buildContactPlan([{
    _id: 'safe', email: 'safe@example.com', phone: '+251912345678',
    isPhoneVerified: false, authProvider: AUTH_PROVIDERS.LOCAL,
  }], [
    { name: PHONE_INDEX.options.name, key: PHONE_INDEX.key, ...PHONE_INDEX.options },
  ]);
  assert.equal(canonical.plannedPhoneUpdates.length, 0);
  assert.doesNotThrow(() => assertCompatiblePhoneIndexes(canonical.currentIndexes));
  assert.equal(FUTURE_EMAIL_INDEX.options.partialFilterExpression.email.$type, 'string');
});

test('contact migration changes only legacy phone values and preserves verified canonical phones on rerun', () => {
  const plannedUpdatesFor = (phone, isPhoneVerified) => buildContactPlan([{
    _id: 'migration-user',
    email: 'migration-user@example.com',
    phone,
    isPhoneVerified,
    authProvider: AUTH_PROVIDERS.LOCAL,
  }]).plannedPhoneUpdates;

  assert.deepEqual(plannedUpdatesFor('0912345678', false), [{
    userId: 'migration-user',
    phone: '+251912345678',
    isPhoneVerified: false,
  }]);
  assert.deepEqual(plannedUpdatesFor('0912345678', true), [{
    userId: 'migration-user',
    phone: '+251912345678',
    isPhoneVerified: false,
  }]);
  assert.deepEqual(plannedUpdatesFor('+251912345678', false), []);
  assert.deepEqual(plannedUpdatesFor('+251912345678', true), []);
  assert.deepEqual(plannedUpdatesFor(null, true), []);

  const legacyUser = {
    _id: 'future-verified-user',
    email: 'future-verified-user@example.com',
    phone: '0912345678',
    isPhoneVerified: true,
    authProvider: AUTH_PROVIDERS.LOCAL,
  };
  const firstRun = buildContactPlan([legacyUser]).plannedPhoneUpdates;
  assert.deepEqual(firstRun, [{
    userId: 'future-verified-user',
    phone: '+251912345678',
    isPhoneVerified: false,
  }]);

  const migratedUser = {
    ...legacyUser,
    phone: firstRun[0].phone,
    isPhoneVerified: firstRun[0].isPhoneVerified,
  };
  assert.deepEqual(buildContactPlan([migratedUser]).plannedPhoneUpdates, []);

  const legitimatelyVerifiedUser = { ...migratedUser, isPhoneVerified: true };
  assert.deepEqual(buildContactPlan([legitimatelyVerifiedUser]).plannedPhoneUpdates, []);
  assert.equal(legitimatelyVerifiedUser.isPhoneVerified, true);
});

test('Swagger and Postman expose only the implemented Phase-2 profile contact contract', () => {
  const user = swaggerSpec.components.schemas.User.properties;
  assert.equal(user.phone.pattern, '^\\+[1-9]\\d{7,14}$');
  assert.equal(user.isPhoneVerified.type, 'boolean');
  assert.deepEqual(user.preferredCommunication.enum, ['email', 'phone']);

  const profileUpdate = swaggerSpec.paths['/api/auth/me'].put.requestBody.content['application/json'].schema;
  assert.equal(profileUpdate.properties.phone.nullable, true);
  assert.deepEqual(profileUpdate.properties.preferredCommunication.enum, ['email', 'phone']);
  assert.ok(swaggerSpec.paths['/api/auth/resend-phone-verification']);
  assert.ok(swaggerSpec.paths['/api/auth/verify-phone']);
  assert.equal(swaggerSpec.paths['/api/auth/phone-login'], undefined);

  const generator = fs.readFileSync(path.join(__dirname, '../scripts/generate-postman.js'), 'utf8');
  assert.match(generator, /phone: '0912345678'/);
  assert.match(generator, /Resend Phone Verification/);
  assert.match(generator, /Verify Phone/);
  assert.doesNotMatch(generator, /Phone Login/);

  const collection = JSON.parse(fs.readFileSync(path.join(__dirname, '../postman_collection.json'), 'utf8'));
  const requests = [];
  const collect = (items = []) => items.forEach((item) => {
    if (item.request) requests.push(item);
    collect(item.item);
  });
  collect(collection.item);
  const updateProfile = requests.find(({ name }) => name === 'Update Profile');
  assert.deepEqual(JSON.parse(updateProfile.request.body.raw), {
    name: 'Postman Student Updated',
    phone: '0912345678',
    preferredCommunication: 'email',
  });
  assert.ok(requests.some(({ name }) => name === 'Resend Phone Verification'));
  assert.ok(requests.some(({ name }) => name === 'Verify Phone'));
  assert.equal(requests.some(({ name }) => /Phone Login/.test(name)), false);
});
