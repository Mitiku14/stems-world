require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Competition = require('../src/models/Competition');
const CompetitionRegistration = require('../src/models/CompetitionRegistration');
const Certificate = require('../src/models/Certificate');
const competitionValidator = require('../src/validators/competition.validator');
const compRegValidator = require('../src/validators/competitionRegistration.validator');
const compCtrl = require('../src/controllers/competition.controller');
const compRegCtrl = require('../src/controllers/competitionRegistration.controller');
const User = require('../src/models/User');
const emailService = require('../src/services/email.service');
const notificationService = require('../src/services/notification.service');
const adminRoutes = require('../src/routes/admin.routes');
const swaggerSpec = require('../src/config/swagger');
const { COMPETITION_SEEDS, ensureSeedCompetitions } = require('../seed/competition.seed');
const { buildMigrationPlan, captureSnapshot, migrate } = require('../scripts/migrate-competitions');
const { COMPETITION_CATEGORIES, COMPETITION_TYPES, COMPETITION_STATUSES, COMPETITION_PROGRESSION_STATUSES } = require('../src/constants');

const validDates = {
  registrationOpenDate: '2026-09-01T00:00:00.000Z',
  registrationCloseDate: '2026-09-10T00:00:00.000Z',
  eventStartDate: '2026-09-10T00:00:00.000Z',
  eventEndDate: '2026-09-11T00:00:00.000Z',
};

// Helper to run express-validator chains
const validate = async (chains, req) => {
  const mockReq = { body: {}, params: {}, query: {}, ...req };
  for (const chain of chains) {
    await chain.run(mockReq);
  }
  const { validationResult } = require('express-validator');
  return validationResult(mockReq);
};

const invokeHandler = async (handler, request = {}) => {
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
  const status = error instanceof mongoose.Error.ValidationError
    ? 422
    : error?.statusCode || response.statusCode;
  return { status, error, body };
};

const populateQuery = (value) => {
  const chain = {
    populate() { return chain; },
    then(resolve) { resolve(value); },
  };
  return chain;
};

test('Competition schema enforces category, type, status, and round contiguous ordering', () => {
  // Category check
  const compInvalidCat = new Competition({
    title: 'Test Comp 1',
    category: 'invalid_cat',
    type: 'individual',
    scope: 'local',
  });
  assert.equal(compInvalidCat.validateSync().errors['category'] !== undefined, true);

  // Type check
  const compInvalidType = new Competition({
    title: 'Test Comp 2',
    category: 'olympiad',
    type: 'hackathon',
    scope: 'local',
  });
  assert.equal(compInvalidType.validateSync().errors['type'] !== undefined, true);

  // Round order check (non-contiguous 1, 3)
  const compBadRounds = new Competition({
    title: 'Test Comp 3',
    category: 'olympiad',
    type: 'individual',
    scope: 'local',
    rounds: [
      { name: 'Round 1', order: 1 },
      { name: 'Round 3', order: 3 },
    ],
  });
  assert.equal(compBadRounds.validateSync().errors['rounds'] !== undefined, true);

  // Valid competition
  const validComp = new Competition({
    title: 'Valid Olympiad',
    category: 'olympiad',
    type: 'individual',
    scope: 'national',
    rounds: [
      { name: 'Qualifier', order: 1 },
      { name: 'Finals', order: 2 },
    ],
    ...validDates,
  });
  assert.equal(validComp.validateSync(), undefined);
});

test('Competition validator accepts valid category, type, and maxRegistrations', async () => {
  const req = {
    body: {
      title: 'Robotics Challenge 2026',
      category: 'steam_innovation',
      type: 'team',
      scope: 'international',
      maxRegistrations: 50,
      ...validDates,
      rounds: [
        { name: 'Stage 1', order: 1 },
        { name: 'Stage 2', order: 2 },
      ],
    },
  };
  const result = await validate(competitionValidator.createCompetitionRules, req);
  assert.equal(result.isEmpty(), true);
});

test('real Competition create path and model reject duplicate round IDs while accepting unique supplied IDs', async () => {
  const duplicateId = new mongoose.Types.ObjectId();
  const uniqueId = new mongoose.Types.ObjectId();
  const basePayload = {
    title: 'Round ID Validation Competition',
    category: 'olympiad',
    type: 'individual',
    scope: 'national',
    ...validDates,
  };
  const duplicateRounds = [
    { _id: String(duplicateId), name: 'Qualifier', order: 1 },
    { _id: String(duplicateId), name: 'Final', order: 2 },
  ];
  const uniqueRounds = [
    { _id: String(duplicateId), name: 'Qualifier', order: 1 },
    { _id: String(uniqueId), name: 'Final', order: 2 },
  ];

  const duplicateHttp = await validate(competitionValidator.createCompetitionRules, {
    body: { ...basePayload, rounds: duplicateRounds },
  });
  assert.equal(duplicateHttp.isEmpty(), false);
  assert.match(duplicateHttp.array().map(({ msg }) => msg).join(' '), /Round IDs must be unique/);

  const duplicateUpdateHttp = await validate(competitionValidator.updateCompetitionRules, {
    params: { id: 'validation-only' },
    body: { rounds: duplicateRounds },
  });
  assert.equal(duplicateUpdateHttp.isEmpty(), false);
  assert.match(duplicateUpdateHttp.array().map(({ msg }) => msg).join(' '), /Round IDs must be unique/);

  const invalidIdHttp = await validate(competitionValidator.createCompetitionRules, {
    body: {
      ...basePayload,
      rounds: [
        { _id: 'not-an-object-id', name: 'Qualifier', order: 1 },
        { name: 'Final', order: 2 },
      ],
    },
  });
  assert.equal(invalidIdHttp.isEmpty(), false);
  assert.match(invalidIdHttp.array().map(({ msg }) => msg).join(' '), /invalid _id/);

  for (const rounds of [
    [
      { name: 'Same Name', order: 1 },
      { name: ' same name ', order: 2 },
    ],
    [
      { name: 'Qualifier', order: 1 },
      { name: 'Final', order: 1 },
    ],
    [
      { name: 'Qualifier', order: 1 },
      { name: 'Final', order: 3 },
    ],
  ]) {
    const invalidRounds = await validate(competitionValidator.createCompetitionRules, {
      body: { ...basePayload, rounds },
    });
    assert.equal(invalidRounds.isEmpty(), false);
  }

  const uniqueHttp = await validate(competitionValidator.createCompetitionRules, {
    body: { ...basePayload, rounds: uniqueRounds },
  });
  assert.equal(uniqueHttp.isEmpty(), true);

  const duplicateModel = new Competition({ ...basePayload, rounds: duplicateRounds });
  const modelError = duplicateModel.validateSync();
  assert.match(modelError.errors.rounds.message, /Round IDs must be unique/);

  const originalCreate = Competition.create;
  Competition.create = async (data) => {
    const competition = new Competition(data);
    await competition.validate();
    return competition;
  };
  try {
    const duplicateController = await invokeHandler(compCtrl.createCompetition, {
      body: { ...basePayload, rounds: duplicateRounds },
      user: { _id: new mongoose.Types.ObjectId() },
    });
    assert.equal(duplicateController.status, 422);

    const uniqueController = await invokeHandler(compCtrl.createCompetition, {
      body: { ...basePayload, title: 'Unique Supplied Round IDs', rounds: uniqueRounds },
      user: { _id: new mongoose.Types.ObjectId() },
    });
    assert.equal(uniqueController.status, 201);
    assert.deepEqual(
      uniqueController.body.data.rounds.map(({ _id }) => String(_id)),
      uniqueRounds.map(({ _id }) => _id)
    );
  } finally {
    Competition.create = originalCreate;
  }
});

