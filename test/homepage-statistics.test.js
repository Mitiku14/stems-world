require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const HomepageStatistics = require('../src/models/HomepageStatistics');
const statisticsValidator = require('../src/validators/statistics.validator');
const statisticsController = require('../src/controllers/statistics.controller');
const statisticsRoutes = require('../src/routes/statistics.routes');
const adminRoutes = require('../src/routes/admin.routes');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { requireRole } = require('../src/middleware/role.middleware');
const { ROLES } = require('../src/constants');
const swaggerSpec = require('../src/config/swagger');

const {
  HOMEPAGE_STATISTICS_KEY,
  DEFAULT_HOMEPAGE_STATISTICS,
} = HomepageStatistics;

const adminId = new mongoose.Types.ObjectId();

const clone = (value) => (value === null || value === undefined
  ? value
  : JSON.parse(JSON.stringify(value)));

const setPath = (target, dottedPath, value) => {
  const segments = dottedPath.split('.');
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
    cursor = cursor[segment];
  }
  cursor[segments.at(-1)] = value;
};

const defaultRecord = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  key: HOMEPAGE_STATISTICS_KEY,
  registeredStudents: DEFAULT_HOMEPAGE_STATISTICS.registeredStudents,
  totalCoursesGiven: DEFAULT_HOMEPAGE_STATISTICS.totalCoursesGiven,
  annualLearningCapacity: DEFAULT_HOMEPAGE_STATISTICS.annualLearningCapacity,
  competitionParticipants: DEFAULT_HOMEPAGE_STATISTICS.competitionParticipants,
  showPlus: { ...DEFAULT_HOMEPAGE_STATISTICS.showPlus },
  updatedBy: null,
  createdAt: new Date('2026-09-02T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
  ...overrides,
});

const installStore = (initialRecord = null) => {
  const originals = {
    findOne: HomepageStatistics.findOne,
    findOneAndUpdate: HomepageStatistics.findOneAndUpdate,
  };
  let record = initialRecord ? clone(initialRecord) : null;
  let findCalls = 0;
  let writeCalls = 0;

  HomepageStatistics.findOne = () => {
    findCalls += 1;
    return { lean: async () => clone(record) };
  };

  HomepageStatistics.findOneAndUpdate = async (_filter, update, options = {}) => {
    writeCalls += 1;
    if (!record && !options.upsert) return null;
    const inserting = !record;
    if (inserting) record = {};

    for (const [field, value] of Object.entries(update.$setOnInsert || {})) {
      if (inserting && options.upsert) setPath(record, field, clone(value));
    }
    for (const [field, value] of Object.entries(update.$set || {})) {
      setPath(record, field, clone(value));
    }

    record._id ||= String(new mongoose.Types.ObjectId());
    record.createdAt ||= new Date().toISOString();
    record.updatedAt = new Date().toISOString();
    return clone(record);
  };

  return {
    get record() { return clone(record); },
    get findCalls() { return findCalls; },
    get writeCalls() { return writeCalls; },
    restore() {
      HomepageStatistics.findOne = originals.findOne;
      HomepageStatistics.findOneAndUpdate = originals.findOneAndUpdate;
    },
  };
};

const invoke = async (handler, request = {}) => {
  let body;
  let error;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { body = value; return this; },
  };
  await handler({ body: {}, params: {}, query: {}, ...request }, res, (nextError) => {
    error = nextError;
  });
  return { statusCode: res.statusCode, body, error };
};

const validatePatch = async (body) => {
  const req = { body, params: {}, query: {} };
  for (const chain of statisticsValidator.patchStatistics) await chain.run(req);
  return validationResult(req);
};

const validAdminRequest = (body) => ({ body, user: { _id: adminId, role: ROLES.ADMIN } });

test('HomepageStatistics schema is a validated singleton with approved defaults', async () => {
  const paths = HomepageStatistics.schema.paths;
  assert.equal(paths.key.defaultValue, HOMEPAGE_STATISTICS_KEY);
  assert.equal(paths.key.options.immutable, true);
  assert.equal(paths.key.options.unique, true);

  const document = new HomepageStatistics();
  await document.validate();
  assert.equal(document.registeredStudents, 1500);
  assert.equal(document.totalCoursesGiven, 10);
  assert.equal(document.annualLearningCapacity, 3000);
  assert.equal(document.competitionParticipants, 10);
  assert.deepEqual(document.showPlus.toObject(), DEFAULT_HOMEPAGE_STATISTICS.showPlus);
  assert.ok(paths.createdAt);
  assert.ok(paths.updatedAt);
});

