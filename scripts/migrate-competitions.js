require('dotenv').config();

const mongoose = require('mongoose');
const Competition = require('../src/models/Competition');
const CompetitionRegistration = require('../src/models/CompetitionRegistration');
const {
  COMPETITION_CATEGORIES,
  COMPETITION_TYPES,
} = require('../src/constants');

const LEGACY_STATUS_MAP = Object.freeze({
  open: 'published',
  upcoming: 'published',
  closed: 'published',
  completed: 'completed',
  cancelled: 'cancelled',
  draft: 'draft',
  published: 'published',
});

const idString = (value) => String(value?._id || value || '');
const normalizedText = (value) => String(value || '').trim().toLowerCase();

const distribution = (records, field) => records.reduce((result, record) => {
  const value = record[field] ?? '<missing>';
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});

const classifyCategory = (competition) => {
  if (COMPETITION_CATEGORIES.includes(competition.category)) {
    return { value: competition.category, confidence: 'HIGH', evidence: 'already valid' };
  }

  const text = normalizedText([
    competition.title,
    competition.description,
    competition.eligibility,
    ...(Array.isArray(competition.requirements) ? competition.requirements : []),
  ].filter(Boolean).join(' '));
  const olympiad = /\bolympiad\b/.test(text);
  const steamInnovation = /\b(hackathon|innovation|coding|robot(?:ics)?|engineering|technology|science fair)\b/.test(text)
    || /\bartificial intelligence\b|\bai\b/.test(text);

  if (olympiad && !steamInnovation) {
    return { value: 'olympiad', confidence: 'HIGH', evidence: 'explicit olympiad wording' };
  }
  if (steamInnovation && !olympiad) {
    return { value: 'steam_innovation', confidence: 'HIGH', evidence: 'explicit STEAM/innovation wording' };
  }
  return { value: null, confidence: 'AMBIGUOUS', evidence: 'no single strong category signal' };
};

const classifyType = (competition, registrations) => {
  if (COMPETITION_TYPES.includes(competition.type)) {
    return { value: competition.type, confidence: 'HIGH', evidence: 'already valid' };
  }

  const text = normalizedText([
    competition.title,
    competition.description,
    competition.eligibility,
    ...(Array.isArray(competition.requirements) ? competition.requirements : []),
  ].filter(Boolean).join(' '));
  const registrationTeamEvidence = registrations.some((registration) => (
    normalizedText(registration.teamName)
      || (Array.isArray(registration.teamMembers) && registration.teamMembers.length > 0)
  ));
  const teamText = /\b(team|teams|team-based)\b/.test(text);
  const individualText = /\b(individual|solo|single participant|each student)\b/.test(text);
  const team = registrationTeamEvidence || teamText;

  if (team && !individualText) {
    return {
      value: 'team',
      confidence: 'HIGH',
      evidence: registrationTeamEvidence ? 'existing team registration data' : 'explicit team wording',
    };
  }
  if (individualText && !team) {
    return { value: 'individual', confidence: 'HIGH', evidence: 'explicit individual wording' };
  }
  return { value: null, confidence: 'AMBIGUOUS', evidence: 'legacy type does not establish participation mode' };
};

const mergeEligibilityIntoRequirements = (competition) => {
  const requirements = Array.isArray(competition.requirements)
    ? competition.requirements.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())
    : [];
  const eligibility = typeof competition.eligibility === 'string' ? competition.eligibility.trim() : '';
  if (eligibility && !requirements.some((value) => normalizedText(value) === normalizedText(eligibility))) {
    requirements.push(eligibility);
  }
  return requirements;
};