test('submitRegistration enforces individual vs team competition rules', async () => {
  const mockIndivComp = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Solo Math Olympiad',
    category: 'olympiad',
    type: 'individual',
    status: 'published',
    isActive: true,
  };

  let errorCaught = null;
  try {
    const payload = { teamName: 'The Solos', teamMembers: ['Alice'] };
    if (mockIndivComp.type === 'individual' && (payload.teamName || payload.teamMembers?.length)) {
      throw new Error('Individual competitions cannot include teamName or teamMembers.');
    }
  } catch (err) {
    errorCaught = err;
  }
  assert.equal(errorCaught.message, 'Individual competitions cannot include teamName or teamMembers.');
});

test('approveRegistration populates currentRound and initial roundProgress correctly', () => {
  const round1Id = new mongoose.Types.ObjectId();
  const round2Id = new mongoose.Types.ObjectId();

  const mockComp = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Innovation Lab',
    rounds: [
      { _id: round1Id, name: 'Round 1', order: 1 },
      { _id: round2Id, name: 'Round 2', order: 2 },
    ],
  };

  const reg = new CompetitionRegistration({
    competition: mockComp._id,
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    status: 'pending',
  });

  const sortedRounds = [...mockComp.rounds].sort((a, b) => a.order - b.order);
  reg.status = 'accepted';
  const firstRound = sortedRounds[0];
  reg.progressionStatus = 'in_progress';
  reg.currentRound = firstRound._id;
  reg.roundProgress = [{ round: firstRound._id, status: 'pending' }];

  assert.equal(reg.status, 'accepted');
  assert.equal(reg.progressionStatus, 'in_progress');
  assert.equal(reg.currentRound.toString(), round1Id.toString());
  assert.equal(reg.roundProgress.length, 1);
  assert.equal(reg.roundProgress[0].status, 'pending');
});

test('Round progression state transitions handle multi-round PASS and FAIL correctly', () => {
  const round1Id = new mongoose.Types.ObjectId();
  const round2Id = new mongoose.Types.ObjectId();
  const rounds = [
    { _id: round1Id, name: 'Round 1', order: 1 },
    { _id: round2Id, name: 'Round 2', order: 2 },
  ];

  const reg = new CompetitionRegistration({
    competition: new mongoose.Types.ObjectId(),
    fullName: 'Alice Walker',
    email: 'alice@example.com',
    status: 'accepted',
    progressionStatus: 'in_progress',
    currentRound: round1Id,
    roundProgress: [{ round: round1Id, status: 'pending' }],
  });

  // Pass Round 1 -> Advances to Round 2
  const r1Idx = rounds.findIndex((r) => r._id.toString() === round1Id.toString());
  const nextRound = rounds[r1Idx + 1];

  reg.roundProgress[0].status = 'passed';
  reg.currentRound = nextRound._id;
  reg.roundProgress.push({ round: nextRound._id, status: 'pending' });

  assert.equal(reg.progressionStatus, 'in_progress');
  assert.equal(reg.currentRound.toString(), round2Id.toString());
  assert.equal(reg.roundProgress.length, 2);

  // Pass Round 2 (Final Round) -> Completed
  reg.roundProgress[1].status = 'passed';
  reg.currentRound = null;
  reg.progressionStatus = 'completed';

  assert.equal(reg.progressionStatus, 'completed');
  assert.equal(reg.currentRound, null);

  // Fail Round 1 -> Eliminated
  const reg2 = new CompetitionRegistration({
    competition: new mongoose.Types.ObjectId(),
    fullName: 'Bob Ross',
    email: 'bob@example.com',
    status: 'accepted',
    progressionStatus: 'in_progress',
    currentRound: round1Id,
    roundProgress: [{ round: round1Id, status: 'pending' }],
  });

  reg2.roundProgress[0].status = 'failed';
  reg2.currentRound = null;
  reg2.progressionStatus = 'eliminated';

  assert.equal(reg2.progressionStatus, 'eliminated');
  assert.equal(reg2.currentRound, null);
});

test('Competition create requires registration dates and enforces strict chronology at HTTP and model layers', async () => {
  const base = {
    title: 'Date Contract Competition',
    category: 'steam_innovation',
    type: 'individual',
    scope: 'local',
  };

  assert.equal(await validationStatus(competitionValidator.createCompetitionRules, {
    body: { ...base, registrationCloseDate: validDates.registrationCloseDate },
  }), 422);
  assert.equal(await validationStatus(competitionValidator.createCompetitionRules, {
    body: { ...base, registrationOpenDate: validDates.registrationOpenDate },
  }), 422);
  assert.equal(await validationStatus(competitionValidator.createCompetitionRules, {
    body: {
      ...base,
      registrationOpenDate: validDates.registrationOpenDate,
      registrationCloseDate: validDates.registrationOpenDate,
    },
  }), 422);
  assert.equal(await validationStatus(competitionValidator.createCompetitionRules, {
    body: {
      ...base,
      registrationOpenDate: validDates.registrationCloseDate,
      registrationCloseDate: validDates.registrationOpenDate,
    },
  }), 422);
  assert.equal(await validationStatus(competitionValidator.createCompetitionRules, {
    body: { ...base, ...validDates },
  }), 200);

  await assert.rejects(new Competition(base).validate(), /Registration open date is required/);
  await assert.rejects(new Competition({
    ...base,
    registrationOpenDate: validDates.registrationOpenDate,
    registrationCloseDate: validDates.registrationOpenDate,
  }).validate(), /must be earlier/);
  await new Competition({ ...base, ...validDates }).validate();

  // Conditional model requiredness keeps pre-migration legacy documents
  // updateable without inventing dates.
  const legacy = Competition.hydrate({
    _id: new mongoose.Types.ObjectId(),
    ...base,
  });
  legacy.description = 'Unrelated legacy edit';
  await legacy.validate();
});

test('Competition partial date update validates the final stored chronology', async () => {
  const originalFindById = Competition.findById;
  Competition.findById = () => ({
    select: () => ({
      lean: async () => ({ ...validDates }),
    }),
  });

  try {
    const status = await validationStatus(competitionValidator.updateCompetitionRules, {
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { registrationCloseDate: '2026-08-20T00:00:00.000Z' },
    });
    assert.equal(status, 422);
  } finally {
    Competition.findById = originalFindById;
  }
});

test('Competition seeder is non-destructive, idempotent, and preserves existing IDs and admin records', async () => {
  const store = new Map([
    ['Regional Science Olympiad', {
      _id: 'admin-created-id',
      title: 'Regional Science Olympiad',
      category: 'olympiad',
      type: 'individual',
      status: 'published',
    }],
  ]);
  let nextId = 1;
  const FakeModel = {
    async init() {},
    async bulkWrite(operations) {
      let matchedCount = 0;
      let upsertedCount = 0;
      for (const { updateOne } of operations) {
        const title = updateOne.filter.title;
        if (store.has(title)) {
          matchedCount += 1;
        } else {
          store.set(title, { _id: `seed-${nextId++}`, ...updateOne.update.$setOnInsert });
          upsertedCount += 1;
        }
      }
      return { matchedCount, modifiedCount: 0, upsertedCount };
    },
  };

  const first = await ensureSeedCompetitions(FakeModel);
  const seedId = store.get(COMPETITION_SEEDS[0].title)._id;
  const second = await ensureSeedCompetitions(FakeModel);

  assert.equal(first.upsertedCount, COMPETITION_SEEDS.length);
  assert.equal(second.upsertedCount, 0);
  assert.equal(second.modifiedCount, 0);
  assert.equal(store.size, COMPETITION_SEEDS.length + 1);
  assert.equal(store.get('Regional Science Olympiad')._id, 'admin-created-id');
  assert.equal(store.get(COMPETITION_SEEDS[0].title)._id, seedId);

  for (const seed of COMPETITION_SEEDS) await new Competition(seed).validate();
  const source = fs.readFileSync(path.join(__dirname, '../seed/competition.seed.js'), 'utf8');
  assert.equal(source.includes('deleteMany'), false);
  assert.equal(/type:\s*'(competition|hackathon|workshop)'/.test(source), false);
  assert.equal(/status:\s*'(open|upcoming|closed)'/.test(source), false);
});

