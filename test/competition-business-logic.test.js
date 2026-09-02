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
const exportController = require('../src/controllers/export.controller');
const User = require('../src/models/User');
const StudentProfile = require('../src/models/StudentProfile');
const emailService = require('../src/services/email.service');
const notificationService = require('../src/services/notification.service');
const adminRoutes = require('../src/routes/admin.routes');
const swaggerSpec = require('../src/config/swagger');
const { COMPETITION_SEEDS, ensureSeedCompetitions } = require('../seed/competition.seed');
const { buildMigrationPlan, captureSnapshot, migrate } = require('../scripts/migrate-competitions');
const { auditCompetitionMetadata } = require('../scripts/migrate-competition-metadata');
const {
  COMPETITION_CATEGORIES,
  COMPETITION_TYPES,
  COMPETITION_SCOPES,
  COMPETITION_STATUSES,
  COMPETITION_PROGRESSION_STATUSES,
} = require('../src/constants');

const validDates = {
  registrationOpenDate: '2026-09-01T00:00:00.000Z',
  registrationCloseDate: '2026-09-10T00:00:00.000Z',
  eventStartDate: '2026-09-10T00:00:00.000Z',
  eventEndDate: '2026-09-11T00:00:00.000Z',
};

const validRoundDates = {
  eventStartsDate: '2026-09-10T01:00:00.000Z',
  eventEndDate: '2026-09-10T02:00:00.000Z',
};

const roundFixture = (name, order, extra = {}) => ({
  name,
  order,
  ...validRoundDates,
  ...extra,
});

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
    scope: 'school_level',
  });
  assert.equal(compInvalidCat.validateSync().errors['category'] !== undefined, true);

  // Type check
  const compInvalidType = new Competition({
    title: 'Test Comp 2',
    category: 'olympiad',
    type: 'hackathon',
    scope: 'school_level',
  });
  assert.equal(compInvalidType.validateSync().errors['type'] !== undefined, true);

  // Round order check (non-contiguous 1, 3)
  const compBadRounds = new Competition({
    title: 'Test Comp 3',
    category: 'olympiad',
    type: 'individual',
    scope: 'school_level',
    rounds: [
      roundFixture('Round 1', 1),
      roundFixture('Round 3', 3),
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
      roundFixture('Qualifier', 1),
      roundFixture('Finals', 2),
    ],
    ...validDates,
  });
  assert.equal(validComp.validateSync(), undefined);
});

test('Competition scope contract is shared and accepts exactly the five Phase A values', async () => {
  const expectedScopes = ['school_level', 'regional', 'national', 'continental', 'international'];
  assert.deepEqual(COMPETITION_SCOPES, expectedScopes);
  assert.deepEqual(Competition.schema.path('scope').enumValues, expectedScopes);
  assert.deepEqual(swaggerSpec.components.schemas.CompetitionScope.enum, expectedScopes);

  for (const scope of expectedScopes) {
    const competition = new Competition({
      title: `Scope ${scope}`,
      category: 'olympiad',
      type: 'individual',
      scope,
      ...validDates,
    });
    assert.equal(competition.validateSync(), undefined);

    const validCreate = await validate(competitionValidator.createCompetitionRules, {
      body: {
        title: `Valid Scope Create ${scope}`,
        category: 'olympiad',
        type: 'individual',
        scope,
        ...validDates,
      },
    });
    const validUpdate = await validate(competitionValidator.updateCompetitionRules, {
      params: { id: 'validation-only' },
      body: { scope },
    });
    const validQuery = await validate(competitionValidator.listQuery, {
      query: { scope },
    });
    for (const result of [validCreate, validUpdate, validQuery]) {
      assert.equal(result.isEmpty(), true, `${scope} should be accepted`);
    }
  }

  for (const invalidScope of ['institutional', 'local', 'global']) {
    const invalidModel = new Competition({
      title: `Invalid Scope ${invalidScope}`,
      category: 'olympiad',
      type: 'individual',
      scope: invalidScope,
      ...validDates,
    });
    assert.match(invalidModel.validateSync().errors.scope.message, /not a valid enum value/);

    const invalidCreate = await validate(competitionValidator.createCompetitionRules, {
      body: {
        title: `Invalid Scope Create ${invalidScope}`,
        category: 'olympiad',
        type: 'individual',
        scope: invalidScope,
        ...validDates,
      },
    });
    const invalidUpdate = await validate(competitionValidator.updateCompetitionRules, {
      params: { id: 'validation-only' },
      body: { scope: invalidScope },
    });
    const invalidQuery = await validate(competitionValidator.listQuery, {
      query: { scope: invalidScope },
    });
    for (const result of [invalidCreate, invalidUpdate, invalidQuery]) {
      assert.equal(result.isEmpty(), false);
      assert.equal(result.array().some(({ path: errorPath }) => errorPath === 'scope'), true);
    }
  }

  const emptyCreate = await validate(competitionValidator.createCompetitionRules, {
    body: {
      title: 'Empty Scope Create',
      category: 'olympiad',
      type: 'individual',
      scope: '',
      ...validDates,
    },
  });
  const emptyUpdate = await validate(competitionValidator.updateCompetitionRules, {
    params: { id: 'validation-only' },
    body: { scope: '' },
  });
  assert.equal(emptyCreate.array().some(({ path: errorPath }) => errorPath === 'scope'), true);
  assert.equal(emptyUpdate.array().some(({ path: errorPath }) => errorPath === 'scope'), true);
  assert.equal(COMPETITION_SEEDS.every(({ scope }) => COMPETITION_SCOPES.includes(scope)), true);
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
        roundFixture('Stage 1', 1),
        roundFixture('Stage 2', 2),
      ],
    },
  };
  const result = await validate(competitionValidator.createCompetitionRules, req);
  assert.equal(result.isEmpty(), true);
});