const buildMigrationPlan = (competitions, registrations) => {
  const registrationsByCompetition = new Map();
  for (const registration of registrations) {
    const key = idString(registration.competition);
    if (!registrationsByCompetition.has(key)) registrationsByCompetition.set(key, []);
    registrationsByCompetition.get(key).push(registration);
  }

  const competitionPlans = competitions.map((competition) => {
    const id = idString(competition);
    const related = registrationsByCompetition.get(id) || [];
    const category = classifyCategory(competition);
    const type = classifyType(competition, related);
    const set = {};

    if (category.confidence === 'HIGH' && category.value !== competition.category) set.category = category.value;
    if (type.confidence === 'HIGH' && type.value !== competition.type) set.type = type.value;

    const mappedStatus = LEGACY_STATUS_MAP[competition.status];
    if (mappedStatus && mappedStatus !== competition.status) set.status = mappedStatus;

    const requirements = mergeEligibilityIntoRequirements(competition);
    const existingRequirements = Array.isArray(competition.requirements)
      ? competition.requirements.map((value) => String(value).trim()).filter(Boolean)
      : [];
    if (JSON.stringify(requirements) !== JSON.stringify(existingRequirements)) set.requirements = requirements;

    if ((competition.maxRegistrations === undefined || competition.maxRegistrations === null)
        && Number.isFinite(competition.maxParticipants) && competition.maxParticipants > 0) {
      set.maxRegistrations = competition.maxParticipants;
    }

    const ambiguous = category.confidence === 'AMBIGUOUS' || type.confidence === 'AMBIGUOUS';
    return {
      id,
      rawId: competition._id,
      title: competition.title || '<untitled>',
      currentType: competition.type ?? '<missing>',
      proposedCategory: category.value,
      proposedType: type.value,
      categoryConfidence: category.confidence,
      typeConfidence: type.confidence,
      confidence: ambiguous ? 'AMBIGUOUS' : 'HIGH',
      evidence: { category: category.evidence, type: type.evidence },
      action: ambiguous
        ? 'NO AMBIGUOUS CATEGORY/TYPE UPDATE — PM / ADMIN INPUT REQUIRED'
        : 'SAFE IN-PLACE UPDATE',
      set,
    };
  });

  const registrationPlans = registrations.map((registration) => {
    const set = {};
    if (registration.progressionStatus === undefined || registration.progressionStatus === null) {
      set.progressionStatus = 'not_started';
    }
    if (registration.currentRound === undefined) set.currentRound = null;
    if (!Array.isArray(registration.roundProgress)) set.roundProgress = [];
    return { id: idString(registration), rawId: registration._id, set };
  });

  return {
    competitionPlans,
    competitionUpdates: competitionPlans.filter(({ set }) => Object.keys(set).length > 0),
    registrationUpdates: registrationPlans.filter(({ set }) => Object.keys(set).length > 0),
    ambiguousRecords: competitionPlans.filter(({ confidence }) => confidence === 'AMBIGUOUS'),
    missingDateRecords: competitions
      .filter(({ registrationOpenDate, registrationCloseDate }) => !registrationOpenDate || !registrationCloseDate)
      .map(({ _id, title, registrationOpenDate, registrationCloseDate }) => ({
        id: idString(_id),
        title: title || '<untitled>',
        missingRegistrationOpenDate: !registrationOpenDate,
        missingRegistrationCloseDate: !registrationCloseDate,
        action: 'PM / ADMIN INPUT REQUIRED',
      })),
  };
};

const captureSnapshot = (competitions, registrations) => {
  const competitionIds = competitions.map(idString).sort();
  const registrationIds = registrations.map(idString).sort();
  const competitionIdSet = new Set(competitionIds);
  const danglingRegistrationIds = registrations
    .filter((registration) => !competitionIdSet.has(idString(registration.competition)))
    .map(idString)
    .sort();

  return {
    competitionCount: competitions.length,
    competitionIds,
    competitionRegistrationCount: registrations.length,
    competitionRegistrationIds: registrationIds,
    danglingRegistrationCount: danglingRegistrationIds.length,
    danglingRegistrationIds,
    legacyStatusDistribution: distribution(competitions, 'status'),
    legacyTypeDistribution: distribution(competitions, 'type'),
    missingCategoryCount: competitions.filter(({ category }) => !category).length,
    missingRegistrationDatesCount: competitions
      .filter(({ registrationOpenDate, registrationCloseDate }) => !registrationOpenDate || !registrationCloseDate).length,
    missingProgressionStatusCount: registrations
      .filter(({ progressionStatus }) => progressionStatus === undefined || progressionStatus === null).length,
  };
};