test('Competition migration plans safe in-place changes, reports ambiguity, and is idempotent', () => {
  const competitions = [
    {
      _id: 'competition-1',
      title: 'National Coding Hackathon',
      description: 'Teams solve coding problems.',
      type: 'hackathon',
      status: 'open',
      eligibility: 'Grades 9-12',
      requirements: ['Laptop'],
      maxParticipants: 20,
      registrationOpenDate: new Date('2026-01-01'),
      registrationCloseDate: new Date('2026-01-10'),
    },
    {
      _id: 'competition-2',
      title: 'Community Challenge',
      description: 'A community event.',
      type: 'competition',
      status: 'upcoming',
      requirements: [],
    },
    {
      _id: 'competition-3',
      title: 'National Mathematics Olympiad',
      description: 'An individual olympiad.',
      type: 'competition',
      status: 'completed',
      eligibility: 'Secondary students',
      requirements: ['Secondary students'],
      registrationOpenDate: new Date('2025-01-01'),
      registrationCloseDate: new Date('2025-01-10'),
    },
  ];
  const registrations = [
    { _id: 'registration-1', competition: 'competition-1', teamName: 'Coders', teamMembers: ['A'] },
    { _id: 'registration-2', competition: 'missing-competition' },
  ];

  const before = captureSnapshot(competitions, registrations);
  const plan = buildMigrationPlan(competitions, registrations);
  const byId = new Map(plan.competitionPlans.map((item) => [item.id, item]));

  assert.deepEqual(byId.get('competition-1').set, {
    category: 'steam_innovation',
    type: 'team',
    status: 'published',
    requirements: ['Laptop', 'Grades 9-12'],
    maxRegistrations: 20,
  });
  assert.equal(byId.get('competition-2').confidence, 'AMBIGUOUS');
  assert.equal(Object.hasOwn(byId.get('competition-2').set, 'category'), false);
  assert.equal(Object.hasOwn(byId.get('competition-2').set, 'type'), false);
  assert.equal(byId.get('competition-3').set.category, 'olympiad');
  assert.equal(byId.get('competition-3').set.type, 'individual');
  assert.equal(Object.hasOwn(byId.get('competition-3').set, 'status'), false);
  assert.deepEqual(plan.registrationUpdates.map(({ set }) => set), [
    { progressionStatus: 'not_started', currentRound: null, roundProgress: [] },
    { progressionStatus: 'not_started', currentRound: null, roundProgress: [] },
  ]);
  assert.equal(before.danglingRegistrationCount, 1);

  const migratedCompetitions = competitions.map((record) => {
    const update = plan.competitionUpdates.find(({ id }) => id === record._id);
    return { ...record, ...(update?.set || {}) };
  });
  const migratedRegistrations = registrations.map((record) => {
    const update = plan.registrationUpdates.find(({ id }) => id === record._id);
    return { ...record, ...(update?.set || {}) };
  });
  const after = captureSnapshot(migratedCompetitions, migratedRegistrations);
  const rerun = buildMigrationPlan(migratedCompetitions, migratedRegistrations);

  assert.deepEqual(after.competitionIds, before.competitionIds);
  assert.deepEqual(after.competitionRegistrationIds, before.competitionRegistrationIds);
  assert.equal(after.danglingRegistrationCount, before.danglingRegistrationCount);
  assert.equal(rerun.competitionUpdates.length, 0);
  assert.equal(rerun.registrationUpdates.length, 0);
  assert.equal(rerun.ambiguousRecords.length, 1);
});

test('Competition migration rejects production before opening a database connection', async () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalConnect = mongoose.connect;
  let connectCalled = false;
  process.env.NODE_ENV = 'production';
  mongoose.connect = async () => { connectCalled = true; };

  try {
    await assert.rejects(migrate({ dryRun: true }), /outside NODE_ENV=development/);
    assert.equal(connectCalled, false);
  } finally {
    process.env.NODE_ENV = originalEnvironment;
    mongoose.connect = originalConnect;
  }
});

test('Swagger and generated Postman require valid Competition registration dates and current enums', () => {
  const createOperation = swaggerSpec.paths['/api/competitions'].post;
  assert.equal(
    createOperation.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/CompetitionCreateInput'
  );
  assert.deepEqual(
    swaggerSpec.components.schemas.CompetitionCreateInput.allOf[1].required,
    ['title', 'category', 'type', 'scope', 'registrationOpenDate', 'registrationCloseDate']
  );
  assert.equal(Object.hasOwn(createOperation.responses, '422'), true);

  const collection = JSON.parse(fs.readFileSync(path.join(__dirname, '../postman_collection.json'), 'utf8'));
  const requests = [];
  const collect = (items = []) => items.forEach((item) => {
    if (item.request) requests.push(item);
    collect(item.item);
  });
  collect(collection.item);
  const createRequest = requests.find(({ name }) => name === 'Admin Create Competition');
  const payload = JSON.parse(createRequest.request.body.raw);
  assert.equal(payload.category, 'steam_innovation');
  assert.equal(payload.type, 'team');
  assert.equal(payload.status, 'published');
  assert.equal(payload.maxRegistrations, 100);
  assert.equal(Object.hasOwn(payload, 'eligibility'), false);
  assert.equal(new Date(payload.registrationOpenDate) < new Date(payload.registrationCloseDate), true);
  assert.equal(new Date(payload.registrationCloseDate) <= new Date(payload.eventStartDate), true);
});