test('public GET returns an existing PM-managed configuration', async (t) => {
  const store = installStore(defaultRecord({
    registeredStudents: 1700,
    showPlus: { ...DEFAULT_HOMEPAGE_STATISTICS.showPlus, registeredStudents: false },
  }));
  t.after(() => store.restore());

  const result = await invoke(statisticsController.getPublicStatistics);
  assert.equal(result.error, undefined);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data.registeredStudents, { value: 1700, showPlus: false });
  assert.deepEqual(result.body.data.totalCoursesGiven, { value: 10, showPlus: true });
});

test('public GET returns approved defaults when the singleton is absent', async (t) => {
  const store = installStore();
  t.after(() => store.restore());

  const result = await invoke(statisticsController.getPublicStatistics);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.body.data, {
    registeredStudents: { value: 1500, showPlus: true },
    totalCoursesGiven: { value: 10, showPlus: true },
    annualLearningCapacity: { value: 3000, showPlus: true },
    competitionParticipants: { value: 10, showPlus: true },
  });
});

test('missing-document public GET is read-only and performs no write', async (t) => {
  const store = installStore();
  t.after(() => store.restore());

  await invoke(statisticsController.getPublicStatistics);
  assert.equal(store.findCalls, 1);
  assert.equal(store.writeCalls, 0);
  assert.equal(store.record, null);
});

test('admin GET returns configured=false and defaults without writing when absent', async (t) => {
  const store = installStore();
  t.after(() => store.restore());

  const result = await invoke(statisticsController.getAdminStatistics);
  assert.equal(result.error, undefined);
  assert.equal(result.body.data.configured, false);
  assert.equal(result.body.data.registeredStudents, 1500);
  assert.deepEqual(result.body.data.showPlus, DEFAULT_HOMEPAGE_STATISTICS.showPlus);
  assert.equal(result.body.data.updatedBy, null);
  assert.equal(result.body.data.updatedAt, null);
  assert.equal(store.writeCalls, 0);
});

test('admin PATCH updates one numeric field and upserts the singleton', async (t) => {
  const store = installStore();
  t.after(() => store.restore());

  const result = await invoke(
    statisticsController.updateAdminStatistics,
    validAdminRequest({ registeredStudents: 1600 })
  );
  assert.equal(result.error, undefined);
  assert.equal(result.body.data.configured, true);
  assert.equal(result.body.data.registeredStudents, 1600);
  assert.equal(result.body.data.totalCoursesGiven, 10);
  assert.equal(store.record.key, HOMEPAGE_STATISTICS_KEY);
  assert.equal(store.writeCalls, 1);
});

test('admin PATCH updates multiple numeric fields', async (t) => {
  const store = installStore(defaultRecord());
  t.after(() => store.restore());

  const result = await invoke(
    statisticsController.updateAdminStatistics,
    validAdminRequest({ registeredStudents: 1600, annualLearningCapacity: 3500 })
  );
  assert.equal(result.error, undefined);
  assert.equal(result.body.data.registeredStudents, 1600);
  assert.equal(result.body.data.annualLearningCapacity, 3500);
});

test('admin PATCH updates all numeric and showPlus fields', async (t) => {
  const store = installStore(defaultRecord());
  t.after(() => store.restore());
  const body = {
    registeredStudents: 2000,
    totalCoursesGiven: 20,
    annualLearningCapacity: 4000,
    competitionParticipants: 30,
    showPlus: {
      registeredStudents: false,
      totalCoursesGiven: false,
      annualLearningCapacity: false,
      competitionParticipants: false,
    },
  };

  const result = await invoke(statisticsController.updateAdminStatistics, validAdminRequest(body));
  assert.equal(result.error, undefined);
  assert.deepEqual(
    {
      registeredStudents: result.body.data.registeredStudents,
      totalCoursesGiven: result.body.data.totalCoursesGiven,
      annualLearningCapacity: result.body.data.annualLearningCapacity,
      competitionParticipants: result.body.data.competitionParticipants,
      showPlus: result.body.data.showPlus,
    },
    body
  );
});

test('admin PATCH preserves omitted numeric fields', async (t) => {
  const store = installStore(defaultRecord({ totalCoursesGiven: 77, competitionParticipants: 88 }));
  t.after(() => store.restore());

  await invoke(
    statisticsController.updateAdminStatistics,
    validAdminRequest({ annualLearningCapacity: 5000 })
  );
  assert.equal(store.record.totalCoursesGiven, 77);
  assert.equal(store.record.competitionParticipants, 88);
  assert.equal(store.record.annualLearningCapacity, 5000);
});

