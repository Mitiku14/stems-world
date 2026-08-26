require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
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
const Course = require('../src/models/Course');
const courseController = require('../src/controllers/course.controller');
const courseRoutes = require('../src/routes/course.routes');
const exportController = require('../src/controllers/export.controller');
const { COURSE_CATEGORIES, STEAM_SUBCATEGORIES } = require('../src/constants');
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

const invokeController = async (handler) => {
  let body;
  let nextError;
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };

  await handler({}, res, (error) => {
    nextError = error;
  });
  if (nextError) throw nextError;

  return { statusCode: res.statusCode, body };
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

test('Course STEAM taxonomy is centralized and enforces category/subcategory pairs', async () => {
  assert.deepEqual(Object.keys(STEAM_SUBCATEGORIES), COURSE_CATEGORIES);
  assert.equal(STEAM_SUBCATEGORIES.technology.includes('machine_learning'), true);
  assert.equal(STEAM_SUBCATEGORIES.arts.includes('language_arts'), true);
  assert.equal(STEAM_SUBCATEGORIES.mathematics.includes('calculus'), true);

  const valid = await validate(courseValidator.create, {
    body: {
      title: 'Introduction to Machine Learning',
      category: 'technology',
      subcategory: 'machine_learning',
    },
  });
  assert.equal(valid.isEmpty(), true);

  const legacyCategory = await validate(courseValidator.create, {
    body: {
      title: 'Legacy Course',
      category: 'programming',
      subcategory: 'programming',
    },
  });
  assert.equal(legacyCategory.isEmpty(), false);

  const mismatched = await validate(courseValidator.create, {
    body: {
      title: 'Invalid Pair',
      category: 'technology',
      subcategory: 'calculus',
    },
  });
  assert.equal(mismatched.isEmpty(), false);

  await new Course({
    title: 'Valid Model Taxonomy',
    category: 'mathematics',
    subcategory: 'calculus',
  }).validate();

  await assert.rejects(
    new Course({
      title: 'Invalid Model Taxonomy',
      category: 'technology',
      subcategory: 'calculus',
    }).validate(),
    /Course subcategory must belong to its category/
  );
});

test('Course taxonomy response derives all categories and subcategories from canonical constants', async () => {
  const { statusCode, body } = await invokeController(courseController.getCourseTaxonomy);

  assert.equal(statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.message, 'Course taxonomy fetched successfully.');
  assert.deepEqual(Object.keys(body.data), COURSE_CATEGORIES);

  for (const category of COURSE_CATEGORIES) {
    assert.deepEqual(body.data[category], STEAM_SUBCATEGORIES[category]);
    assert.notStrictEqual(body.data[category], STEAM_SUBCATEGORIES[category]);
  }

  assert.deepEqual(body.data.technology, [
    'programming',
    'machine_learning',
    'computer_literacy',
  ]);
  assert.deepEqual(body.data.science, STEAM_SUBCATEGORIES.science);
  assert.equal(body.data.science.includes('biology'), true);

  const canonicalTechnology = [...STEAM_SUBCATEGORIES.technology];
  body.data.technology.push('response_only_value');
  assert.deepEqual(STEAM_SUBCATEGORIES.technology, canonicalTechnology);
});