test('Concurrent registrations for the final slot serialize and roll back failed reservations', async () => {
  const competitionId = new mongoose.Types.ObjectId();
  const state = { capacityVersion: 0, registrations: [] };
  const competition = {
    _id: competitionId,
    title: 'One Slot Competition',
    category: 'olympiad',
    type: 'individual',
    status: 'published',
    isActive: true,
    maxRegistrations: 1,
    registrationOpenDate: new Date('2020-01-01T00:00:00.000Z'),
    registrationCloseDate: new Date('2030-01-01T00:00:00.000Z'),
  };
  const originals = {
    transaction: mongoose.connection.transaction,
    competitionFindOne: Competition.findOne,
    competitionFindOneAndUpdate: Competition.findOneAndUpdate,
    registrationFindOne: CompetitionRegistration.findOne,
    registrationCount: CompetitionRegistration.countDocuments,
    registrationCreate: CompetitionRegistration.create,
    userExists: User.exists,
    email: emailService.sendCompetitionRegistrationSubmittedEmail,
    notification: notificationService.createNotification,
  };

  let transactionTail = Promise.resolve();
  mongoose.connection.transaction = async (callback) => {
    let release;
    const previous = transactionTail;
    transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    const snapshot = {
      capacityVersion: state.capacityVersion,
      registrations: state.registrations.map((item) => ({ ...item })),
    };
    try {
      return await callback({ isolated: true });
    } catch (error) {
      state.capacityVersion = snapshot.capacityVersion;
      state.registrations = snapshot.registrations;
      throw error;
    } finally {
      release();
    }
  };
  Competition.findOne = async () => competition;
  Competition.findOneAndUpdate = async () => {
    state.capacityVersion += 1;
    return { ...competition, capacityVersion: state.capacityVersion };
  };
  CompetitionRegistration.findOne = (filter) => ({
    session: async () => state.registrations.find((item) => (
      String(item.competition) === String(filter.competition)
        && (!filter.student || String(item.student) === String(filter.student))
        && (!filter.email || item.email === filter.email)
        && ['pending', 'accepted'].includes(item.status)
    )) || null,
  });
  CompetitionRegistration.countDocuments = () => ({
    session: async () => state.registrations.filter((item) => ['pending', 'accepted'].includes(item.status)).length,
  });
  CompetitionRegistration.create = async ([payload]) => {
    const created = { _id: new mongoose.Types.ObjectId(), ...payload };
    state.registrations.push(created);
    return [created];
  };
  User.exists = async () => false;
  emailService.sendCompetitionRegistrationSubmittedEmail = () => {};
  notificationService.createNotification = () => {};

  const invoke = async (user, email) => {
    let body;
    let error;
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { body = value; return this; },
    };
    await compRegCtrl.submitRegistration({
      params: { id: competitionId.toString() },
      body: { fullName: user.name, email },
      user,
    }, res, (nextError) => { error = nextError; });
    return { status: error?.statusCode || res.statusCode, error, body, user };
  };

  try {
    const users = [
      { _id: new mongoose.Types.ObjectId(), name: 'Student One', email: 'one@example.com' },
      { _id: new mongoose.Types.ObjectId(), name: 'Student Two', email: 'two@example.com' },
    ];
    const results = await Promise.all(users.map((user) => invoke(user, user.email)));
    assert.deepEqual(results.map(({ status }) => status).sort(), [201, 400]);
    assert.equal(state.registrations.length, 1);
    assert.equal(state.capacityVersion, 1);

    const winner = results.find(({ status }) => status === 201).user;
    const duplicate = await invoke(winner, winner.email);
    assert.equal(duplicate.status, 409);
    assert.equal(state.registrations.length, 1);
    assert.equal(state.capacityVersion, 1);

    state.registrations[0].status = 'rejected';
    const reapplied = await invoke(winner, winner.email);
    assert.equal(reapplied.status, 201);
    assert.equal(state.registrations.length, 2);
    assert.equal(state.registrations.filter(({ status }) => ['pending', 'accepted'].includes(status)).length, 1);
    assert.equal(state.capacityVersion, 2);
  } finally {
    mongoose.connection.transaction = originals.transaction;
    Competition.findOne = originals.competitionFindOne;
    Competition.findOneAndUpdate = originals.competitionFindOneAndUpdate;
    CompetitionRegistration.findOne = originals.registrationFindOne;
    CompetitionRegistration.countDocuments = originals.registrationCount;
    CompetitionRegistration.create = originals.registrationCreate;
    User.exists = originals.userExists;
    emailService.sendCompetitionRegistrationSubmittedEmail = originals.email;
    notificationService.createNotification = originals.notification;
  }
});

test('real approval controller enforces active published state and handles rounds and zero-round competitions', async () => {
  const originals = {
    transaction: mongoose.connection.transaction,
    findById: CompetitionRegistration.findById,
    registrationFindOneAndUpdate: CompetitionRegistration.findOneAndUpdate,
    competitionFindOneAndUpdate: Competition.findOneAndUpdate,
    approvedEmail: emailService.sendCompetitionRegistrationApprovedEmail,
    createNotification: notificationService.createNotification,
    notifyByEmail: notificationService.notifyUserByEmail,
  };
  let currentRegistration;
  mongoose.connection.transaction = async (callback) => callback({ isolated: true });
  CompetitionRegistration.findById = () => populateQuery(currentRegistration);
  Competition.findOneAndUpdate = async (filter) => {
    const competition = currentRegistration?.competition;
    if (!competition
      || String(competition._id) !== String(filter._id)
      || competition.status !== filter.status
      || competition.isActive !== filter.isActive) {
      return null;
    }
    return competition;
  };
  CompetitionRegistration.findOneAndUpdate = (filter, update) => {
    const matches = currentRegistration
      && String(currentRegistration._id) === String(filter._id)
      && String(currentRegistration.competition._id) === String(filter.competition)
      && currentRegistration.status === filter.status;
    if (!matches) return populateQuery(null);
    Object.assign(currentRegistration, update.$set);
    currentRegistration.updateCalls += 1;
    return populateQuery(currentRegistration);
  };
  emailService.sendCompetitionRegistrationApprovedEmail = () => {};
  notificationService.createNotification = () => {};
  notificationService.notifyUserByEmail = () => {};

  const makeRegistration = ({ status = 'published', isActive = true, rounds = [] } = {}) => {
    const registration = {
      _id: new mongoose.Types.ObjectId(),
      fullName: 'Approval Audit Student',
      email: 'approval@example.com',
      student: null,
      status: 'pending',
      progressionStatus: 'not_started',
      currentRound: null,
      roundProgress: [],
      competition: {
        _id: new mongoose.Types.ObjectId(),
        title: 'Approval Audit Competition',
        status,
        isActive,
        rounds,
      },
      updateCalls: 0,
    };
    return registration;
  };
  const approve = async (registration) => {
    currentRegistration = registration;
    return invokeHandler(compRegCtrl.approveRegistration, {
      params: { id: String(registration._id) },
      user: { _id: new mongoose.Types.ObjectId() },
    });
  };

  try {
    const firstRoundId = new mongoose.Types.ObjectId();
    const withRounds = makeRegistration({
      rounds: [{ _id: firstRoundId, name: 'Qualifier', order: 1 }],
    });
    const approvedWithRounds = await approve(withRounds);
    assert.equal(approvedWithRounds.status, 200);
    assert.equal(withRounds.status, 'accepted');
    assert.equal(withRounds.progressionStatus, 'in_progress');
    assert.equal(String(withRounds.currentRound), String(firstRoundId));
    assert.deepEqual(withRounds.roundProgress.map(({ round, status }) => ({ round: String(round), status })), [
      { round: String(firstRoundId), status: 'pending' },
    ]);

    const zeroRounds = makeRegistration();
    const approvedWithoutRounds = await approve(zeroRounds);
    assert.equal(approvedWithoutRounds.status, 200);
    assert.equal(zeroRounds.status, 'accepted');
    assert.equal(zeroRounds.progressionStatus, 'not_started');
    assert.equal(zeroRounds.currentRound, null);
    assert.deepEqual(zeroRounds.roundProgress, []);

    for (const state of [
      { status: 'draft', isActive: true },
      { status: 'completed', isActive: true },
      { status: 'cancelled', isActive: true },
      { status: 'published', isActive: false },
    ]) {
      const blocked = makeRegistration(state);
      const result = await approve(blocked);
      assert.equal(result.status, 409);
      assert.match(result.error.message, /active published competition/);
      assert.equal(blocked.status, 'pending');
      assert.equal(blocked.progressionStatus, 'not_started');
      assert.equal(blocked.currentRound, null);
      assert.deepEqual(blocked.roundProgress, []);
      assert.equal(blocked.updateCalls, 0);
    }
  } finally {
    mongoose.connection.transaction = originals.transaction;
    CompetitionRegistration.findById = originals.findById;
    CompetitionRegistration.findOneAndUpdate = originals.registrationFindOneAndUpdate;
    Competition.findOneAndUpdate = originals.competitionFindOneAndUpdate;
    emailService.sendCompetitionRegistrationApprovedEmail = originals.approvedEmail;
    notificationService.createNotification = originals.createNotification;
    notificationService.notifyUserByEmail = originals.notifyByEmail;
  }
});