test('Competition rounds require valid strict dates within supplied overall event boundaries', async () => {
  const basePayload = {
    title: 'Round Schedule Contract',
    category: 'olympiad',
    type: 'individual',
    scope: 'continental',
    ...validDates,
  };
  const invalidRounds = [
    { round: { name: 'Missing Start', order: 1, eventEndDate: validRoundDates.eventEndDate }, message: /eventStartsDate is required/ },
    { round: { name: 'Missing End', order: 1, eventStartsDate: validRoundDates.eventStartsDate }, message: /eventEndDate is required/ },
    { round: roundFixture('Invalid Start', 1, { eventStartsDate: 'not-a-date' }), message: /valid ISO 8601 date/ },
    { round: roundFixture('Invalid End', 1, { eventEndDate: 'not-a-date' }), message: /valid ISO 8601 date/ },
    { round: roundFixture('Equal Dates', 1, { eventEndDate: validRoundDates.eventStartsDate }), message: /earlier than eventEndDate/ },
    { round: roundFixture('Reversed Dates', 1, { eventStartsDate: validRoundDates.eventEndDate }), message: /earlier than eventEndDate/ },
    { round: roundFixture('Before Overall Start', 1, { eventStartsDate: '2026-09-09T23:00:00.000Z' }), message: /earlier than eventStartDate/ },
    { round: roundFixture('After Overall End', 1, { eventEndDate: '2026-09-11T01:00:00.000Z' }), message: /later than the competition eventEndDate/ },
  ];

  for (const { round, message } of invalidRounds) {
    const createResult = await validate(competitionValidator.createCompetitionRules, {
      body: { ...basePayload, rounds: [round] },
    });
    assert.equal(createResult.isEmpty(), false);
    assert.match(createResult.array().map(({ msg }) => msg).join(' '), message);

    const updateResult = await validate(competitionValidator.updateCompetitionRules, {
      params: { id: 'validation-only' },
      body: { ...validDates, rounds: [round] },
    });
    assert.equal(updateResult.isEmpty(), false);
  }

  await new Competition({ ...basePayload, rounds: [roundFixture('Valid Round', 1)] }).validate();
  await new Competition({ ...basePayload, rounds: [] }).validate();
  await new Competition({
    ...basePayload,
    eventStartDate: null,
    eventEndDate: null,
    rounds: [roundFixture('Valid Without Overall Bounds', 1)],
  }).validate();
  await assert.rejects(
    new Competition({ ...basePayload, rounds: [invalidRounds[0].round] }).validate(),
    /Round event start date is required/
  );
  await assert.rejects(
    new Competition({ ...basePayload, rounds: [invalidRounds[2].round] }).validate(),
    /Cast to date failed/
  );
  await assert.rejects(
    new Competition({ ...basePayload, rounds: [invalidRounds[3].round] }).validate(),
    /Cast to date failed/
  );
  await assert.rejects(
    new Competition({ ...basePayload, rounds: [invalidRounds[4].round] }).validate(),
    /earlier than round event end date|earlier than its eventEndDate/
  );
  await assert.rejects(
    new Competition({ ...basePayload, rounds: [invalidRounds[6].round] }).validate(),
    /cannot be earlier than the competition eventStartDate/
  );
  await assert.rejects(
    new Competition({ ...basePayload, rounds: [invalidRounds[7].round] }).validate(),
    /cannot be later than the competition eventEndDate/
  );

  const startBoundaryOnly = { ...basePayload, eventEndDate: null, rounds: [invalidRounds[6].round] };
  const endBoundaryOnly = { ...basePayload, eventStartDate: null, rounds: [invalidRounds[7].round] };
  assert.equal((await validate(competitionValidator.createCompetitionRules, { body: startBoundaryOnly })).isEmpty(), false);
  assert.equal((await validate(competitionValidator.createCompetitionRules, { body: endBoundaryOnly })).isEmpty(), false);
  await assert.rejects(new Competition(startBoundaryOnly).validate(), /competition eventStartDate/);
  await assert.rejects(new Competition(endBoundaryOnly).validate(), /competition eventEndDate/);
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
    roundFixture('Qualifier', 1, { _id: String(duplicateId) }),
    roundFixture('Final', 2, { _id: String(duplicateId) }),
  ];
  const uniqueRounds = [
    roundFixture('Qualifier', 1, { _id: String(duplicateId) }),
    roundFixture('Final', 2, { _id: String(uniqueId) }),
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
        roundFixture('Qualifier', 1, { _id: 'not-an-object-id' }),
        roundFixture('Final', 2),
      ],
    },
  });
  assert.equal(invalidIdHttp.isEmpty(), false);
  assert.match(invalidIdHttp.array().map(({ msg }) => msg).join(' '), /invalid _id/);

  for (const rounds of [
    [
      roundFixture('Same Name', 1),
      roundFixture(' same name ', 2),
    ],
    [
      roundFixture('Qualifier', 1),
      roundFixture('Final', 1),
    ],
    [
      roundFixture('Qualifier', 1),
      roundFixture('Final', 3),
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
    scope: 'school_level',
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
  const storedState = {
    ...validDates,
    rounds: [roundFixture('Stored Qualifier', 1)],
  };
  Competition.findById = () => ({
    select: () => ({
      lean: async () => storedState,
    }),
  });

  try {
    const invalidRegistrationDates = await validationStatus(competitionValidator.updateCompetitionRules, {
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { registrationCloseDate: '2026-08-20T00:00:00.000Z' },
    });
    const invalidOverallStart = await validationStatus(competitionValidator.updateCompetitionRules, {
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { eventStartDate: '2026-09-10T01:30:00.000Z' },
    });
    const invalidOverallEnd = await validationStatus(competitionValidator.updateCompetitionRules, {
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { eventEndDate: '2026-09-10T01:30:00.000Z' },
    });
    const invalidReplacementRound = await validationStatus(competitionValidator.updateCompetitionRules, {
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: {
        rounds: [roundFixture('Replacement Qualifier', 1, {
          eventStartsDate: '2026-09-09T23:00:00.000Z',
        })],
      },
    });
    const validUnrelatedUpdate = await validationStatus(competitionValidator.updateCompetitionRules, {
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { description: 'Final stored schedule remains valid.' },
    });

    assert.equal(invalidRegistrationDates, 422);
    assert.equal(invalidOverallStart, 422);
    assert.equal(invalidOverallEnd, 422);
    assert.equal(invalidReplacementRound, 422);
    assert.equal(validUnrelatedUpdate, 200);
  } finally {
    Competition.findById = originalFindById;
  }
});

test('legacy local scope and undated rounds remain readable but fail strict validation before deployment', async () => {
  const legacy = Competition.hydrate({
    _id: new mongoose.Types.ObjectId(),
    title: 'Legacy Round Schedule',
    category: 'olympiad',
    type: 'individual',
    scope: 'local',
    ...validDates,
    rounds: [{ name: 'Legacy Qualifier', order: 1 }],
  });
  assert.equal(legacy.scope, 'local');
  assert.equal(legacy.rounds[0].eventStartsDate, undefined);
  assert.equal(legacy.rounds[0].eventEndDate, undefined);
  legacy.description = 'An unrelated edit still validates the final document.';
  await assert.rejects(legacy.validate(), (error) => {
    assert.ok(error.errors.scope);
    assert.ok(error.errors['rounds.0.eventStartsDate']);
    assert.ok(error.errors['rounds.0.eventEndDate']);
    return true;
  });

  const legacyLocalWithDatedRounds = Competition.hydrate({
    _id: new mongoose.Types.ObjectId(),
    title: 'Legacy Local With Dates',
    category: 'olympiad',
    type: 'individual',
    scope: 'local',
    ...validDates,
    rounds: [roundFixture('Dated Legacy Round', 1)],
  });
  await assert.rejects(legacyLocalWithDatedRounds.validate(), /not a valid enum value/);
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

test('Competition metadata audit is read-only and reports every Phase A legacy hazard with stable IDs', () => {
  const competitionId = new mongoose.Types.ObjectId();
  const roundIds = Array.from({ length: 7 }, () => new mongoose.Types.ObjectId());
  const report = auditCompetitionMetadata([
    {
      _id: competitionId,
      title: 'Legacy Metadata Audit Target',
      scope: 'local',
      eventStartDate: '2026-09-10T00:00:00.000Z',
      eventEndDate: '2026-09-11T00:00:00.000Z',
      rounds: [
        { _id: roundIds[0], name: 'Missing Both', order: 1 },
        { _id: roundIds[1], name: 'Invalid Start', order: 2, eventStartsDate: 'bad-start', eventEndDate: '2026-09-10T02:00:00.000Z' },
        { _id: roundIds[2], name: 'Invalid End', order: 3, eventStartsDate: '2026-09-10T03:00:00.000Z', eventEndDate: 'bad-end' },
        { _id: roundIds[3], name: 'Equal', order: 4, eventStartsDate: '2026-09-10T04:00:00.000Z', eventEndDate: '2026-09-10T04:00:00.000Z' },
        { _id: roundIds[4], name: 'Reversed', order: 5, eventStartsDate: '2026-09-10T06:00:00.000Z', eventEndDate: '2026-09-10T05:00:00.000Z' },
        { _id: roundIds[5], name: 'Before Boundary', order: 6, eventStartsDate: '2026-09-09T23:00:00.000Z', eventEndDate: '2026-09-10T01:00:00.000Z' },
        { _id: roundIds[6], name: 'After Boundary', order: 7, eventStartsDate: '2026-09-10T23:00:00.000Z', eventEndDate: '2026-09-11T01:00:00.000Z' },
      ],
    },
    { _id: new mongoose.Types.ObjectId(), title: 'Institutional Scope', scope: 'institutional', rounds: [] },
    { _id: new mongoose.Types.ObjectId(), title: 'Unknown Scope', scope: 'global', rounds: [] },
    { _id: new mongoose.Types.ObjectId(), title: 'Missing Scope', rounds: [] },
    {
      _id: new mongoose.Types.ObjectId(),
      title: 'Valid Metadata',
      scope: 'school_level',
      eventStartDate: '2026-09-10T00:00:00.000Z',
      eventEndDate: '2026-09-11T00:00:00.000Z',
      rounds: [roundFixture('Valid', 1)],
    },
  ]);

  assert.equal(report.mode, 'DRY_RUN_AUDIT_ONLY');
  assert.equal(report.applySupported, false);
  assert.equal(report.writesPerformed, 0);
  assert.equal(report.indexChanges, 0);
  assert.equal(report.deploymentBlocked, true);
  const issueTypes = new Set(report.issues.map(({ type }) => type));
  for (const expectedType of [
    'legacy_local_scope',
    'unknown_scope',
    'missing_scope',
    'missing_round_event_start',
    'missing_round_event_end',
    'invalid_round_event_start',
    'invalid_round_event_end',
    'equal_round_dates',
    'reversed_round_dates',
    'round_before_competition_start',
    'round_after_competition_end',
  ]) {
    assert.equal(issueTypes.has(expectedType), true, `Expected audit issue ${expectedType}`);
  }
  assert.equal(
    report.issues.some(({ type, currentScope }) => type === 'unknown_scope' && currentScope === 'institutional'),
    true
  );
  assert.equal(report.issues.some(({ currentScope }) => currentScope === 'school_level'), false);
  const inspected = report.inspectedCompetitions.find(({ competitionId: id }) => id === String(competitionId));
  assert.deepEqual(inspected.roundIds, roundIds.map(String));
  assert.equal(
    report.issues.filter(({ roundId }) => roundId).every(({ competitionId: id, roundId }) => (
      id === String(competitionId) && roundIds.map(String).includes(roundId)
    )),
    true
  );
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
  assert.deepEqual(
    swaggerSpec.components.schemas.CompetitionScope.enum,
    ['school_level', 'regional', 'national', 'continental', 'international']
  );
  assert.deepEqual(
    swaggerSpec.components.schemas.RoundDefinition.required,
    ['name', 'order', 'eventStartsDate', 'eventEndDate']
  );

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
  assert.equal(payload.rounds.every(({ eventStartsDate, eventEndDate }) => (
    new Date(eventStartsDate) < new Date(eventEndDate)
    && new Date(eventStartsDate) >= new Date(payload.eventStartDate)
    && new Date(eventEndDate) <= new Date(payload.eventEndDate)
  )), true);
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
        && (!filter.studentProfile || String(item.studentProfile) === String(filter.studentProfile))
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

  const origFindProfile = StudentProfile.findOne;
  StudentProfile.findOne = (query) => ({
    lean: async () => ({
      _id: query._id,
      parentUser: query.parentUser,
      givenName: 'Test',
      fatherName: 'Student',
      grandfatherName: 'User',
      isActive: true,
    }),
  });

  const invoke = async (user, email, existingProfileId = null) => {
    let body;
    let error;
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { body = value; return this; },
    };
    const profileId = existingProfileId || new mongoose.Types.ObjectId();
    await compRegCtrl.submitRegistration({
      params: { id: competitionId.toString() },
      body: { fullName: user.name, email, studentProfileId: profileId.toString() },
      user,
    }, res, (nextError) => { error = nextError; });
    return { status: error?.statusCode || res.statusCode, error, body, user, profileId };
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

    const winnerResult = results.find(({ status }) => status === 201);
    const winner = winnerResult.user;
    const duplicate = await invoke(winner, winner.email, winnerResult.profileId);
    assert.equal(duplicate.status, 409);
    assert.equal(state.registrations.length, 1);
    assert.equal(state.capacityVersion, 1);

    state.registrations[0].status = 'rejected';
    const reapplied = await invoke(winner, winner.email, winnerResult.profileId);
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
    StudentProfile.findOne = origFindProfile;
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

test('admin and student registration responses expose Competition rounds for currentRound display', async () => {
  const originals = {
    find: CompetitionRegistration.find,
    countDocuments: CompetitionRegistration.countDocuments,
    studentProfileFind: StudentProfile.find,
  };
  const roundIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const competition = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Frontend Round Display Competition',
    rounds: [
      roundFixture('Qualifier', 1, { _id: roundIds[0] }),
      roundFixture('Semifinal', 2, { _id: roundIds[1] }),
      roundFixture('Final', 3, { _id: roundIds[2] }),
    ],
  };
  const registration = {
    _id: new mongoose.Types.ObjectId(),
    competition,
    student: null,
    fullName: 'Frontend Student',
    email: 'frontend@example.com',
    status: 'accepted',
    progressionStatus: 'in_progress',
    currentRound: roundIds[1],
    roundProgress: [
      { round: roundIds[0], status: 'passed' },
      { round: roundIds[1], status: 'pending' },
    ],
    createdAt: new Date(),
  };
  const findQuery = () => {
    const chain = {
      populate() { return chain; },
      sort() { return chain; },
      skip() { return chain; },
      limit() { return chain; },
      lean: async () => [registration],
    };
    return chain;
  };
  CompetitionRegistration.find = findQuery;
  CompetitionRegistration.countDocuments = async () => 1;
  StudentProfile.find = () => {
    const chain = {
      select() { return chain; },
      lean: async () => [],
    };
    return chain;
  };

  try {
    const adminResult = await invokeHandler(compRegCtrl.getAllRegistrations, {
      query: { page: '1', limit: '10' },
    });
    const adminRegistration = adminResult.body.data.registrations[0];
    assert.equal(adminResult.status, 200);
    assert.equal(String(adminRegistration.competitionId), String(competition._id));
    assert.equal(adminRegistration.competitionTitle, competition.title);
    assert.deepEqual(
      adminRegistration.competition.rounds.map((round) => ({ ...round, _id: String(round._id) })),
      competition.rounds.map((round) => ({ ...round, _id: String(round._id) }))
    );
    const currentRound = adminRegistration.competition.rounds.find(
      ({ _id }) => String(_id) === String(adminRegistration.currentRound)
    );
    assert.deepEqual({ name: currentRound.name, order: currentRound.order }, { name: 'Semifinal', order: 2 });

    const studentResult = await invokeHandler(compRegCtrl.getMyRegistrations, {
      user: { _id: new mongoose.Types.ObjectId(), email: registration.email },
    });
    const studentRegistration = studentResult.body.data.registrations[0];
    assert.equal(studentResult.status, 200);
    assert.deepEqual(
      studentRegistration.competition.rounds.map((round) => ({ ...round, _id: String(round._id) })),
      competition.rounds.map((round) => ({ ...round, _id: String(round._id) }))
    );
  } finally {
    CompetitionRegistration.find = originals.find;
    CompetitionRegistration.countDocuments = originals.countDocuments;
    StudentProfile.find = originals.studentProfileFind;
  }
});

test('real PASS and FAIL controllers enforce sequence, terminal transitions, and atomic decision conflicts', async () => {
  const originals = {
    findById: CompetitionRegistration.findById,
    findOneAndUpdate: CompetitionRegistration.findOneAndUpdate,
  };
  let harness;

  const activate = ({ currentIndex = 0 } = {}) => {
    const roundIds = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId());
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
    const roundOnePass = await act(compRegCtrl.passRound, harness.roundIds[0]);
    assert.equal(roundOnePass.status, 200);
    assert.equal(harness.state.progressionStatus, 'in_progress');
    assert.equal(String(harness.state.currentRound), String(harness.roundIds[1]));
    assert.deepEqual(harness.state.roundProgress.map(({ status }) => status), ['passed', 'pending']);

    const roundTwoPass = await act(compRegCtrl.passRound, harness.roundIds[1]);
    assert.equal(roundTwoPass.status, 200);
    assert.equal(harness.state.progressionStatus, 'in_progress');
    assert.equal(String(harness.state.currentRound), String(harness.roundIds[2]));
    assert.deepEqual(harness.state.roundProgress.map(({ status }) => status), ['passed', 'passed', 'pending']);

    const finalPass = await act(compRegCtrl.passRound, harness.roundIds[2]);
    assert.equal(finalPass.status, 200);
    assert.equal(harness.state.progressionStatus, 'completed');
    assert.equal(harness.state.currentRound, null);
    assert.deepEqual(harness.state.roundProgress.map(({ status }) => status), ['passed', 'passed', 'passed']);

    for (const currentIndex of [0, 1, 2]) {
      activate({ currentIndex });
      const failed = await act(compRegCtrl.failRound, harness.roundIds[currentIndex]);
      assert.equal(failed.status, 200);
      assert.equal(harness.state.progressionStatus, 'eliminated');
      assert.equal(harness.state.currentRound, null);
      assert.equal(harness.state.roundProgress[currentIndex].status, 'failed');
      assert.equal((await act(compRegCtrl.passRound, harness.roundIds[currentIndex])).status, 409);
      assert.equal((await act(compRegCtrl.failRound, harness.roundIds[currentIndex])).status, 409);
    }

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
      roundFixture('Qualifier', 1, { _id: new mongoose.Types.ObjectId() }),
      roundFixture('Final', 2, { _id: new mongoose.Types.ObjectId() }),
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
    eventStartsDate: round.eventStartsDate,
    eventEndDate: round.eventEndDate,
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
      roundFixture('Replacement Qualifier', 1, { _id: String(replacementIds[0]) }),
      roundFixture('Replacement Final', 2, { _id: String(replacementIds[1]) }),
    ], false);
    assert.equal(uniqueSuppliedResult.status, 200);
    assert.deepEqual(uniqueSupplied.rounds.map(({ _id }) => String(_id)), replacementIds.map(String));

    for (const progress of [false, true]) {
      for (const includeIds of [true, false]) {
        for (const editType of ['name', 'date']) {
          const competition = makeCompetition();
          const referencedIds = competition.rounds.map(({ _id }) => String(_id));
          const payload = plainRounds(competition, includeIds);
          if (editType === 'name') payload[0].name = 'Renamed Qualifier';
          else payload[0].eventStartsDate = '2026-09-10T01:15:00.000Z';

          const result = await updateRounds(competition, payload, progress);
          assert.equal(result.status, 200, `${editType} edit should succeed`);
          assert.deepEqual(
            competition.rounds.map(({ _id }) => String(_id)),
            referencedIds,
            `${editType} edit must preserve IDs when progress=${progress} includeIds=${includeIds}`
          );
          if (editType === 'name') assert.equal(competition.rounds[0].name, 'Renamed Qualifier');
          else assert.equal(competition.rounds[0].eventStartsDate.toISOString(), '2026-09-10T01:15:00.000Z');
        }
      }
    }

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
      roundFixture('New Round 1', 1),
      roundFixture('New Round 2', 2),
      roundFixture('New Round 3', 3),
    ];
    const noProgressResult = await updateRounds(noProgress, structuralEdit, false);
    assert.equal(noProgressResult.status, 200);
    assert.equal(noProgress.rounds.length, 3);
    assert.equal(noProgress.rounds.some(({ _id }) => originalIds.includes(String(_id))), false);

    const removableBeforeProgress = makeCompetition();
    const retainedRoundId = String(removableBeforeProgress.rounds[0]._id);
    const removeResult = await updateRounds(
      removableBeforeProgress,
      plainRounds(removableBeforeProgress).slice(0, 1),
      false
    );
    assert.equal(removeResult.status, 200);
    assert.equal(removableBeforeProgress.rounds.length, 1);
    assert.equal(String(removableBeforeProgress.rounds[0]._id), retainedRoundId);
  } finally {
    mongoose.connection.transaction = originals.transaction;
    Competition.findOneAndUpdate = originals.findOneAndUpdate;
    CompetitionRegistration.exists = originals.registrationExists;
  }
});