test('GET /api/courses/taxonomy resolves before the dynamic course ID route', async (t) => {
  const app = express();
  app.use('/api/courses', courseRoutes);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/courses/taxonomy`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(Object.keys(body.data), COURSE_CATEGORIES);
  assert.equal(body.data.technology.includes('programming'), true);
  assert.equal(body.data.science.includes('biology'), true);
});

test('approved Science subcategories work across Course validation layers', async () => {
  assert.equal(STEAM_SUBCATEGORIES.science.length, 5);

  for (const subcategory of STEAM_SUBCATEGORIES.science) {
    const body = {
      title: `Science Course: ${subcategory}`,
      category: 'science',
      subcategory,
    };

    assert.equal((await validate(courseValidator.create, { body })).isEmpty(), true);
    assert.equal((await validate(courseValidator.update, {
      params: { id: '507f1f77bcf86cd799439011' },
      body: { category: body.category, subcategory },
    })).isEmpty(), true);
    assert.equal((await validate(courseValidator.listQuery, {
      query: { category: body.category, subcategory },
    })).isEmpty(), true);

    await new Course(body).validate();
  }

  for (const [category, subcategory] of [
    ['science', 'programming'],
    ['science', 'calculus'],
    ['science', 'language_arts'],
    ['technology', 'biology'],
    ['mathematics', 'chemistry'],
  ]) {
    const body = { title: 'Invalid Science Pair', category, subcategory };

    assert.equal((await validate(courseValidator.create, { body })).isEmpty(), false);
    assert.equal((await validate(courseValidator.update, {
      params: { id: '507f1f77bcf86cd799439011' },
      body: { category, subcategory },
    })).isEmpty(), false);
    assert.equal((await validate(courseValidator.listQuery, {
      query: { category, subcategory },
    })).isEmpty(), false);
    await assert.rejects(new Course(body).validate());
  }
});

test('Course taxonomy filters reject mismatched pairs', async () => {
  assert.equal((await validate(courseValidator.listQuery, {
    query: { category: 'technology', subcategory: 'programming' },
  })).isEmpty(), true);

  assert.equal((await validate(courseValidator.listQuery, {
    query: { category: 'technology', subcategory: 'calculus' },
  })).isEmpty(), false);

  assert.equal((await validate(courseValidator.listQuery, {
    query: { subcategory: 'not_a_subcategory' },
  })).isEmpty(), false);
});

test('Course partial taxonomy updates validate the final stored pair', async () => {
  const originalFindById = Course.findById;
  Course.findById = () => ({
    select: () => ({
      lean: async () => ({ category: 'technology', subcategory: 'programming' }),
    }),
  });

  try {
    const params = { id: '507f1f77bcf86cd799439011' };

    assert.equal((await validate(courseValidator.update, {
      params,
      body: { subcategory: 'machine_learning' },
    })).isEmpty(), true);

    assert.equal((await validate(courseValidator.update, {
      params,
      body: { subcategory: 'calculus' },
    })).isEmpty(), false);

    assert.equal((await validate(courseValidator.update, {
      params,
      body: { category: 'mathematics' },
    })).isEmpty(), false);

    assert.equal((await validate(courseValidator.update, {
      params,
      body: { category: 'mathematics', subcategory: 'calculus' },
    })).isEmpty(), true);
  } finally {
    Course.findById = originalFindById;
  }
});

test('Course partial taxonomy updates pass the resolved pair to Mongoose validators', async () => {
  const originalFindById = Course.findById;
  const originalFindByIdAndUpdate = Course.findByIdAndUpdate;
  let appliedUpdates;

  Course.findById = () => ({
    select: () => ({
      lean: async () => ({ category: 'technology', subcategory: 'programming' }),
    }),
  });
  Course.findByIdAndUpdate = async (_id, updates) => {
    appliedUpdates = updates;
    return { _id, ...updates };
  };

  try {
    await courseController.updateCourse(
      {
        params: { id: '507f1f77bcf86cd799439011' },
        body: { subcategory: 'machine_learning' },
      },
      { json: (payload) => payload },
      (error) => { throw error; }
    );

    assert.equal(appliedUpdates.category, 'technology');
    assert.equal(appliedUpdates.subcategory, 'machine_learning');
  } finally {
    Course.findById = originalFindById;
    Course.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test('Course CSV export includes category and subcategory without dropping existing fields', async () => {
  const originalFind = Course.find;
  let csv;

  Course.find = () => ({
    select: () => ({
      sort: () => ({
        lean: async () => [{
          _id: '507f1f77bcf86cd799439011',
          title: 'Programming for Kids/Adults',
          frontendId: 'cs-1',
          category: 'technology',
          subcategory: 'programming',
          level: 'beginner',
          instructor: 'Test Instructor',
          duration: '10 weeks',
          season: 'Fall 2026',
          maxStudents: 30,
          requiresDocument: false,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }],
      }),
    }),
  });

  try {
    const response = {
      setHeader: () => {},
      status: () => response,
      send: (body) => { csv = body; return body; },
    };

    await exportController.exportCourses({}, response, (error) => { throw error; });

    assert.equal(csv.startsWith('"Course ID","Title","Frontend ID","Category","Subcategory","Level"'), true);
    assert.equal(csv.includes('"technology","programming","beginner"'), true);
    assert.equal(csv.includes('"Instructor","Duration","Season","Max Students"'), true);
  } finally {
    Course.find = originalFind;
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