test('real PASS and FAIL controllers enforce sequence, terminal transitions, and atomic decision conflicts', async () => {
  const originals = {
    findById: CompetitionRegistration.findById,
    findOneAndUpdate: CompetitionRegistration.findOneAndUpdate,
  };
  let harness;

  const activate = ({ currentIndex = 0 } = {}) => {
    const roundIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const rounds = roundIds.map((id, index) => ({ _id: id, name: `Round ${index + 1}`, order: index + 1 }));
    const state = {
      _id: new mongoose.Types.ObjectId(),
      status: 'accepted',
      progressionStatus: 'in_progress',
      currentRound: roundIds[currentIndex],
      roundProgress: roundIds.slice(0, currentIndex + 1).map((round, index) => ({
        round,
        status: index === currentIndex ? 'pending' : 'passed',
        reviewedBy: index === currentIndex ? null : new mongoose.Types.ObjectId(),
        reviewedAt: index === currentIndex ? null : new Date(),
      })),
      competition: {
        _id: new mongoose.Types.ObjectId(),
        status: 'published',
        isActive: true,
        rounds,
      },
    };
    const clone = () => ({
      ...state,
      roundProgress: state.roundProgress.map((progress) => ({ ...progress })),
      competition: { ...state.competition, rounds: state.competition.rounds.map((round) => ({ ...round })) },
    });
    harness = { state, rounds, roundIds, clone };
    return harness;
  };

  CompetitionRegistration.findById = () => populateQuery(harness.clone());
  CompetitionRegistration.findOneAndUpdate = async (filter, update) => {
    const state = harness.state;
    const currentProgress = state.roundProgress.find(({ round }) => String(round) === String(filter.currentRound));
    const matches = String(state._id) === String(filter._id)
      && String(state.currentRound) === String(filter.currentRound)
      && state.progressionStatus === filter.progressionStatus
      && currentProgress
      && currentProgress.status === filter['roundProgress.status'];
    if (!matches) return null;

    for (const [path, value] of Object.entries(update.$set || {})) {
      if (path.startsWith('roundProgress.$.')) {
        currentProgress[path.replace('roundProgress.$.', '')] = value;
      } else {
        state[path] = value;
      }
    }
    if (update.$push?.roundProgress) state.roundProgress.push({ ...update.$push.roundProgress });
    return harness.clone();
  };

  const act = (handler, roundId) => invokeHandler(handler, {
    params: { id: String(harness.state._id) },
    body: { roundId: String(roundId) },
    user: { _id: new mongoose.Types.ObjectId() },
  });

  try {
    activate();
    const intermediate = await act(compRegCtrl.passRound, harness.roundIds[0]);
    assert.equal(intermediate.status, 200);
    assert.equal(harness.state.progressionStatus, 'in_progress');
    assert.equal(String(harness.state.currentRound), String(harness.roundIds[1]));
    assert.deepEqual(harness.state.roundProgress.map(({ status }) => status), ['passed', 'pending']);

    activate({ currentIndex: 1 });
    const finalPass = await act(compRegCtrl.passRound, harness.roundIds[1]);
    assert.equal(finalPass.status, 200);
    assert.equal(harness.state.progressionStatus, 'completed');
    assert.equal(harness.state.currentRound, null);
    assert.deepEqual(harness.state.roundProgress.map(({ status }) => status), ['passed', 'passed']);

    activate();
    const failed = await act(compRegCtrl.failRound, harness.roundIds[0]);
    assert.equal(failed.status, 200);
    assert.equal(harness.state.progressionStatus, 'eliminated');
    assert.equal(harness.state.currentRound, null);
    assert.equal(harness.state.roundProgress[0].status, 'failed');

    activate();
    const skipped = await act(compRegCtrl.passRound, harness.roundIds[1]);
    assert.equal(skipped.status, 409);
    assert.deepEqual(harness.state.roundProgress.map(({ status }) => status), ['pending']);

    activate();
    const stale = await act(compRegCtrl.passRound, new mongoose.Types.ObjectId());
    assert.equal(stale.status, 409);
    assert.deepEqual(harness.state.roundProgress.map(({ status }) => status), ['pending']);

    activate();
    const doublePass = await Promise.all([
      act(compRegCtrl.passRound, harness.roundIds[0]),
      act(compRegCtrl.passRound, harness.roundIds[0]),
    ]);
    assert.deepEqual(doublePass.map(({ status }) => status).sort(), [200, 409]);
    assert.deepEqual(harness.state.roundProgress.map(({ status }) => status), ['passed', 'pending']);

    activate();
    const passVsFail = await Promise.all([
      act(compRegCtrl.passRound, harness.roundIds[0]),
      act(compRegCtrl.failRound, harness.roundIds[0]),
    ]);
    assert.deepEqual(passVsFail.map(({ status }) => status).sort(), [200, 409]);
    assert.equal(['in_progress', 'eliminated'].includes(harness.state.progressionStatus), true);
  } finally {
    CompetitionRegistration.findById = originals.findById;
    CompetitionRegistration.findOneAndUpdate = originals.findOneAndUpdate;
  }
});

test('real Competition update controller preserves referenced round identity and blocks structural changes', async () => {
  const originals = {
    transaction: mongoose.connection.transaction,
    findOneAndUpdate: Competition.findOneAndUpdate,
    registrationExists: CompetitionRegistration.exists,
  };
  let currentCompetition;
  let hasProgress;
  mongoose.connection.transaction = async (callback) => callback({ isolated: true });
  Competition.findOneAndUpdate = async () => currentCompetition;
  CompetitionRegistration.exists = () => ({
    session: async () => (hasProgress ? { _id: new mongoose.Types.ObjectId() } : null),
  });

  const makeCompetition = () => {
    const rounds = [
      { _id: new mongoose.Types.ObjectId(), name: 'Qualifier', order: 1 },
      { _id: new mongoose.Types.ObjectId(), name: 'Final', order: 2 },
    ];
    const competition = Competition.hydrate({
      _id: new mongoose.Types.ObjectId(),
      title: 'Round Identity Controller Test',
      category: 'olympiad',
      type: 'individual',
      scope: 'national',
      ...validDates,
      rounds,
      status: 'published',
      isActive: true,
    });
    competition.saveCalls = 0;
    competition.save = async function saveWithoutDatabase() {
      this.saveCalls += 1;
      await this.validate();
      return this;
    };
    return competition;
  };
  const updateRounds = async (competition, rounds, progress = true) => {
    currentCompetition = competition;
    hasProgress = progress;
    return invokeHandler(compCtrl.updateCompetition, {
      params: { id: String(competition._id) },
      body: { rounds },
    });
  };
  const plainRounds = (competition, includeIds = true) => competition.rounds.map((round) => ({
    ...(includeIds && { _id: String(round._id) }),
    name: round.name,
    order: round.order,
  }));

  try {
    const duplicateBeforeProgress = makeCompetition();
    const duplicateBeforePayload = plainRounds(duplicateBeforeProgress);
    duplicateBeforePayload[1]._id = duplicateBeforePayload[0]._id;
    const duplicateBeforeResult = await updateRounds(duplicateBeforeProgress, duplicateBeforePayload, false);
    assert.equal(duplicateBeforeResult.status, 422);
    assert.match(duplicateBeforeResult.error.errors.rounds.message, /Round IDs must be unique/);

    const duplicateAfterProgress = makeCompetition();
    const duplicateAfterPayload = plainRounds(duplicateAfterProgress);
    duplicateAfterPayload[1]._id = duplicateAfterPayload[0]._id;
    const duplicateAfterResult = await updateRounds(duplicateAfterProgress, duplicateAfterPayload, true);
    assert.equal(duplicateAfterResult.status, 409);
    assert.equal(duplicateAfterProgress.saveCalls, 0);

    const uniqueSupplied = makeCompetition();
    const replacementIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const uniqueSuppliedResult = await updateRounds(uniqueSupplied, [
      { _id: String(replacementIds[0]), name: 'Replacement Qualifier', order: 1 },
      { _id: String(replacementIds[1]), name: 'Replacement Final', order: 2 },
    ], false);
    assert.equal(uniqueSuppliedResult.status, 200);
    assert.deepEqual(uniqueSupplied.rounds.map(({ _id }) => String(_id)), replacementIds.map(String));

    for (const includeIds of [true, false]) {
      const competition = makeCompetition();
      const referencedIds = competition.rounds.map(({ _id }) => String(_id));
      const result = await updateRounds(competition, plainRounds(competition, includeIds));
      assert.equal(result.status, 200);
      assert.deepEqual(competition.rounds.map(({ _id }) => String(_id)), referencedIds);
      assert.equal(referencedIds.every((id) => competition.rounds.some(({ _id }) => String(_id) === id)), true);
    }

    const renamed = makeCompetition();
    const renamedIds = renamed.rounds.map(({ _id }) => String(_id));
    const renamedPayload = plainRounds(renamed);
    renamedPayload[0].name = 'Renamed Qualifier';
    const renamedResult = await updateRounds(renamed, renamedPayload);
    assert.equal(renamedResult.status, 200);
    assert.equal(renamed.rounds[0].name, 'Renamed Qualifier');
    assert.deepEqual(renamed.rounds.map(({ _id }) => String(_id)), renamedIds);

    const unsafeCases = [
      (competition) => {
        const rounds = plainRounds(competition);
        rounds[0]._id = String(new mongoose.Types.ObjectId());
        return rounds;
      },
      (competition) => plainRounds(competition).slice(0, 1),
      (competition) => plainRounds(competition).reverse(),
    ];
    for (const buildPayload of unsafeCases) {
      const competition = makeCompetition();
      const beforeIds = competition.rounds.map(({ _id }) => String(_id));
      const result = await updateRounds(competition, buildPayload(competition));
      assert.equal(result.status, 409);
      assert.deepEqual(competition.rounds.map(({ _id }) => String(_id)), beforeIds);
      assert.equal(competition.saveCalls, 0);
    }

    const noProgress = makeCompetition();
    const originalIds = noProgress.rounds.map(({ _id }) => String(_id));
    const structuralEdit = [
      { name: 'New Round 1', order: 1 },
      { name: 'New Round 2', order: 2 },
      { name: 'New Round 3', order: 3 },
    ];
    const noProgressResult = await updateRounds(noProgress, structuralEdit, false);
    assert.equal(noProgressResult.status, 200);
    assert.equal(noProgress.rounds.length, 3);
    assert.equal(noProgress.rounds.some(({ _id }) => originalIds.includes(String(_id))), false);
  } finally {
    mongoose.connection.transaction = originals.transaction;
    Competition.findOneAndUpdate = originals.findOneAndUpdate;
    CompetitionRegistration.exists = originals.registrationExists;
  }
});