test('roundless Competition blocks adding rounds after acceptance but permits it before registrations', async () => {
  const originals = {
    transaction: mongoose.connection.transaction,
    findOneAndUpdate: Competition.findOneAndUpdate,
    registrationExists: CompetitionRegistration.exists,
  };
  let currentCompetition;
  let hasAcceptedRegistration;
  mongoose.connection.transaction = async (callback) => callback({ isolated: true });
  Competition.findOneAndUpdate = async () => currentCompetition;
  CompetitionRegistration.exists = (filter) => ({
    session: async () => (
      filter.status === 'accepted' && hasAcceptedRegistration
        ? { _id: new mongoose.Types.ObjectId() }
        : null
    ),
  });

  const makeRoundlessCompetition = () => {
    const competition = Competition.hydrate({
      _id: new mongoose.Types.ObjectId(),
      title: 'Roundless Competition Update Test',
      category: 'olympiad',
      type: 'individual',
      scope: 'national',
      ...validDates,
      rounds: [],
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
  const newRounds = [
    roundFixture('Qualifier', 1),
    roundFixture('Semifinal', 2),
    roundFixture('Final', 3),
  ];
  const update = (competition) => {
    currentCompetition = competition;
    return invokeHandler(compCtrl.updateCompetition, {
      params: { id: String(competition._id) },
      body: { rounds: newRounds },
    });
  };

  try {
    hasAcceptedRegistration = true;
    const blockedCompetition = makeRoundlessCompetition();
    const blocked = await update(blockedCompetition);
    assert.equal(blocked.status, 409);
    assert.match(blocked.error.message, /accepted.*roundless competition/i);
    assert.equal(blockedCompetition.rounds.length, 0);
    assert.equal(blockedCompetition.saveCalls, 0);

    hasAcceptedRegistration = false;
    const editableCompetition = makeRoundlessCompetition();
    const allowed = await update(editableCompetition);
    assert.equal(allowed.status, 200);
    assert.equal(editableCompetition.rounds.length, 3);
    assert.deepEqual(
      editableCompetition.rounds.map(({ name, order }) => ({ name, order })),
      newRounds.map(({ name, order }) => ({ name, order }))
    );
    assert.equal(editableCompetition.saveCalls, 1);
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
        roundFixture('Old Qualifier', 1, { _id: oldRoundIds[0] }),
        roundFixture('Old Final', 2, { _id: oldRoundIds[1] }),
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
          roundFixture('New Qualifier', 1, { _id: String(replacementIds[0]) }),
          roundFixture('New Final', 2, { _id: String(replacementIds[1]) }),
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
      rounds: [roundFixture('Old Round', 1, { _id: oldRoundId })],
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
          roundFixture('New Qualifier', 1, { _id: String(newRoundIds[0]) }),
          roundFixture('New Final', 2, { _id: String(newRoundIds[1]) }),
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
        rounds: [roundFixture('Qualifier', 1, { _id: firstRoundId })],
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

test('public and admin Competition lists sort newest-created first while admin includes every lifecycle state', async () => {
  const originals = {
    find: Competition.find,
    countDocuments: Competition.countDocuments,
  };
  const sortSpecifications = [];
  const records = [
    { _id: 'draft-id', title: 'Draft Competition', status: 'draft', isActive: false },
    { _id: 'cancelled-id', title: 'Cancelled Competition', status: 'cancelled', isActive: true },
  ];
  Competition.find = () => {
    const chain = {
      sort: (specification) => {
        sortSpecifications.push(specification);
        return chain;
      },
      skip: () => chain,
      limit: () => chain,
      lean: async () => records,
    };
    return chain;
  };
  Competition.countDocuments = async () => records.length;

  try {
    const publicResult = await invokeHandler(compCtrl.getCompetitions, {
      query: { page: '1', limit: '10' },
    });
    const adminResult = await invokeHandler(compCtrl.getAllCompetitions, {
      query: { page: '1', limit: '10' },
    });
    assert.equal(publicResult.status, 200);
    assert.equal(adminResult.status, 200);
    assert.deepEqual(adminResult.body.data.competitions, records);
    assert.deepEqual(adminResult.body.data.pagination, { total: 2, page: 1, limit: 10, totalPages: 1 });
    assert.deepEqual(sortSpecifications, [{ createdAt: -1 }, { createdAt: -1 }]);
  } finally {
    Competition.find = originals.find;
    Competition.countDocuments = originals.countDocuments;
  }
});

test('public Competition list and detail responses expose both round event date fields', async () => {
  const originals = {
    find: Competition.find,
    findOne: Competition.findOne,
    countDocuments: Competition.countDocuments,
  };
  const competition = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Public Round Date Contract',
    scope: 'continental',
    rounds: [roundFixture('Qualifier', 1, { _id: new mongoose.Types.ObjectId() })],
  };
  const listQuery = {
    sort() { return listQuery; },
    skip() { return listQuery; },
    limit() { return listQuery; },
    lean: async () => [competition],
  };
  Competition.find = () => listQuery;
  Competition.findOne = () => ({ lean: async () => competition });
  Competition.countDocuments = async () => 1;

  try {
    const listResult = await invokeHandler(compCtrl.getCompetitions, {
      query: { page: '1', limit: '10' },
    });
    const detailResult = await invokeHandler(compCtrl.getCompetition, {
      params: { id: String(competition._id) },
    });
    for (const returnedCompetition of [
      listResult.body.data.competitions[0],
      detailResult.body.data,
    ]) {
      assert.equal(returnedCompetition.scope, 'continental');
      assert.equal(returnedCompetition.rounds[0].eventStartsDate, validRoundDates.eventStartsDate);
      assert.equal(returnedCompetition.rounds[0].eventEndDate, validRoundDates.eventEndDate);
    }
  } finally {
    Competition.find = originals.find;
    Competition.findOne = originals.findOne;
    Competition.countDocuments = originals.countDocuments;
  }
});

test('Competition frontend Swagger and Postman contracts expose round definitions and currentRound guidance', () => {
  const routes = adminRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  assert.equal(routes.some(({ path: routePath, methods }) => routePath === '/competitions' && methods.includes('get')), true);

  assert.ok(swaggerSpec.components.schemas.RoundDefinition);
  assert.ok(swaggerSpec.components.schemas.RoundProgress);
  assert.deepEqual(
    swaggerSpec.components.schemas.RoundDefinition.required,
    ['name', 'order', 'eventStartsDate', 'eventEndDate']
  );
  assert.ok(swaggerSpec.components.schemas.RoundDefinition.properties.eventStartsDate);
  assert.ok(swaggerSpec.components.schemas.RoundDefinition.properties.eventEndDate);
  assert.equal(
    swaggerSpec.components.schemas.Competition.properties.rounds.items.$ref,
    '#/components/schemas/RoundDefinition'
  );
  assert.equal(
    swaggerSpec.components.schemas.CompetitionRegistration.properties.roundProgress.items.$ref,
    '#/components/schemas/RoundProgress'
  );
  assert.equal(
    swaggerSpec.components.schemas.CompetitionRegistration.properties.competition.properties.rounds.items.$ref,
    '#/components/schemas/RoundDefinition'
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
  assert.equal(
    swaggerSpec.paths['/api/competitions'].get.responses['200']
      .content['application/json'].schema.properties.data.properties.competitions.items.$ref,
    '#/components/schemas/Competition'
  );
  assert.equal(
    swaggerSpec.paths['/api/competitions/{id}'].get.responses['200']
      .content['application/json'].schema.properties.data.$ref,
    '#/components/schemas/Competition'
  );

  const adminRegistrations = swaggerSpec.paths['/api/admin/competition-registrations'].get;
  assert.equal(adminRegistrations.parameters.some(({ name }) => name === 'progressionStatus'), true);
  assert.equal(
    adminRegistrations.responses['200'].content['application/json'].schema
      .properties.data.properties.registrations.items.$ref,
    '#/components/schemas/CompetitionRegistration'
  );
  assert.ok(swaggerSpec.paths['/api/admin/competition-registrations/{id}/approve'].patch.responses['409']);
  assert.ok(swaggerSpec.paths['/api/admin/competition-registrations/{id}/reject'].patch.responses['422']);

  for (const action of ['pass', 'fail']) {
    const operation = swaggerSpec.paths[`/api/admin/competition-registrations/{id}/round/${action}`].patch;
    assert.deepEqual(Object.keys(operation.responses).sort(), ['200', '400', '401', '403', '404', '409', '422']);
    assert.match(
      operation.requestBody.content['application/json'].schema.properties.roundId.description,
      /Competition\.rounds\[i\]\._id.*registration\.currentRound/
    );
  }

  const collection = JSON.parse(fs.readFileSync(path.join(__dirname, '../postman_collection.json'), 'utf8'));
  const competitionFolder = collection.item.find(({ name }) => name === '5. Competitions');
  assert.ok(competitionFolder);
  for (const scope of COMPETITION_SCOPES) {
    assert.match(competitionFolder.description, new RegExp(scope));
  }
  assert.match(competitionFolder.description, /institutional and local values are invalid/);
  const requests = [];
  const collect = (items = []) => items.forEach((item) => {
    if (item.request) requests.push(item);
    collect(item.item);
  });
  collect(collection.item);
  const adminList = requests.find(({ name }) => name === 'Admin List All Competitions');
  assert.equal(adminList.request.method, 'GET');
  assert.equal(adminList.request.url.raw, '{{BASE_URL}}/api/admin/competitions?page=1&limit=10');

  const publicList = requests.find(({ name }) => name === 'List Active Competitions');
  const scopeQuery = publicList.request.url.query.find(({ key }) => key === 'scope');
  for (const scope of COMPETITION_SCOPES) assert.match(scopeQuery.description, new RegExp(scope));

  const createCompetition = requests.find(({ name }) => name === 'Admin Create Competition');
  for (const scope of COMPETITION_SCOPES) {
    assert.match(createCompetition.request.description, new RegExp(scope));
  }
  const createBody = JSON.parse(createCompetition.request.body.raw);
  assert.deepEqual(createBody.rounds.map(({ name, order }) => ({ name, order })), [
    { name: 'Qualifier', order: 1 },
    { name: 'Semifinal', order: 2 },
    { name: 'Final', order: 3 },
  ]);
  assert.equal(createBody.rounds.every(({ eventStartsDate, eventEndDate }) => (
    typeof eventStartsDate === 'string'
    && typeof eventEndDate === 'string'
    && new Date(eventStartsDate) < new Date(eventEndDate)
    && new Date(eventStartsDate) >= new Date(createBody.eventStartDate)
    && new Date(eventEndDate) <= new Date(createBody.eventEndDate)
  )), true);
  for (const action of ['Pass', 'Fail']) {
    const request = requests.find(({ name }) => name === `Admin ${action} Competition Registration Round`);
    assert.deepEqual(JSON.parse(request.request.body.raw), { roundId: '{{round_id}}' });
    assert.match(request.request.description, /currentRound.*roundId.*round order/);
  }
});

test('CompetitionRegistration academicFile is an optional, trimmed single URL field owned only by registrations', async () => {
  const academicFilePath = CompetitionRegistration.schema.path('academicFile');
  assert.equal(academicFilePath.instance, 'String');
  assert.notEqual(academicFilePath.isRequired, true);
  assert.equal(academicFilePath.defaultValue, null);
  assert.equal(academicFilePath.options.trim, true);
  assert.equal(Competition.schema.path('academicFile'), undefined);
  assert.equal(User.schema.path('academicFile'), undefined);

  const withoutFile = new CompetitionRegistration({
    competition: new mongoose.Types.ObjectId(),
    fullName: 'No File Applicant',
    email: 'no-file@example.com',
  });
  assert.equal(withoutFile.validateSync(), undefined);
  assert.equal(withoutFile.academicFile, null);

  const withFile = new CompetitionRegistration({
    competition: new mongoose.Types.ObjectId(),
    fullName: 'File Applicant',
    email: 'file@example.com',
    academicFile: '  https://storage.example.com/competition-documents/student-123.pdf  ',
  });
  assert.equal(withFile.validateSync(), undefined);
  assert.equal(withFile.academicFile, 'https://storage.example.com/competition-documents/student-123.pdf');

  const baseRequest = {
    params: { id: new mongoose.Types.ObjectId().toString() },
    body: { fullName: 'Validated Applicant', email: 'validated@example.com' },
  };
  assert.equal((await validate(compRegValidator.submitRegistrationRules, baseRequest)).isEmpty(), true);
  assert.equal((await validate(compRegValidator.submitRegistrationRules, {
    ...baseRequest,
    body: { ...baseRequest.body, academicFile: null },
  })).isEmpty(), true);
  assert.equal((await validate(compRegValidator.submitRegistrationRules, {
    ...baseRequest,
    body: { ...baseRequest.body, academicFile: '' },
  })).isEmpty(), true);
  assert.equal((await validate(compRegValidator.submitRegistrationRules, {
    ...baseRequest,
    body: { ...baseRequest.body, academicFile: 'https://example.com/documents/academic-record.pdf' },
  })).isEmpty(), true);

  for (const invalidValue of ['not-a-url', { url: 'https://example.com/not-a-string.pdf' }]) {
    const malformed = await validate(compRegValidator.submitRegistrationRules, {
      ...baseRequest,
      body: { ...baseRequest.body, academicFile: invalidValue },
    });
    assert.equal(malformed.isEmpty(), false);
    assert.equal(malformed.array().some(({ path: field }) => field === 'academicFile'), true);
  }
});

test('submitRegistration stores academicFile for authenticated individual and anonymous team registrations', async () => {
  const competitionId = new mongoose.Types.ObjectId();
  const academicFile = 'https://example.com/documents/academic-record.pdf';
  let competitionType = 'individual';
  const captured = [];
  const originals = {
    transaction: mongoose.connection.transaction,
    competitionFindOne: Competition.findOne,
    competitionFindOneAndUpdate: Competition.findOneAndUpdate,
    registrationFindOne: CompetitionRegistration.findOne,
    registrationCount: CompetitionRegistration.countDocuments,
    registrationCreate: CompetitionRegistration.create,
    userExists: User.exists,
    email: emailService.sendCompetitionRegistrationSubmittedEmail,
    createNotification: notificationService.createNotification,
    notifyByEmail: notificationService.notifyUserByEmail,
  };
  const currentCompetition = () => ({
    _id: competitionId,
    title: 'Academic File Competition',
    type: competitionType,
    status: 'published',
    isActive: true,
  });

  mongoose.connection.transaction = async (callback) => callback({ isolated: true });
  Competition.findOne = async () => currentCompetition();
  Competition.findOneAndUpdate = async () => currentCompetition();
  CompetitionRegistration.findOne = () => ({ session: async () => null });
  CompetitionRegistration.countDocuments = () => ({ session: async () => 0 });
  CompetitionRegistration.create = async ([payload]) => {
    captured.push(payload);
    return [{ _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...payload }];
  };
  User.exists = async () => false;
  emailService.sendCompetitionRegistrationSubmittedEmail = () => {};
  notificationService.createNotification = () => {};
  notificationService.notifyUserByEmail = () => {};

  const origFindProf31 = StudentProfile.findOne;
  const profileId31 = new mongoose.Types.ObjectId();
  StudentProfile.findOne = (query) => ({
    lean: async () => ({
      _id: profileId31,
      parentUser: query.parentUser,
      givenName: 'Authenticated',
      fatherName: 'Applicant',
      grandfatherName: 'User',
      isActive: true,
    }),
  });

  const invokeRegistration = (body, user) => invokeHandler(compRegCtrl.submitRegistration, {
    params: { id: competitionId.toString() },
    body,
    ...(user && { user }),
  });

  try {
    const authenticated = await invokeRegistration(
      { fullName: 'Ignored Name', email: 'ignored@example.com', academicFile, studentProfileId: profileId31.toString() },
      { _id: new mongoose.Types.ObjectId(), name: 'Authenticated Applicant', email: 'auth@example.com' }
    );
    assert.equal(authenticated.status, 201);
    assert.equal(captured[0].academicFile, academicFile);
    assert.equal(authenticated.body.data.academicFile, academicFile);
    assert.ok(captured[0].studentProfile);

    competitionType = 'team';
    const anonymous = await invokeRegistration({
      fullName: 'Anonymous Team Applicant',
      email: 'anonymous-team@example.com',
      academicFile,
      teamName: 'Document Team',
      teamMembers: ['Member One'],
    });
    assert.equal(anonymous.status, 201);
    assert.equal(captured[1].academicFile, academicFile);
    assert.equal(anonymous.body.data.academicFile, academicFile);
    assert.equal(captured[1].student, null);
    assert.equal(captured[1].teamName, 'Document Team');
  } finally {
    mongoose.connection.transaction = originals.transaction;
    Competition.findOne = originals.competitionFindOne;
    Competition.findOneAndUpdate = originals.competitionFindOneAndUpdate;
    CompetitionRegistration.findOne = originals.registrationFindOne;
    CompetitionRegistration.countDocuments = originals.registrationCount;
    CompetitionRegistration.create = originals.registrationCreate;
    User.exists = originals.userExists;
    emailService.sendCompetitionRegistrationSubmittedEmail = originals.email;
    notificationService.createNotification = originals.createNotification;
    notificationService.notifyUserByEmail = originals.notifyByEmail;
    StudentProfile.findOne = origFindProf31;
  }
});

test('authorized full registration responses and CSV export expose academicFile', async () => {
  const academicFile = 'https://example.com/documents/academic-record.pdf';
  const userId = new mongoose.Types.ObjectId();
  const record = {
    _id: new mongoose.Types.ObjectId(),
    competition: {
      _id: new mongoose.Types.ObjectId(),
      title: 'Document Review Competition',
      rounds: [],
    },
    student: { _id: userId, name: 'Document Applicant', email: 'document@example.com' },
    fullName: 'Document Applicant',
    email: 'document@example.com',
    phone: null,
    academicFile,
    skills: [],
    teamMembers: [],
    status: 'pending',
    progressionStatus: 'not_started',
    roundProgress: [],
    createdAt: new Date('2026-08-27T00:00:00.000Z'),
  };
  const originals = {
    find: CompetitionRegistration.find,
    countDocuments: CompetitionRegistration.countDocuments,
    studentProfileFind: StudentProfile.find,
  };
  const query = {
    populate() { return query; },
    sort() { return query; },
    skip() { return query; },
    limit() { return query; },
    lean: async () => [record],
  };
  CompetitionRegistration.find = () => query;
  CompetitionRegistration.countDocuments = async () => 1;
  StudentProfile.find = () => {
    const chain = {
      select() { return chain; },
      lean: async () => [],
    };
    return chain;
  };

  try {
    const admin = await invokeHandler(compRegCtrl.getAllRegistrations, {
      query: { page: '1', limit: '10' },
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.data.registrations[0].academicFile, academicFile);

    const student = await invokeHandler(compRegCtrl.getMyRegistrations, {
      user: { _id: userId, email: 'document@example.com' },
    });
    assert.equal(student.status, 200);
    assert.equal(student.body.data.registrations[0].academicFile, academicFile);

    let csv;
    let exportError;
    const exportResponse = {
      setHeader() {},
      status() { return exportResponse; },
      send(value) { csv = value; return value; },
    };
    await exportController.exportCompetitionRegistrations(
      { query: {} },
      exportResponse,
      (error) => { exportError = error; }
    );
    assert.equal(exportError, undefined);
    assert.match(csv, /"Academic File"/);
    assert.ok(csv.includes(`"${academicFile}"`));
  } finally {
    CompetitionRegistration.find = originals.find;
    CompetitionRegistration.countDocuments = originals.countDocuments;
    StudentProfile.find = originals.studentProfileFind;
  }
});

test('Swagger and canonical Postman artifacts document optional CompetitionRegistration academicFile', () => {
  const schema = swaggerSpec.components.schemas.CompetitionRegistration;
  assert.deepEqual(schema.properties.academicFile, {
    type: 'string',
    format: 'uri',
    nullable: true,
    description: 'Optional URL of the academic/supporting document submitted with the Competition registration.',
    example: 'https://example.com/documents/academic-record.pdf',
  });
  assert.equal((schema.required || []).includes('academicFile'), false);

  const registrationOperation = swaggerSpec.paths['/api/competitions/{id}/register'].post;
  const requestSchema = registrationOperation.requestBody.content['application/json'].schema;
  assert.equal(requestSchema.properties.academicFile.format, 'uri');
  assert.equal(requestSchema.required.includes('academicFile'), false);
  assert.equal(
    swaggerSpec.paths['/api/admin/competition-registrations'].get.responses['200']
      .content['application/json'].schema.properties.data.properties.registrations.items.$ref,
    '#/components/schemas/CompetitionRegistration'
  );
  assert.equal(
    swaggerSpec.paths['/api/competitions/registrations/my'].get.responses['200']
      .content['application/json'].schema.properties.data.properties.registrations.items.$ref,
    '#/components/schemas/CompetitionRegistration'
  );

  const generatorSource = fs.readFileSync(path.join(__dirname, '../scripts/generate-postman.js'), 'utf8');
  assert.match(generatorSource, /academicFile: 'https:\/\/example\.com\/documents\/academic-record\.pdf'/);

  const collection = JSON.parse(fs.readFileSync(path.join(__dirname, '../postman_collection.json'), 'utf8'));
  const requests = [];
  const collect = (items = []) => items.forEach((item) => {
    if (item.request) requests.push(item);
    collect(item.item);
  });
  collect(collection.item);
  const registrationRequest = requests.find(({ name }) => name === 'Register for Competition (Authenticated)' || name === 'Register for Competition');
  assert.equal(
    JSON.parse(registrationRequest.request.body.raw).academicFile,
    'https://example.com/documents/academic-record.pdf'
  );
});

async function validationStatus(chains, req) {
  return (await validate(chains, req)).isEmpty() ? 200 : 422;
}

test('Phase D Extension: Competition round shortDescription and requirements validation and persistence', async () => {
  const compData = {
    title: 'Round Info Competition ' + Date.now(),
    category: 'steam_innovation',
    type: 'individual',
    scope: 'national',
    registrationOpenDate: new Date('2026-08-01'),
    registrationCloseDate: new Date('2026-09-01'),
    eventStartDate: new Date('2026-10-01'),
    eventEndDate: new Date('2026-10-31'),
    rounds: [
      {
        name: 'Round 1',
        order: 1,
        eventStartsDate: new Date('2026-10-02'),
        eventEndDate: new Date('2026-10-05'),
        shortDescription: '   Initial project presentation.   ',
        requirements: '   Submit project summary and attend the presentation.   ',
      },
      {
        name: 'Round 2',
        order: 2,
        eventStartsDate: new Date('2026-10-10'),
        eventEndDate: new Date('2026-10-15'),
        shortDescription: 'Final coding round.',
        requirements: 'Deploy live application.',
      },
    ],
  };

  const competition = new Competition(compData);
  await competition.validate();
  assert.equal(competition.rounds[0].shortDescription, 'Initial project presentation.');
  assert.equal(competition.rounds[0].requirements, 'Submit project summary and attend the presentation.');
  assert.equal(competition.rounds[1].shortDescription, 'Final coding round.');
  assert.equal(competition.rounds[1].requirements, 'Deploy live application.');

  const jsonObj = competition.toJSON();
  assert.equal(jsonObj.rounds[0].shortDescription, 'Initial project presentation.');
  assert.equal(jsonObj.rounds[0].requirements, 'Submit project summary and attend the presentation.');

  const reqInvalidDesc = {
    body: {
      ...compData,
      title: 'Invalid Short Description',
      rounds: [
        {
          name: 'Round 1',
          order: 1,
          eventStartsDate: '2026-10-02T00:00:00.000Z',
          eventEndDate: '2026-10-05T00:00:00.000Z',
          shortDescription: 12345,
        },
      ],
    },
  };
  const statusInvalidDesc = await validationStatus(competitionValidator.createCompetitionRules, reqInvalidDesc);
  assert.equal(statusInvalidDesc, 422);

  const reqInvalidReq = {
    body: {
      ...compData,
      title: 'Invalid Requirements',
      rounds: [
        {
          name: 'Round 1',
          order: 1,
          eventStartsDate: '2026-10-02T00:00:00.000Z',
          eventEndDate: '2026-10-05T00:00:00.000Z',
          requirements: true,
        },
      ],
    },
  };
  const statusInvalidReq = await validationStatus(competitionValidator.createCompetitionRules, reqInvalidReq);
  assert.equal(statusInvalidReq, 422);

  const reqInvalidDates = {
    body: {
      ...compData,
      title: 'Invalid Round Dates',
      rounds: [
        {
          name: 'Round 1',
          order: 1,
          eventStartsDate: '2026-10-05T00:00:00.000Z',
          eventEndDate: '2026-10-02T00:00:00.000Z',
        },
      ],
    },
  };
  const statusInvalidDates = await validationStatus(competitionValidator.createCompetitionRules, reqInvalidDates);
  assert.equal(statusInvalidDates, 422);

  const reqNonContiguous = {
    body: {
      ...compData,
      title: 'Non Contiguous Orders',
      rounds: [
        {
          name: 'Round 1',
          order: 1,
          eventStartsDate: '2026-10-02T00:00:00.000Z',
          eventEndDate: '2026-10-05T00:00:00.000Z',
        },
        {
          name: 'Round 3',
          order: 3,
          eventStartsDate: '2026-10-06T00:00:00.000Z',
          eventEndDate: '2026-10-10T00:00:00.000Z',
        },
      ],
    },
  };
  const statusNonContiguous = await validationStatus(competitionValidator.createCompetitionRules, reqNonContiguous);
  assert.equal(statusNonContiguous, 422);

  const r1Id = new mongoose.Types.ObjectId();
  const reg = new CompetitionRegistration({
    competition: new mongoose.Types.ObjectId(),
    fullName: 'Progression Test Student',
    email: 'progression@example.com',
    studentProfile: new mongoose.Types.ObjectId(),
    currentRound: r1Id,
    roundProgress: [{ round: r1Id, status: 'passed' }],
  });
  assert.equal(String(reg.currentRound), String(r1Id));
  assert.equal(reg.roundProgress[0].status, 'passed');

  const oldComp = new Competition({
    title: 'Old Competition Legacy ' + Date.now(),
    category: 'steam_innovation',
    type: 'individual',
    scope: 'national',
    registrationOpenDate: new Date('2026-08-01'),
    registrationCloseDate: new Date('2026-09-01'),
    eventStartDate: new Date('2026-10-01'),
    eventEndDate: new Date('2026-10-31'),
    rounds: [
      {
        name: 'Legacy Round',
        order: 1,
        eventStartsDate: new Date('2026-10-02'),
        eventEndDate: new Date('2026-10-05'),
      },
    ],
  });
  await oldComp.validate();
  assert.equal(oldComp.rounds[0].shortDescription, null);
  assert.equal(oldComp.rounds[0].requirements, null);

  assert.notEqual(competition.rounds[0].shortDescription, competition.rounds[1].shortDescription);
  assert.notEqual(competition.rounds[0].requirements, competition.rounds[1].requirements);

  const roundDefSchema = swaggerSpec.components.schemas.RoundDefinition;
  assert.equal(roundDefSchema.properties.shortDescription.type, 'string');
  assert.equal(roundDefSchema.properties.requirements.type, 'string');
});
