require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');

const escapeRegex = require('../src/utils/escapeRegex');
const authValidator = require('../src/validators/auth.validator');
const enrollmentValidator = require('../src/validators/enrollment.validator');
const contactValidator = require('../src/validators/contact.validator');
const competitionValidator = require('../src/validators/competition.validator');
const compRegValidator = require('../src/validators/competitionRegistration.validator');
const certificateValidator = require('../src/validators/certificate.validator');
const courseValidator = require('../src/validators/course.validator');
const siteValidator = require('../src/validators/site.validator');
const env = require('../src/config/env');

const validate = async (chains, request = {}) => {
  const req = {
    body: {},
    query: {},
    params: {},
    ...request,
  };
  for (const chain of chains) await chain.run(req);
  return validationResult(req);
};

test('regex search text is escaped literally and handles non-string inputs safely', () => {
  for (const value of ['.', '*', '[', '(', 'a+b']) {
    const regex = new RegExp(escapeRegex(value), 'i');
    assert.equal(regex.test(value), true);
    assert.equal(regex.test('unrelated text'), false);
  }
  assert.equal(new RegExp(escapeRegex('Bole'), 'i').test('bole road'), true);

  // AUD-M04: Non-string input safety
  assert.equal(escapeRegex(null), '');
  assert.equal(escapeRegex(undefined), '');
  assert.equal(escapeRegex(123), '');
  assert.equal(escapeRegex(['array']), '');
});

test('password validators enforce the model-aligned eight character minimum', async () => {
  const invalid = await validate(authValidator.register, {
    body: { fullName: 'Test User', email: 'test@example.com', password: '1234567' },
  });
  assert.equal(invalid.isEmpty(), false);

  const valid = await validate(authValidator.register, {
    body: { fullName: 'Test User', email: 'test@example.com', password: '12345678' },
  });
  assert.equal(valid.isEmpty(), true);
});

test('AUD-M03: login validator supports both email and username identifier', async () => {
  // Valid email login
  const emailLogin = await validate(authValidator.login, {
    body: { email: 'user@example.com', password: 'password123' },
  });
  assert.equal(emailLogin.isEmpty(), true);

  // Valid username login via email field
  const usernameEmailLogin = await validate(authValidator.login, {
    body: { email: 'john_doe', password: 'password123' },
  });
  assert.equal(usernameEmailLogin.isEmpty(), true);

  // Valid username login via identifier field
  const identifierLogin = await validate(authValidator.login, {
    body: { identifier: 'admin_user', password: 'password123' },
  });
  assert.equal(identifierLogin.isEmpty(), true);

  // Invalid email format
  const invalidEmail = await validate(authValidator.login, {
    body: { email: 'invalid-email@', password: 'password123' },
  });
  assert.equal(invalidEmail.isEmpty(), false);

  // Missing identifier and email
  const missingId = await validate(authValidator.login, {
    body: { password: 'password123' },
  });
  assert.equal(missingId.isEmpty(), false);
});

test('all newly protected paginated lists reject invalid boundaries', async () => {
  const validators = [
    enrollmentValidator.myListQuery,
    contactValidator.listQuery,
    courseValidator.listQuery,
    competitionValidator.listQuery,
  ];

  for (const chains of validators) {
    for (const query of [
      { page: '0' },
      { page: '-1' },
      { page: 'abc' },
      { limit: '0' },
      { limit: '-1' },
      { limit: 'abc' },
      { limit: '999999' },
    ]) {
      assert.equal((await validate(chains, { query })).isEmpty(), false);
    }
    assert.equal((await validate(chains, { query: { page: '2', limit: '10' } })).isEmpty(), true);
  }
});

test('AUD-M04: search query validators enforce scalar string type and max length', async () => {
  const listValidators = [
    siteValidator.publicListQuery,
    enrollmentValidator.adminListQuery,
    compRegValidator.adminListQuery,
    certificateValidator.adminListQuery,
    contactValidator.listQuery,
    courseValidator.listQuery,
  ];

  for (const chains of listValidators) {
    // Valid scalar search
    assert.equal((await validate(chains, { query: { search: 'valid text' } })).isEmpty(), true);
    // Invalid array query
    assert.equal((await validate(chains, { query: { search: ['array', 'input'] } })).isEmpty(), false);
    // Overlong search (>100 chars)
    assert.equal((await validate(chains, { query: { search: 'x'.repeat(101) } })).isEmpty(), false);
  }
});

test('competition creation rejects invalid chronological date order', async () => {
  const base = { title: 'Test', type: 'competition', scope: 'local' };
  const cases = [
    { registrationOpenDate: '2026-02-02', registrationCloseDate: '2026-02-01' },
    { eventStartDate: '2026-03-02', eventEndDate: '2026-03-01' },
    { registrationCloseDate: '2026-04-02', eventStartDate: '2026-04-01' },
  ];

  for (const dates of cases) {
    assert.equal((await validate(competitionValidator.createCompetitionRules, {
      body: { ...base, ...dates },
    })).isEmpty(), false);
  }

  assert.equal((await validate(competitionValidator.createCompetitionRules, {
    body: {
      ...base,
      registrationOpenDate: '2026-01-01',
      registrationCloseDate: '2026-01-02',
      eventStartDate: '2026-01-03',
      eventEndDate: '2026-01-04',
    },
  })).isEmpty(), true);
});

test('competition update rejects attempts to overwrite createdBy', async () => {
  const result = await validate(competitionValidator.updateCompetitionRules, {
    params: { id: 'not-an-object-id' },
    body: { createdBy: '507f1f77bcf86cd799439011' },
  });
  assert.equal(result.isEmpty(), false);
});

test('AUD-M08: environment config returns valid numbers for ports', () => {
  assert.equal(typeof env.port, 'number');
  assert.equal(Number.isNaN(env.port), false);
  assert.equal(typeof env.email.port, 'number');
  assert.equal(Number.isNaN(env.email.port), false);
});