test('real controllers serialize structural round update against approval and prevent dangling round references', async () => {
  const originals = {
    transaction: mongoose.connection.transaction,
    competitionFindOneAndUpdate: Competition.findOneAndUpdate,
    registrationFindById: CompetitionRegistration.findById,
    registrationFindOneAndUpdate: CompetitionRegistration.findOneAndUpdate,
    registrationExists: CompetitionRegistration.exists,
    approvedEmail: emailService.sendCompetitionRegistrationApprovedEmail,
    createNotification: notificationService.createNotification,
    notifyByEmail: notificationService.notifyUserByEmail,
  };
  const oldRoundIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const state = {
    competition: Competition.hydrate({
      _id: new mongoose.Types.ObjectId(),
      title: 'Round Update Approval Race',
      category: 'olympiad',
      type: 'individual',
      scope: 'national',
      ...validDates,
      rounds: [
        { _id: oldRoundIds[0], name: 'Old Qualifier', order: 1 },
        { _id: oldRoundIds[1], name: 'Old Final', order: 2 },
      ],
      status: 'published',
      isActive: true,
      capacityVersion: 0,
    }),
  };
  state.competition.save = async function saveWithoutDatabase() {
    await this.validate();
    return this;
  };
  state.registration = {
    _id: new mongoose.Types.ObjectId(),
    competition: state.competition,
    fullName: 'Round Race Student',
    email: 'round-race@example.com',
    student: null,
    status: 'pending',
    progressionStatus: 'not_started',
    currentRound: null,
    roundProgress: [],
  };

  let transactionTail = Promise.resolve();
  let transactionRequests = 0;
  let signalSecondTransaction;
  const secondTransactionRequested = new Promise((resolve) => { signalSecondTransaction = resolve; });
  mongoose.connection.transaction = async (callback) => {
    transactionRequests += 1;
    if (transactionRequests === 2) signalSecondTransaction();
    let release;
    const previous = transactionTail;
    transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await callback({ isolated: true });
    } finally {
      release();
    }
  };

  Competition.findOneAndUpdate = async (filter) => {
    const competition = state.competition;
    if (String(filter._id) !== String(competition._id)) return null;
    if (filter.status && filter.status !== competition.status) return null;
    if (filter.isActive !== undefined && filter.isActive !== competition.isActive) return null;
    competition.capacityVersion = (competition.capacityVersion || 0) + 1;
    return competition;
  };
  CompetitionRegistration.findById = () => populateQuery(state.registration);
  CompetitionRegistration.exists = (filter) => ({
    session: async () => {
      if (filter.progressionStatus) {
        return state.registration.progressionStatus === filter.progressionStatus ? { _id: state.registration._id } : null;
      }
      return state.registration.currentRound || state.registration.roundProgress.length
        ? { _id: state.registration._id }
        : null;
    },
  });

  let signalApprovalMutation;
  let releaseApprovalMutation;
  const approvalMutationReached = new Promise((resolve) => { signalApprovalMutation = resolve; });
  const approvalMutationRelease = new Promise((resolve) => { releaseApprovalMutation = resolve; });
  CompetitionRegistration.findOneAndUpdate = (filter, update) => ({
    populate: async () => {
      signalApprovalMutation();
      await approvalMutationRelease;
      const matches = String(filter._id) === String(state.registration._id)
        && String(filter.competition) === String(state.competition._id)
        && state.registration.status === filter.status;
      if (!matches) return null;
      Object.assign(state.registration, update.$set);
      return state.registration;
    },
  });
  emailService.sendCompetitionRegistrationApprovedEmail = () => {};
  notificationService.createNotification = () => {};
  notificationService.notifyUserByEmail = () => {};

  try {
    const approvalPromise = invokeHandler(compRegCtrl.approveRegistration, {
      params: { id: String(state.registration._id) },
      user: { _id: new mongoose.Types.ObjectId() },
    });
    await approvalMutationReached;

    const replacementIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const updatePromise = invokeHandler(compCtrl.updateCompetition, {
      params: { id: String(state.competition._id) },
      body: {
        rounds: [
          { _id: String(replacementIds[0]), name: 'New Qualifier', order: 1 },
          { _id: String(replacementIds[1]), name: 'New Final', order: 2 },
        ],
      },
    });
    await secondTransactionRequested;
    releaseApprovalMutation();

    const [approvalResult, updateResult] = await Promise.all([approvalPromise, updatePromise]);
    assert.equal(approvalResult.status, 200);
    assert.equal(updateResult.status, 409);
    assert.equal(state.registration.progressionStatus, 'in_progress');
    assert.equal(
      state.competition.rounds.some(({ _id }) => String(_id) === String(state.registration.currentRound)),
      true
    );
  } finally {
    mongoose.connection.transaction = originals.transaction;
    Competition.findOneAndUpdate = originals.competitionFindOneAndUpdate;
    CompetitionRegistration.findById = originals.registrationFindById;
    CompetitionRegistration.findOneAndUpdate = originals.registrationFindOneAndUpdate;
    CompetitionRegistration.exists = originals.registrationExists;
    emailService.sendCompetitionRegistrationApprovedEmail = originals.approvedEmail;
    notificationService.createNotification = originals.createNotification;
    notificationService.notifyUserByEmail = originals.notifyByEmail;
  }
});

