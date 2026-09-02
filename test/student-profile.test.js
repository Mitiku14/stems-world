require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const StudentProfile = require('../src/models/StudentProfile');
const studentProfileValidator = require('../src/validators/studentProfile.validator');
const studentProfileController = require('../src/controllers/studentProfile.controller');
const studentProfileRoutes = require('../src/routes/studentProfile.routes');
const { verifyToken } = require('../src/middleware/auth.middleware');
const swaggerSpec = require('../src/config/swagger');
const {
  normalizeNameComponent,
  serializeStudentProfile,
  buildPossibleDuplicate,
} = require('../src/utils/studentProfile');

const ownerId = new mongoose.Types.ObjectId();
const otherOwnerId = new mongoose.Types.ObjectId();

const profileFixture = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  parentUser: ownerId,
  slot: 1,
  givenName: 'Abel',
  fatherName: 'Bekele',
  grandfatherName: 'Tesfaye',
  grade: null,
  school: null,
  isActive: true,
  ...overrides,
});

const validate = async (chains, request = {}) => {
  const req = { body: {}, params: {}, query: {}, ...request };
  for (const chain of chains) await chain.run(req);
  return { errors: validationResult(req), request: req };
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

const sameId = (left, right) => String(left) === String(right);

const makeFindChain = (records) => {
  let selected = [...records];
  const chain = {
    select: () => chain,
    sort: (specification) => {
      if (specification?.slot === 1) selected.sort((a, b) => a.slot - b.slot);
      return chain;
    },
    lean: async () => selected.map((record) => ({ ...record })),
  };
  return chain;
};

const installInMemoryModel = (initialRecords = [], { yieldBeforeCreate = false } = {}) => {
  const originals = {
    find: StudentProfile.find,
    findOne: StudentProfile.findOne,
    create: StudentProfile.create,
  };
  const records = initialRecords.map((record) => ({ ...record }));
  let createCalls = 0;

  StudentProfile.find = ({ parentUser }) => makeFindChain(
    records.filter((record) => sameId(record.parentUser, parentUser))
  );
  StudentProfile.findOne = async ({ _id, parentUser }) => records.find((record) => (
    sameId(record._id, _id) && sameId(record.parentUser, parentUser)
  )) || null;
  StudentProfile.create = async (payload) => {
    createCalls += 1;
    if (yieldBeforeCreate) await new Promise((resolve) => setImmediate(resolve));
    if (records.some((record) => (
      sameId(record.parentUser, payload.parentUser) && record.slot === payload.slot
    ))) {
      const duplicate = new Error('E11000 duplicate parentUser/slot');
      duplicate.code = 11000;
      duplicate.keyPattern = { parentUser: 1, slot: 1 };
      duplicate.keyValue = { parentUser: payload.parentUser, slot: payload.slot };
      throw duplicate;
    }
    const record = {
      _id: new mongoose.Types.ObjectId(),
      grade: null,
      school: null,
      ...payload,
      async save() { return this; },
    };
    records.push(record);
    return record;
  };

  return {
    records,
    get createCalls() { return createCalls; },
    restore() {
      StudentProfile.find = originals.find;
      StudentProfile.findOne = originals.findOne;
      StudentProfile.create = originals.create;
    },
  };
};

test('StudentProfile schema defines ownership, five slots, allowed fields, and only parent-local indexes', () => {
  const paths = StudentProfile.schema.paths;
  assert.equal(paths.parentUser.options.ref, 'User');
  assert.equal(paths.parentUser.options.required[0], true);
  assert.equal(paths.parentUser.options.immutable, true);
  assert.equal(paths.slot.options.min[0], 1);
  assert.equal(paths.slot.options.max[0], 5);
  assert.equal(paths.isActive.defaultValue, true);
  assert.equal(paths.grade.defaultValue, null);
  assert.equal(paths.school.defaultValue, null);
  assert.ok(paths.createdAt);
  assert.ok(paths.updatedAt);

  for (const forbidden of [
    'password', 'email', 'phone', 'authProvider', 'jwt', 'isEmailVerified',
    'isPhoneVerified', 'dateOfBirth', 'dob', 'age', 'gender', 'nationalIdentifier',
  ]) {
    assert.equal(paths[forbidden], undefined);
  }

  const indexes = StudentProfile.schema.indexes();
  assert.equal(indexes.some(([keys, options]) => (
    keys.parentUser === 1 && keys.slot === 1 && options.unique === true
  )), true);
  assert.equal(indexes.some(([keys]) => keys.parentUser === 1 && keys.isActive === 1), true);
  assert.equal(indexes.some(([keys]) => (
    keys.givenName || keys.fatherName || keys.grandfatherName
  )), false);
});

test('model validation requires ownership, names, and slots 1–5 while normalizing compound Unicode names', async () => {
  const profile = new StudentProfile({
    parentUser: ownerId,
    slot: 1,
    givenName: '  Ｍary   Anne  ',
    fatherName: '  Abd   El-Rahman ',
    grandfatherName: " O'Connor  ",
  });
  await profile.validate();
  assert.equal(profile.givenName, 'Mary Anne');
  assert.equal(profile.fatherName, 'Abd El-Rahman');
  assert.equal(profile.grandfatherName, "O'Connor");
  assert.equal(profile.fullName, "Mary Anne Abd El-Rahman O'Connor");
  assert.equal(normalizeNameComponent('  Abel   Bekele  '), 'Abel Bekele');

  const requiredCases = [
    { parentUser: undefined },
    { givenName: undefined },
    { fatherName: undefined },
    { grandfatherName: undefined },
    { slot: 0 },
    { slot: 6 },
  ];
  for (const override of requiredCases) {
    const invalid = new StudentProfile({
      parentUser: ownerId,
      slot: 1,
      givenName: 'Mary Anne',
      fatherName: 'Abd El-Rahman',
      grandfatherName: "O'Connor",
      ...override,
    });
    await assert.rejects(invalid.validate());
  }

  const sameName = new StudentProfile({
    parentUser: ownerId,
    slot: 2,
    givenName: 'Mary Anne',
    fatherName: 'Abd El-Rahman',
    grandfatherName: "O'Connor",
  });
  await sameName.validate();
});

test('validators normalize names, allow punctuation, and reject controlled ownership and slot fields', async () => {
  const valid = await validate(studentProfileValidator.create, {
    body: {
      givenName: '  Mary   Anne ',
      fatherName: ' Abd El-Rahman ',
      grandfatherName: " O'Connor ",
      grade: ' Grade 7 ',
      school: ' School A ',
    },
  });
  assert.equal(valid.errors.isEmpty(), true);
  assert.deepEqual(valid.request.body, {
    givenName: 'Mary Anne',
    fatherName: 'Abd El-Rahman',
    grandfatherName: "O'Connor",
    grade: 'Grade 7',
    school: 'School A',
  });

  for (const body of [
    { fatherName: 'B', grandfatherName: 'C' },
    { givenName: 'A', grandfatherName: 'C' },
    { givenName: 'A', fatherName: 'B' },
    { givenName: '   ', fatherName: 'B', grandfatherName: 'C' },
    { givenName: 12, fatherName: 'B', grandfatherName: 'C' },
    { givenName: 'A', fatherName: 'B', grandfatherName: 'C', parentUser: ownerId },
    { givenName: 'A', fatherName: 'B', grandfatherName: 'C', slot: 4 },
    { givenName: 'A', fatherName: 'B', grandfatherName: 'C', _id: ownerId },
  ]) {
    assert.equal((await validate(studentProfileValidator.create, { body })).errors.isEmpty(), false);
  }

  const validUpdate = await validate(studentProfileValidator.update, {
    body: { givenName: '  Mary   Anne ', isActive: 'false', grade: null },
  });
  assert.equal(validUpdate.errors.isEmpty(), true);
  assert.equal(validUpdate.request.body.givenName, 'Mary Anne');
  assert.equal(validUpdate.request.body.isActive, false);

  for (const field of ['parentUser', 'slot', '_id']) {
    const result = await validate(studentProfileValidator.update, { body: { [field]: 'blocked' } });
    assert.equal(result.errors.isEmpty(), false);
  }
});

test('serialization builds full and display names with same-parent slot fallback only', () => {
  const first = profileFixture({ slot: 1, grade: null, school: null });
  const graded = profileFixture({ _id: new mongoose.Types.ObjectId(), slot: 2, grade: 'Grade 7' });
  const school = profileFixture({
    _id: new mongoose.Types.ObjectId(), slot: 3, grade: 'Grade 7', school: 'School A',
  });
  const collision = profileFixture({
    _id: new mongoose.Types.ObjectId(), slot: 4, grade: 'Grade 7', school: 'School A',
  });
  const otherParent = profileFixture({
    _id: new mongoose.Types.ObjectId(), parentUser: otherOwnerId, slot: 1,
    grade: 'Grade 7', school: 'School A',
  });

  assert.equal(serializeStudentProfile(first, [first]).displayLabel, 'Abel Bekele Tesfaye');
  assert.equal(serializeStudentProfile(graded, [graded]).displayLabel, 'Abel Bekele Tesfaye — Grade 7');
  assert.equal(
    serializeStudentProfile(school, [school, collision, otherParent]).displayLabel,
    'Abel Bekele Tesfaye — Grade 7 — School A — Profile 3'
  );
  assert.equal(
    serializeStudentProfile(collision, [school, collision, otherParent]).displayLabel,
    'Abel Bekele Tesfaye — Grade 7 — School A — Profile 4'
  );
  assert.equal(serializeStudentProfile(school, [school, otherParent]).displayLabel, 'Abel Bekele Tesfaye — Grade 7 — School A');
});

test('create binds authenticated ownership, ignores direct control fields, and assigns the lowest free slot', async () => {
  const memory = installInMemoryModel([
    profileFixture({ slot: 1 }),
    profileFixture({ _id: new mongoose.Types.ObjectId(), slot: 3 }),
  ]);
  try {
    const result = await invoke(studentProfileController.createStudentProfile, {
      user: { _id: ownerId },
      body: {
        givenName: '  New   Student ',
        fatherName: 'Parent',
        grandfatherName: 'Family',
        parentUser: otherOwnerId,
        slot: 5,
        isActive: false,
      },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.statusCode, 201);
    const created = memory.records.find(({ givenName }) => givenName.includes('New'));
    assert.equal(sameId(created.parentUser, ownerId), true);
    assert.equal(created.slot, 2);
    assert.equal(created.isActive, true);
    assert.equal(result.body.data.student.profileNumber, 2);
  } finally {
    memory.restore();
  }
});

test('list and detail queries use authenticated parent ownership and never reveal another parent profile', async () => {
  const ownProfiles = [
    profileFixture({ slot: 2 }),
    profileFixture({ _id: new mongoose.Types.ObjectId(), slot: 1, givenName: 'Biruk' }),
  ];
  const otherProfile = profileFixture({
    _id: new mongoose.Types.ObjectId(), parentUser: otherOwnerId, slot: 1,
  });
  const memory = installInMemoryModel([...ownProfiles, otherProfile]);
  const originalFindOne = StudentProfile.findOne;
  let capturedFilter;
  StudentProfile.findOne = async (filter) => {
    capturedFilter = filter;
    return originalFindOne(filter);
  };

  try {
    const listed = await invoke(studentProfileController.getStudentProfiles, {
      user: { _id: ownerId },
    });
    assert.equal(listed.error, undefined);
    assert.deepEqual(listed.body.data.students.map(({ slot }) => slot), [1, 2]);
    assert.equal(listed.body.data.students.some(({ _id }) => sameId(_id, otherProfile._id)), false);

    const ownDetail = await invoke(studentProfileController.getStudentProfile, {
      user: { _id: ownerId }, params: { id: ownProfiles[0]._id },
    });
    assert.equal(ownDetail.error, undefined);
    assert.deepEqual(capturedFilter, { _id: ownProfiles[0]._id, parentUser: ownerId });

    const hiddenOther = await invoke(studentProfileController.getStudentProfile, {
      user: { _id: ownerId }, params: { id: otherProfile._id },
    });
    assert.equal(hiddenOther.error.statusCode, 404);
    assert.deepEqual(capturedFilter, { _id: otherProfile._id, parentUser: ownerId });
  } finally {
    memory.restore();
  }
});

test('six concurrent creates reserve at most five slots and different parents have independent capacity', async () => {
  const memory = installInMemoryModel([], { yieldBeforeCreate: true });
  try {
    const requests = Array.from({ length: 6 }, (_, index) => invoke(
      studentProfileController.createStudentProfile,
      {
        user: { _id: ownerId },
        body: {
          givenName: `Student ${index + 1}`,
          fatherName: 'Concurrent',
          grandfatherName: 'Test',
        },
      }
    ));
    const results = await Promise.all(requests);
    assert.equal(results.filter(({ statusCode, error }) => statusCode === 201 && !error).length, 5);
    assert.equal(results.filter(({ error }) => error?.statusCode === 409).length, 1);
    const ownerRecords = memory.records.filter(({ parentUser }) => sameId(parentUser, ownerId));
    assert.deepEqual(ownerRecords.map(({ slot }) => slot).sort(), [1, 2, 3, 4, 5]);
    assert.ok(memory.createCalls <= 6 * studentProfileController.MAX_PROFILE_SLOTS);

    const otherParentResults = await Promise.all(Array.from({ length: 5 }, (_, index) => invoke(
      studentProfileController.createStudentProfile,
      {
        user: { _id: otherOwnerId },
        body: {
          givenName: `Independent ${index + 1}`,
          fatherName: 'Parent',
          grandfatherName: 'Slots',
        },
      }
    )));
    assert.equal(otherParentResults.every(({ error }) => error === undefined), true);
    assert.deepEqual(
      otherParentResults.map(({ body }) => body.data.student.slot).sort(),
      [1, 2, 3, 4, 5]
    );
  } finally {
    memory.restore();
  }
});

test('duplicate-key reservation retries choose the next slot and remain strictly bounded', async () => {
  const originals = { find: StudentProfile.find, create: StudentProfile.create };
  const records = [];
  let createCalls = 0;
  StudentProfile.find = ({ parentUser }) => makeFindChain(
    records.filter((record) => sameId(record.parentUser, parentUser))
  );
  StudentProfile.create = async (payload) => {
    createCalls += 1;
    if (createCalls === 1) {
      records.push(profileFixture({ parentUser: payload.parentUser, slot: 1, givenName: 'Racing' }));
      const duplicate = new Error('E11000');
      duplicate.code = 11000;
      duplicate.keyPattern = { parentUser: 1, slot: 1 };
      duplicate.keyValue = { parentUser: payload.parentUser, slot: payload.slot };
      throw duplicate;
    }
    return { _id: new mongoose.Types.ObjectId(), grade: null, school: null, ...payload };
  };

  try {
    const created = await studentProfileController.createWithReservedSlot(ownerId, {
      givenName: 'Retry', fatherName: 'Slot', grandfatherName: 'Test',
    });
    assert.equal(created.slot, 2);
    assert.equal(createCalls, 2);

    createCalls = 0;
    records.length = 0;
    StudentProfile.create = async (payload) => {
      createCalls += 1;
      const duplicate = new Error('E11000');
      duplicate.code = 11000;
      duplicate.keyPattern = { parentUser: 1, slot: 1 };
      duplicate.keyValue = { parentUser: payload.parentUser, slot: payload.slot };
      throw duplicate;
    };
    await assert.rejects(
      studentProfileController.createWithReservedSlot(ownerId, {
        givenName: 'Bounded', fatherName: 'Retry', grandfatherName: 'Test',
      }),
      (error) => error.statusCode === 409
    );
    assert.equal(createCalls, studentProfileController.MAX_PROFILE_SLOTS);
  } finally {
    StudentProfile.find = originals.find;
    StudentProfile.create = originals.create;
  }
});

test('slot duplicate classifier requires exact structured parentUser and slot evidence', () => {
  assert.equal(studentProfileController.isParentSlotDuplicate({
    code: 11000,
    keyPattern: { parentUser: 1, slot: 1 },
    keyValue: { parentUser: ownerId, slot: 2 },
  }), true);
  assert.equal(studentProfileController.isParentSlotDuplicate({
    code: 11000,
    keyValue: { parentUser: ownerId, slot: 2 },
  }), true);

  for (const error of [
    { code: 11000, keyPattern: { parentUser: 1 } },
    { code: 11000, keyPattern: { slot: 1 } },
    { code: 11000, keyPattern: { parentUser: 1, slot: 1, someFutureField: 1 } },
    { code: 11000, keyPattern: { someFutureField: 1 } },
    { code: 11000, keyPattern: { _id: 1 }, keyValue: { parentUser: ownerId, slot: 2 } },
    { code: 11000, keyValue: { _id: new mongoose.Types.ObjectId() } },
    { code: 11000, keyValue: { parentUser: ownerId, slot: 0 } },
    { code: 11000 },
    { code: 121, keyPattern: { parentUser: 1, slot: 1 } },
  ]) {
    assert.equal(studentProfileController.isParentSlotDuplicate(error), false);
  }
});

test('unrelated duplicate-key errors are propagated immediately without a slot retry', async () => {
  const originals = { find: StudentProfile.find, create: StudentProfile.create };
  const duplicate = new Error('E11000 duplicate _id');
  duplicate.code = 11000;
  duplicate.keyPattern = { _id: 1 };
  duplicate.keyValue = { _id: new mongoose.Types.ObjectId() };
  let findCalls = 0;
  let createCalls = 0;

  StudentProfile.find = () => {
    findCalls += 1;
    return makeFindChain([]);
  };
  StudentProfile.create = async () => {
    createCalls += 1;
    throw duplicate;
  };

  try {
    await assert.rejects(
      studentProfileController.createWithReservedSlot(ownerId, {
        givenName: 'Unrelated', fatherName: 'Duplicate', grandfatherName: 'Test',
      }),
      (error) => error === duplicate
    );
    assert.equal(findCalls, 1);
    assert.equal(createCalls, 1);
  } finally {
    StudentProfile.find = originals.find;
    StudentProfile.create = originals.create;
  }
});

test('ambiguous 11000 errors without structured index metadata are not retried', async () => {
  const originals = { find: StudentProfile.find, create: StudentProfile.create };
  const duplicate = new Error('E11000 without key metadata');
  duplicate.code = 11000;
  let findCalls = 0;
  let createCalls = 0;

  StudentProfile.find = () => {
    findCalls += 1;
    return makeFindChain([]);
  };
  StudentProfile.create = async () => {
    createCalls += 1;
    throw duplicate;
  };

  try {
    await assert.rejects(
      studentProfileController.createWithReservedSlot(ownerId, {
        givenName: 'Ambiguous', fatherName: 'Duplicate', grandfatherName: 'Test',
      }),
      (error) => error === duplicate
    );
    assert.equal(findCalls, 1);
    assert.equal(createCalls, 1);
  } finally {
    StudentProfile.find = originals.find;
    StudentProfile.create = originals.create;
  }
});

test('same normalized names are allowed and duplicate warnings include same-parent matches only', async () => {
  const candidate = profileFixture({
    _id: new mongoose.Types.ObjectId(), slot: 3,
    givenName: '  ＡＢＥＬ ', fatherName: 'BEKELE', grandfatherName: 'tesfaye',
  });
  const sameParentMatch = profileFixture({ slot: 1 });
  const otherParentMatch = profileFixture({
    _id: new mongoose.Types.ObjectId(), parentUser: otherOwnerId, slot: 1,
  });
  const warning = buildPossibleDuplicate(candidate, [candidate, sameParentMatch, otherParentMatch]);
  assert.equal(warning.matched, true);
  assert.equal(warning.profiles.length, 1);
  assert.equal(sameId(warning.profiles[0]._id, sameParentMatch._id), true);
});

test('update uses _id plus parent ownership, changes only allowed fields, normalizes names, and warns on duplicates', async () => {
  const target = profileFixture({
    async save() { this.updatedAt = new Date(); return this; },
  });
  const sibling = profileFixture({
    _id: new mongoose.Types.ObjectId(), slot: 2,
    givenName: 'Mary Anne', fatherName: 'Abd El-Rahman', grandfatherName: "O'Connor",
  });
  const other = profileFixture({
    _id: new mongoose.Types.ObjectId(), parentUser: otherOwnerId, slot: 1,
    givenName: 'Mary Anne', fatherName: 'Abd El-Rahman', grandfatherName: "O'Connor",
  });
  const memory = installInMemoryModel([target, sibling, other]);
  const storedTarget = memory.records.find(({ _id }) => sameId(_id, target._id));
  storedTarget.save = target.save;
  const originalParent = storedTarget.parentUser;
  const originalSlot = storedTarget.slot;
  const originalId = storedTarget._id;
  let capturedFilter;
  const originalFindOne = StudentProfile.findOne;
  StudentProfile.findOne = async (filter) => {
    capturedFilter = filter;
    return originalFindOne(filter);
  };

  try {
    const result = await invoke(studentProfileController.updateStudentProfile, {
      user: { _id: ownerId },
      params: { id: target._id },
      body: {
        givenName: '  Mary   Anne ',
        fatherName: ' Abd El-Rahman ',
        grandfatherName: " O'Connor ",
        grade: 'Grade 8',
        school: 'School A',
        isActive: false,
        parentUser: otherOwnerId,
        slot: 5,
        _id: new mongoose.Types.ObjectId(),
      },
    });
    assert.equal(result.error, undefined);
    assert.deepEqual(capturedFilter, { _id: target._id, parentUser: ownerId });
    assert.equal(storedTarget.givenName, 'Mary Anne');
    assert.equal(storedTarget.fatherName, 'Abd El-Rahman');
    assert.equal(storedTarget.grandfatherName, "O'Connor");
    assert.equal(storedTarget.isActive, false);
    assert.equal(sameId(storedTarget.parentUser, originalParent), true);
    assert.equal(storedTarget.slot, originalSlot);
    assert.equal(sameId(storedTarget._id, originalId), true);
    assert.equal(result.body.data.possibleDuplicate.matched, true);
    assert.equal(result.body.data.possibleDuplicate.profiles.length, 1);
    assert.equal(sameId(result.body.data.possibleDuplicate.profiles[0]._id, sibling._id), true);

    const hiddenOther = await invoke(studentProfileController.updateStudentProfile, {
      user: { _id: ownerId }, params: { id: other._id }, body: { school: 'Blocked' },
    });
    assert.equal(hiddenOther.error.statusCode, 404);
    assert.deepEqual(capturedFilter, { _id: other._id, parentUser: ownerId });
  } finally {
    memory.restore();
  }
});

test('all four routes require authentication and Swagger/Postman expose only the Phase B lifecycle', () => {
  const routes = studentProfileRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
      firstHandler: layer.route.stack[0].handle,
    }));
  assert.deepEqual(
    routes.map(({ path: routePath, methods }) => ({ path: routePath, method: methods[0] })),
    [
      { path: '/', method: 'post' },
      { path: '/', method: 'get' },
      { path: '/:id', method: 'get' },
      { path: '/:id', method: 'patch' },
    ]
  );
  assert.equal(routes.every(({ firstHandler }) => firstHandler === verifyToken), true);
  assert.equal(routes.some(({ methods }) => methods.includes('delete')), false);

  assert.ok(swaggerSpec.components.schemas.StudentProfile);
  assert.ok(swaggerSpec.components.schemas.StudentProfilePossibleDuplicate);
  assert.ok(swaggerSpec.paths['/api/students'].post);
  assert.ok(swaggerSpec.paths['/api/students'].get);
  assert.ok(swaggerSpec.paths['/api/students/{id}'].get);
  assert.ok(swaggerSpec.paths['/api/students/{id}'].patch);
  assert.equal(swaggerSpec.paths['/api/students/{id}'].delete, undefined);

  const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(serverSource, /app\.use\('\/api\/students',\s+studentProfileRoutes\)/);

  const collection = JSON.parse(fs.readFileSync(path.join(__dirname, '../postman_collection.json'), 'utf8'));
  const folder = collection.item.find(({ name }) => name === '12. Student Profiles');
  assert.ok(folder);
  assert.deepEqual(folder.item.map(({ name }) => name), [
    'Create Student', 'List My Students', 'Get Student', 'Update Student',
  ]);
});