test('nested showPlus PATCH preserves omitted flags', async (t) => {
  const store = installStore(defaultRecord());
  t.after(() => store.restore());

  const result = await invoke(
    statisticsController.updateAdminStatistics,
    validAdminRequest({ showPlus: { annualLearningCapacity: false } })
  );
  assert.deepEqual(result.body.data.showPlus, {
    registeredStudents: true,
    totalCoursesGiven: true,
    annualLearningCapacity: false,
    competitionParticipants: true,
  });
});

test('zero is accepted for all numeric metrics and round-trips correctly', async (t) => {
  const store = installStore(defaultRecord());
  t.after(() => store.restore());
  const body = {
    registeredStudents: 0,
    totalCoursesGiven: 0,
    annualLearningCapacity: 0,
    competitionParticipants: 0,
  };
  
  const patchResult = await invoke(statisticsController.updateAdminStatistics, validAdminRequest(body));
  assert.equal(patchResult.body.data.registeredStudents, 0);
  assert.equal(patchResult.body.data.totalCoursesGiven, 0);
  assert.equal(patchResult.body.data.annualLearningCapacity, 0);
  assert.equal(patchResult.body.data.competitionParticipants, 0);

  const getPublicResult = await invoke(statisticsController.getPublicStatistics);
  assert.equal(getPublicResult.body.data.registeredStudents.value, 0);
  assert.equal(getPublicResult.body.data.totalCoursesGiven.value, 0);
  assert.equal(getPublicResult.body.data.annualLearningCapacity.value, 0);
  assert.equal(getPublicResult.body.data.competitionParticipants.value, 0);
  
  const getAdminResult = await invoke(statisticsController.getAdminStatistics);
  assert.equal(getAdminResult.body.data.registeredStudents, 0);
  assert.equal(getAdminResult.body.data.totalCoursesGiven, 0);
  assert.equal(getAdminResult.body.data.annualLearningCapacity, 0);
  assert.equal(getAdminResult.body.data.competitionParticipants, 0);
});

test('validation accepts 0, 1, and MAX_SAFE_INTEGER and rejects -1, 1.5, and MAX_SAFE_INTEGER + 1', async () => {
  for (const field of ['registeredStudents', 'totalCoursesGiven', 'annualLearningCapacity', 'competitionParticipants']) {
    for (const validValue of [0, 1, Number.MAX_SAFE_INTEGER]) {
      assert.equal((await validatePatch({ [field]: validValue })).isEmpty(), true, `${field} rejected valid value ${validValue}`);
    }
    for (const invalidValue of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await validatePatch({ [field]: invalidValue })).isEmpty(), false, `${field} passed invalid value ${invalidValue}`);
    }
  }
});

test('numeric strings are rejected', async () => {
  assert.equal((await validatePatch({ annualLearningCapacity: '3000' })).isEmpty(), false);
});

test('formatted numeric strings are rejected for all numeric fields', async () => {
  for (const field of ['registeredStudents', 'totalCoursesGiven', 'annualLearningCapacity', 'competitionParticipants']) {
    for (const invalid of ['1500', '1,500+']) {
      assert.equal(
        (await validatePatch({ [field]: invalid })).isEmpty(),
        false,
        `${field} should reject formatted numeric string "${invalid}"`
      );
    }
  }
});

test('arrays and objects are rejected for numeric fields', async () => {
  for (const field of ['registeredStudents', 'totalCoursesGiven', 'annualLearningCapacity', 'competitionParticipants']) {
    for (const invalid of [[], {}, null]) {
      assert.equal(
        (await validatePatch({ [field]: invalid })).isEmpty(),
        false,
        `${field} should reject ${JSON.stringify(invalid)}`
      );
    }
  }
});

test('unknown top-level fields are rejected', async () => {
  assert.equal((await validatePatch({ label: 'Students' })).isEmpty(), false);
});

test('unknown showPlus fields are rejected', async () => {
  assert.equal((await validatePatch({ showPlus: { other: true } })).isEmpty(), false);
});

test('non-boolean showPlus fields are rejected', async () => {
  assert.equal((await validatePatch({ showPlus: { registeredStudents: 'true' } })).isEmpty(), false);
});

test('empty PATCH and empty showPlus objects are rejected', async () => {
  assert.equal((await validatePatch({})).isEmpty(), false);
  assert.equal((await validatePatch({ showPlus: {} })).isEmpty(), false);
});