test('real approval controller uses new round IDs when a concurrent structural update wins first', async () => {
  const originals = {
    transaction: mongoose.connection.transaction,
    competitionFindOneAndUpdate: Competition.findOneAndUpdate,
    registrationFindById: CompetitionRegistration.findById,
    registrationFindOneAndUpdate: CompetitionRegistration.findOneAndUpdate,
    registrationExists: CompetitionRegistration.exists,
    approvedEmail: emailService.sendCompetitionRegistrationApprovedEmail,
    createNotification: notificationService.createNotification,
    notifyByEmail: notificationService.notifyUserByEmail,
  };
  const oldRoundId = new mongoose.Types.ObjectId();
  const newRoundIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const state = {
    competition: Competition.hydrate({
      _id: new mongoose.Types.ObjectId(),
      title: 'Round Update Wins Approval Race',
      category: 'olympiad',
      type: 'individual',
      scope: 'national',
      ...validDates,
      rounds: [{ _id: oldRoundId, name: 'Old Round', order: 1 }],
      status: 'published',
      isActive: true,
      capacityVersion: 0,
    }),
  };
  state.competition.save = async function saveWithoutDatabase() {
    await this.validate();
    return this;
  };
  state.registration = {
    _id: new mongoose.Types.ObjectId(),
    competition: state.competition,
    fullName: 'Update Wins Student',
    email: 'update-wins@example.com',
    student: null,
    status: 'pending',
    progressionStatus: 'not_started',
    currentRound: null,
    roundProgress: [],
  };

  let transactionTail = Promise.resolve();
  let transactionRequests = 0;
  let signalSecondTransaction;
  const secondTransactionRequested = new Promise((resolve) => { signalSecondTransaction = resolve; });
  mongoose.connection.transaction = async (callback) => {
    transactionRequests += 1;
    if (transactionRequests === 2) signalSecondTransaction();
    let release;
    const previous = transactionTail;
    transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await callback({ isolated: true });
    } finally {
      release();
    }
  };

  Competition.findOneAndUpdate = async (filter) => {
    const competition = state.competition;
    if (String(filter._id) !== String(competition._id)) return null;
    if (filter.status && filter.status !== competition.status) return null;
    if (filter.isActive !== undefined && filter.isActive !== competition.isActive) return null;
    competition.capacityVersion = (competition.capacityVersion || 0) + 1;
    return competition;
  };
  CompetitionRegistration.findById = () => populateQuery(state.registration);

  let signalUpdateCheck;
  let releaseUpdateCheck;
  const updateCheckReached = new Promise((resolve) => { signalUpdateCheck = resolve; });
  const updateCheckRelease = new Promise((resolve) => { releaseUpdateCheck = resolve; });
  CompetitionRegistration.exists = () => ({
    session: async () => {
      signalUpdateCheck();
      await updateCheckRelease;
      return null;
    },
  });
  CompetitionRegistration.findOneAndUpdate = (filter, update) => ({
    populate: async () => {
      const matches = String(filter._id) === String(state.registration._id)
        && String(filter.competition) === String(state.competition._id)
        && state.registration.status === filter.status;
      if (!matches) return null;
      Object.assign(state.registration, update.$set);
      return state.registration;
    },
  });
  emailService.sendCompetitionRegistrationApprovedEmail = () => {};
  notificationService.createNotification = () => {};
  notificationService.notifyUserByEmail = () => {};

  try {
    const updatePromise = invokeHandler(compCtrl.updateCompetition, {
      params: { id: String(state.competition._id) },
      body: {
        rounds: [
          { _id: String(newRoundIds[0]), name: 'New Qualifier', order: 1 },
          { _id: String(newRoundIds[1]), name: 'New Final', order: 2 },
        ],
      },
    });
    await updateCheckReached;

    const approvalPromise = invokeHandler(compRegCtrl.approveRegistration, {
      params: { id: String(state.registration._id) },
      user: { _id: new mongoose.Types.ObjectId() },
    });
    await secondTransactionRequested;
    releaseUpdateCheck();

    const [updateResult, approvalResult] = await Promise.all([updatePromise, approvalPromise]);
    assert.deepEqual([updateResult.status, approvalResult.status], [200, 200]);
    assert.equal(String(state.registration.currentRound), String(newRoundIds[0]));
    assert.equal(String(state.registration.currentRound) === String(oldRoundId), false);
    assert.equal(
      state.competition.rounds.some(({ _id }) => String(_id) === String(state.registration.currentRound)),
      true
    );
  } finally {
    mongoose.connection.transaction = originals.transaction;
    Competition.findOneAndUpdate = originals.competitionFindOneAndUpdate;
    CompetitionRegistration.findById = originals.registrationFindById;
    CompetitionRegistration.findOneAndUpdate = originals.registrationFindOneAndUpdate;
    CompetitionRegistration.exists = originals.registrationExists;
    emailService.sendCompetitionRegistrationApprovedEmail = originals.approvedEmail;
    notificationService.createNotification = originals.createNotification;
    notificationService.notifyUserByEmail = originals.notifyByEmail;
  }
});