const assertSafetyTarget = () => {
  const environment = process.env.NODE_ENV;
  const host = mongoose.connection.host;
  const database = mongoose.connection.name;
  console.log(JSON.stringify({ NODE_ENV: environment, databaseHost: host, databaseName: database }, null, 2));

  if (environment !== 'development') {
    throw new Error('Refusing Competition migration outside NODE_ENV=development');
  }
  if (!process.argv.includes('--confirm-development')) {
    throw new Error('Pass --confirm-development after verifying the database host and name');
  }
  if (!host || !database || /(^|[-_])(prod|production)([-_]|$)/i.test(`${host} ${database}`)) {
    throw new Error('Competition migration target could not be confirmed as a development/demo database');
  }
};

const migrate = async ({ dryRun = process.argv.includes('--dry-run') } = {}) => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Refusing Competition migration outside NODE_ENV=development');
  }
  if (!process.argv.includes('--confirm-development')) {
    throw new Error('Pass --confirm-development after verifying the database host and name');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  assertSafetyTarget();

  const readRaw = async () => Promise.all([
    Competition.collection.find({}).sort({ _id: 1 }).toArray(),
    CompetitionRegistration.collection.find({}).sort({ _id: 1 }).toArray(),
  ]);
  const [beforeCompetitions, beforeRegistrations] = await readRaw();
  const before = captureSnapshot(beforeCompetitions, beforeRegistrations);
  const plan = buildMigrationPlan(beforeCompetitions, beforeRegistrations);

  console.log(JSON.stringify({
    migrationMode: dryRun ? 'DRY RUN — NO WRITES' : 'APPLY',
    before,
    ambiguousRecords: plan.ambiguousRecords,
    missingDateRecords: plan.missingDateRecords,
    plannedCompetitionUpdates: plan.competitionUpdates.length,
    plannedRegistrationUpdates: plan.registrationUpdates.length,
  }, null, 2));

  if (dryRun) return { before, plan, after: before, applied: false };

  await mongoose.connection.transaction(async (session) => {
    if (plan.competitionUpdates.length > 0) {
      await Competition.collection.bulkWrite(
        plan.competitionUpdates.map(({ rawId, set }) => ({
          updateOne: { filter: { _id: rawId }, update: { $set: set } },
        })),
        { ordered: false, session }
      );
    }
    if (plan.registrationUpdates.length > 0) {
      await CompetitionRegistration.collection.bulkWrite(
        plan.registrationUpdates.map(({ rawId, set }) => ({
          updateOne: { filter: { _id: rawId }, update: { $set: set } },
        })),
        { ordered: false, session }
      );
    }
  });

  const [afterCompetitions, afterRegistrations] = await readRaw();
  const after = captureSnapshot(afterCompetitions, afterRegistrations);
  const newDangling = after.danglingRegistrationIds
    .filter((id) => !new Set(before.danglingRegistrationIds).has(id));

  if (JSON.stringify(before.competitionIds) !== JSON.stringify(after.competitionIds)) {
    throw new Error('Competition IDs changed during migration');
  }
  if (JSON.stringify(before.competitionRegistrationIds) !== JSON.stringify(after.competitionRegistrationIds)) {
    throw new Error('CompetitionRegistration IDs changed during migration');
  }
  if (newDangling.length > 0) {
    throw new Error(`Migration created dangling registrations: ${newDangling.join(', ')}`);
  }

  const rerunPlan = buildMigrationPlan(afterCompetitions, afterRegistrations);
  console.log(JSON.stringify({
    after,
    competitionIdsChanged: 0,
    competitionRegistrationsDeleted: 0,
    newDanglingRegistrations: newDangling.length,
    remainingAmbiguousRecords: rerunPlan.ambiguousRecords,
    remainingMissingDateRecords: rerunPlan.missingDateRecords,
    rerunCompetitionUpdates: rerunPlan.competitionUpdates.length,
    rerunRegistrationUpdates: rerunPlan.registrationUpdates.length,
  }, null, 2));

  return { before, plan, after, rerunPlan, applied: true };
};

if (require.main === module) {
  migrate()
    .catch((error) => {
      console.error(`Competition migration failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = {
  LEGACY_STATUS_MAP,
  classifyCategory,
  classifyType,
  mergeEligibilityIntoRequirements,
  buildMigrationPlan,
  captureSnapshot,
  migrate,
};