test('unauthenticated admin access is rejected by existing authentication middleware', async () => {
  const result = await invoke(verifyToken, { headers: {} });
  assert.equal(result.error?.statusCode, 401);
});

test('non-admin access is rejected by existing role middleware', async () => {
  let error;
  requireRole(ROLES.ADMIN)(
    { user: { role: ROLES.STUDENT } },
    {},
    (nextError) => { error = nextError; }
  );
  assert.equal(error?.statusCode, 403);
});

test('first and subsequent PATCH operations target the same singleton', async (t) => {
  const store = installStore();
  t.after(() => store.restore());

  await invoke(
    statisticsController.updateAdminStatistics,
    validAdminRequest({ totalCoursesGiven: 11 })
  );
  const firstId = store.record._id;
  await invoke(
    statisticsController.updateAdminStatistics,
    validAdminRequest({ competitionParticipants: 12 })
  );
  assert.equal(store.record._id, firstId);
  assert.equal(store.record.totalCoursesGiven, 11);
  assert.equal(store.record.competitionParticipants, 12);
  assert.equal(store.writeCalls, 2);
});

test('public and admin routes expose the intended methods and authentication boundary', () => {
  const publicRoutes = statisticsRoutes.stack.filter((layer) => layer.route);
  assert.equal(publicRoutes.length, 1);
  assert.equal(publicRoutes[0].route.path, '/');
  assert.equal(publicRoutes[0].route.methods.get, true);
  assert.equal(publicRoutes[0].route.stack.length, 1);

  const adminStatisticsRoutes = adminRoutes.stack
    .filter((layer) => layer.route?.path === '/statistics')
    .map((layer) => Object.keys(layer.route.methods)[0]);
  assert.deepEqual(adminStatisticsRoutes, ['get', 'patch']);
  assert.equal(adminRoutes.stack[0].handle, verifyToken);
  assert.equal(adminRoutes.stack[1].handle.name, requireRole(ROLES.ADMIN).name);
  assert.equal(adminRoutes.stack[1].handle.toString(), requireRole(ROLES.ADMIN).toString());
});

test('Swagger documents public/admin statistics, constraints, security, and errors', () => {
  const publicGet = swaggerSpec.paths['/api/statistics'].get;
  const adminPath = swaggerSpec.paths['/api/admin/statistics'];
  const patchSchema = swaggerSpec.components.schemas.HomepageStatisticsPatch;

  assert.ok(publicGet);
  assert.equal(publicGet.security, undefined);
  assert.ok(publicGet.responses['200']);
  assert.ok(publicGet.responses['500']);
  assert.deepEqual(adminPath.get.security, [{ BearerAuth: [] }]);
  assert.deepEqual(adminPath.patch.security, [{ BearerAuth: [] }]);
  for (const status of ['200', '401', '403', '409', '422', '500']) assert.ok(adminPath.patch.responses[status]);
  assert.equal(patchSchema.additionalProperties, false);
  assert.equal(patchSchema.properties.registeredStudents.minimum, 0);
  assert.equal(patchSchema.properties.registeredStudents.maximum, Number.MAX_SAFE_INTEGER);
  assert.equal(patchSchema.properties.showPlus.additionalProperties, false);
});