test('real controllers serialize completion against approval in both winner orders', async () => {
  const originals = {
    transaction: mongoose.connection.transaction,
    competitionFindOneAndUpdate: Competition.findOneAndUpdate,
    registrationFindById: CompetitionRegistration.findById,
    registrationFindOneAndUpdate: CompetitionRegistration.findOneAndUpdate,
    registrationExists: CompetitionRegistration.exists,
    approvedEmail: emailService.sendCompetitionRegistrationApprovedEmail,
    createNotification: notificationService.createNotification,
    notifyByEmail: notificationService.notifyUserByEmail,
  };
  emailService.sendCompetitionRegistrationApprovedEmail = () => {};
  notificationService.createNotification = () => {};
  notificationService.notifyUserByEmail = () => {};

  const runRace = async (winner) => {
    const firstRoundId = new mongoose.Types.ObjectId();
    const state = {
      competition: Competition.hydrate({
        _id: new mongoose.Types.ObjectId(),
        title: `Completion Approval Race ${winner}`,
        category: 'olympiad',
        type: 'individual',
        scope: 'national',
        ...validDates,
        rounds: [{ _id: firstRoundId, name: 'Qualifier', order: 1 }],
        status: 'published',
        isActive: true,
        capacityVersion: 0,
      }),
    };
    state.competition.save = async function saveWithoutDatabase() {
      await this.validate();
      return this;
    };
    state.registration = {
      _id: new mongoose.Types.ObjectId(),
      competition: state.competition,
      fullName: 'Completion Race Student',
      email: 'completion-race@example.com',
      student: null,
      status: 'pending',
      progressionStatus: 'not_started',
      currentRound: null,
      roundProgress: [],
    };

    let transactionTail = Promise.resolve();
    let transactionRequests = 0;
    let signalSecondTransaction;
    const secondTransactionRequested = new Promise((resolve) => { signalSecondTransaction = resolve; });
    mongoose.connection.transaction = async (callback) => {
      transactionRequests += 1;
      if (transactionRequests === 2) signalSecondTransaction();
      let release;
      const previous = transactionTail;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback({ isolated: true });
      } finally {
        release();
      }
    };

    Competition.findOneAndUpdate = async (filter) => {
      const competition = state.competition;
      if (String(filter._id) !== String(competition._id)) return null;
      if (filter.status && filter.status !== competition.status) return null;
      if (filter.isActive !== undefined && filter.isActive !== competition.isActive) return null;
      competition.capacityVersion = (competition.capacityVersion || 0) + 1;
      return competition;
    };
    CompetitionRegistration.findById = () => populateQuery(state.registration);

    let signalWinnerPause;
    let releaseWinnerPause;
    const winnerPaused = new Promise((resolve) => { signalWinnerPause = resolve; });
    const winnerRelease = new Promise((resolve) => { releaseWinnerPause = resolve; });
    CompetitionRegistration.exists = (filter) => ({
      session: async () => {
        if (winner === 'completion' && filter.progressionStatus === 'in_progress') {
          signalWinnerPause();
          await winnerRelease;
        }
        return state.registration.progressionStatus === filter.progressionStatus
          ? { _id: state.registration._id }
          : null;
      },
    });
    CompetitionRegistration.findOneAndUpdate = (filter, update) => ({
      populate: async () => {
        if (winner === 'approval') {
          signalWinnerPause();
          await winnerRelease;
        }
        const matches = String(filter._id) === String(state.registration._id)
          && String(filter.competition) === String(state.competition._id)
          && state.registration.status === filter.status;
        if (!matches) return null;
        Object.assign(state.registration, update.$set);
        return state.registration;
      },
    });

    const approve = () => invokeHandler(compRegCtrl.approveRegistration, {
      params: { id: String(state.registration._id) },
      user: { _id: new mongoose.Types.ObjectId() },
    });
    const complete = () => invokeHandler(compCtrl.updateCompetition, {
      params: { id: String(state.competition._id) },
      body: { status: 'completed' },
    });

    const firstPromise = winner === 'approval' ? approve() : complete();
    await winnerPaused;
    const secondPromise = winner === 'approval' ? complete() : approve();
    await secondTransactionRequested;
    releaseWinnerPause();

    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);
    assert.deepEqual([firstResult.status, secondResult.status], [200, 409]);
    assert.equal(
      state.competition.status === 'completed' && state.registration.progressionStatus === 'in_progress',
      false
    );
  };

  try {
    await runRace('approval');
    await runRace('completion');
  } finally {
    mongoose.connection.transaction = originals.transaction;
    Competition.findOneAndUpdate = originals.competitionFindOneAndUpdate;
    CompetitionRegistration.findById = originals.registrationFindById;
    CompetitionRegistration.findOneAndUpdate = originals.registrationFindOneAndUpdate;
    CompetitionRegistration.exists = originals.registrationExists;
    emailService.sendCompetitionRegistrationApprovedEmail = originals.approvedEmail;
    notificationService.createNotification = originals.createNotification;
    notificationService.notifyUserByEmail = originals.notifyByEmail;
  }
});

test('real Competition delete controller blocks registrations and certificates without mutating dependencies', async () => {
  const originals = {
    findById: Competition.findById,
    registrationExists: CompetitionRegistration.exists,
    certificateExists: Certificate.exists,
  };
  let hasRegistration;
  let hasCertificate;
  let competition;
  Competition.findById = async () => competition;
  CompetitionRegistration.exists = async () => (hasRegistration ? { _id: 'registration-reference' } : null);
  Certificate.exists = async () => (hasCertificate ? { _id: 'certificate-reference' } : null);

  const remove = async (registrationReference, certificateReference) => {
    hasRegistration = registrationReference;
    hasCertificate = certificateReference;
    competition = {
      _id: new mongoose.Types.ObjectId(),
      deleteCalls: 0,
      async deleteOne() { this.deleteCalls += 1; },
    };
    const result = await invokeHandler(compCtrl.deleteCompetition, {
      params: { id: String(competition._id) },
    });
    return { result, competition };
  };

  try {
    const noDependencies = await remove(false, false);
    assert.equal(noDependencies.result.status, 200);
    assert.equal(noDependencies.competition.deleteCalls, 1);

    for (const dependencies of [[true, false], [false, true], [true, true]]) {
      const blocked = await remove(...dependencies);
      assert.equal(blocked.result.status, 409);
      assert.match(blocked.result.error.message, /registrations or certificates/);
      assert.equal(blocked.competition.deleteCalls, 0);
      assert.deepEqual({ hasRegistration, hasCertificate }, {
        hasRegistration: dependencies[0],
        hasCertificate: dependencies[1],
      });
    }
  } finally {
    Competition.findById = originals.findById;
    CompetitionRegistration.exists = originals.registrationExists;
    Certificate.exists = originals.certificateExists;
  }
});

test('real admin Competition list controller returns public and non-public lifecycle records', async () => {
  const originals = {
    find: Competition.find,
    countDocuments: Competition.countDocuments,
  };
  const records = [
    { _id: 'draft-id', title: 'Draft Competition', status: 'draft', isActive: false },
    { _id: 'cancelled-id', title: 'Cancelled Competition', status: 'cancelled', isActive: true },
  ];
  Competition.find = () => {
    const chain = {
      sort: () => chain,
      skip: () => chain,
      limit: () => chain,
      lean: async () => records,
    };
    return chain;
  };
  Competition.countDocuments = async () => records.length;

  try {
    const result = await invokeHandler(compCtrl.getAllCompetitions, {
      query: { page: '1', limit: '10' },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data.competitions, records);
    assert.deepEqual(result.body.data.pagination, { total: 2, page: 1, limit: 10, totalPages: 1 });
  } finally {
    Competition.find = originals.find;
    Competition.countDocuments = originals.countDocuments;
  }
});

test('admin Competition list route and completed Competition Swagger contracts are exposed', () => {
  const routes = adminRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  assert.equal(routes.some(({ path: routePath, methods }) => routePath === '/competitions' && methods.includes('get')), true);

  assert.ok(swaggerSpec.components.schemas.RoundDefinition);
  assert.ok(swaggerSpec.components.schemas.RoundProgress);
  assert.equal(
    swaggerSpec.components.schemas.Competition.properties.rounds.items.$ref,
    '#/components/schemas/RoundDefinition'
  );
  assert.equal(
    swaggerSpec.components.schemas.CompetitionRegistration.properties.roundProgress.items.$ref,
    '#/components/schemas/RoundProgress'
  );
  const registrationOperation = swaggerSpec.paths['/api/competitions/{id}/register'].post;
  assert.equal(Object.hasOwn(registrationOperation, 'security'), false);
  assert.deepEqual(swaggerSpec.components.schemas.Competition.properties.isActive, {
    type: 'boolean',
    example: true,
  });
  assert.equal(Object.hasOwn(swaggerSpec.components.schemas.Competition.properties, 'capacityVersion'), false);
  assert.ok(swaggerSpec.paths['/api/admin/competitions'].get);
  assert.ok(swaggerSpec.paths['/api/competitions/registrations/my'].get.responses['200'].content);

  for (const action of ['pass', 'fail']) {
    const operation = swaggerSpec.paths[`/api/admin/competition-registrations/{id}/round/${action}`].patch;
    assert.deepEqual(Object.keys(operation.responses).sort(), ['200', '400', '401', '403', '404', '409', '422']);
  }

  const collection = JSON.parse(fs.readFileSync(path.join(__dirname, '../postman_collection.json'), 'utf8'));
  const requests = [];
  const collect = (items = []) => items.forEach((item) => {
    if (item.request) requests.push(item);
    collect(item.item);
  });
  collect(collection.item);
  const adminList = requests.find(({ name }) => name === 'Admin List All Competitions');
  assert.equal(adminList.request.method, 'GET');
  assert.equal(adminList.request.url.raw, '{{BASE_URL}}/api/admin/competitions?page=1&limit=10');
});

async function validationStatus(chains, req) {
  return (await validate(chains, req)).isEmpty() ? 200 : 422;
}