test('Postman generator includes the required public and admin statistics requests structurally', () => {
  const originalWrite = fs.writeFileSync;
  const originalLog = console.log;
  let capturedCollection;
  try {
    fs.writeFileSync = (filePath, content) => {
      if (filePath.endsWith('postman_collection.json')) {
        capturedCollection = JSON.parse(content);
      }
    };
    console.log = () => {};
    delete require.cache[require.resolve('../scripts/generate-postman.js')];
    require('../scripts/generate-postman.js');
  } finally {
    fs.writeFileSync = originalWrite;
    console.log = originalLog;
  }

  const collection = capturedCollection;
  const publicFolder = collection.item.find(({ name }) => name === '13. Homepage Statistics');
  const adminFolder = collection.item.find(({ name }) => name === '9. Admin — Core & Student Management');

  const getPublic = publicFolder?.item.find(({ name }) => name === 'Get Homepage Statistics');
  assert.ok(getPublic, 'Get Homepage Statistics missing');
  assert.equal(getPublic.request.method, 'GET');
  assert.equal(getPublic.request.url.raw, '{{BASE_URL}}/api/statistics');
  assert.equal(getPublic.request.auth || getPublic.auth, undefined);

  const getAdmin = adminFolder?.item.find(({ name }) => name === 'Admin Get Homepage Statistics');
  assert.ok(getAdmin, 'Admin Get Homepage Statistics missing');
  assert.equal(getAdmin.request.method, 'GET');
  assert.equal(getAdmin.request.url.raw, '{{BASE_URL}}/api/admin/statistics');
  assert.equal(getAdmin.request.auth?.type || getAdmin.auth?.type, 'bearer');
  assert.equal((getAdmin.request.auth?.bearer || getAdmin.auth?.bearer)[0].value, '{{admin_token}}');

  const patchAdmin = adminFolder?.item.find(({ name }) => name === 'Admin Update Homepage Statistics');
  assert.ok(patchAdmin, 'Admin Update Homepage Statistics missing');
  assert.equal(patchAdmin.request.method, 'PATCH');
  assert.equal(patchAdmin.request.url.raw, '{{BASE_URL}}/api/admin/statistics');
  assert.equal(patchAdmin.request.auth?.type || patchAdmin.auth?.type, 'bearer');
  assert.equal((patchAdmin.request.auth?.bearer || patchAdmin.auth?.bearer)[0].value, '{{admin_token}}');
  
  const body = JSON.parse(patchAdmin.request.body.raw);
  assert.equal(typeof body, 'object');
  assert.ok(Object.keys(body).some(k => ['registeredStudents', 'totalCoursesGiven', 'annualLearningCapacity', 'competitionParticipants', 'showPlus'].includes(k)));
});

test('homepage statistics implementation performs no transactional auto-calculation or mutation', () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '../src/controllers/statistics.controller.js'),
    'utf8'
  );
  assert.doesNotMatch(
    controllerSource,
    /require\(['"]\.\.\/models\/(?:StudentProfile|Course|Enrollment|Competition|CompetitionRegistration)['"]\)/
  );
  assert.doesNotMatch(controllerSource, /countDocuments\s*\(/);
  assert.doesNotMatch(controllerSource, /estimatedDocumentCount\s*\(/);
  assert.doesNotMatch(controllerSource, /aggregate\s*\(/);
  assert.doesNotMatch(controllerSource, /email\.service|auth\.controller|phone/i);
});

test('Confirmed singleton-key E11000 race is retried exactly once without upsert', async (t) => {
  const originals = { findOneAndUpdate: HomepageStatistics.findOneAndUpdate };
  t.after(() => { HomepageStatistics.findOneAndUpdate = originals.findOneAndUpdate; });
  let calls = [];
  HomepageStatistics.findOneAndUpdate = async (filter, update, options) => {
    calls.push({ filter, update, options });
    if (calls.length === 1) {
      const error = new Error('E11000 duplicate key error collection: index: key_1 dup key');
      error.code = 11000;
      throw error;
    }
    return defaultRecord({ registeredStudents: 5000 });
  };
  const result = await invoke(statisticsController.updateAdminStatistics, validAdminRequest({ registeredStudents: 5000 }));
  assert.equal(result.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].filter, { key: HOMEPAGE_STATISTICS_KEY });
  assert.equal(calls[1].options.upsert, undefined);
  assert.equal(result.body.data.registeredStudents, 5000);
});

test('Unrelated E11000 is not retried', async (t) => {
  const originals = { findOneAndUpdate: HomepageStatistics.findOneAndUpdate };
  t.after(() => { HomepageStatistics.findOneAndUpdate = originals.findOneAndUpdate; });
  let calls = 0;
  HomepageStatistics.findOneAndUpdate = async () => {
    calls++;
    const error = new Error('E11000 duplicate key error index: other_field_1 dup key');
    error.code = 11000;
    throw error;
  };
  const result = await invoke(statisticsController.updateAdminStatistics, validAdminRequest({ registeredStudents: 100 }));
  assert.equal(calls, 1);
  assert.equal(result.error.code, 11000);
});

test('Ordinary DB error is not retried', async (t) => {
  const originals = { findOneAndUpdate: HomepageStatistics.findOneAndUpdate };
  t.after(() => { HomepageStatistics.findOneAndUpdate = originals.findOneAndUpdate; });
  let calls = 0;
  HomepageStatistics.findOneAndUpdate = async () => {
    calls++;
    throw new Error('Database connection lost');
  };
  const result = await invoke(statisticsController.updateAdminStatistics, validAdminRequest({ registeredStudents: 100 }));
  assert.equal(calls, 1);
  assert.equal(result.error.message, 'Database connection lost');
});
