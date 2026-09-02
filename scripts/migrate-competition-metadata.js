require('dotenv').config();

const { MongoClient } = require('mongoose').mongo;
const { COMPETITION_SCOPES } = require('../src/constants');

const hasValue = (value) => value !== undefined && value !== null && value !== '';
const idString = (value) => String(value || '<missing>');

const parseDate = (value) => {
  if (!hasValue(value)) return { present: false, valid: false, date: null };
  const date = value instanceof Date ? value : new Date(value);
  return {
    present: true,
    valid: !Number.isNaN(date.getTime()),
    date: Number.isNaN(date.getTime()) ? null : date,
  };
};

const auditCompetitionMetadata = (competitions) => {
  const issues = [];
  const inspectedCompetitions = [];

  const addCompetitionIssue = (competition, type, details = {}) => {
    issues.push({
      type,
      competitionId: idString(competition._id),
      title: competition.title || '<untitled>',
      ...details,
    });
  };

  for (const competition of competitions) {
    const rounds = Array.isArray(competition.rounds) ? competition.rounds : [];
    inspectedCompetitions.push({
      competitionId: idString(competition._id),
      title: competition.title || '<untitled>',
      scope: hasValue(competition.scope) ? competition.scope : '<missing>',
      roundIds: rounds.map((round) => idString(round?._id)),
    });

    if (competition.scope === 'local') {
      addCompetitionIssue(competition, 'legacy_local_scope', {
        currentScope: competition.scope,
        actionRequired: 'Classify explicitly as one approved Competition scope; no automatic mapping is safe.',
      });
    } else if (!COMPETITION_SCOPES.includes(competition.scope)) {
      addCompetitionIssue(competition, hasValue(competition.scope) ? 'unknown_scope' : 'missing_scope', {
        currentScope: hasValue(competition.scope) ? competition.scope : '<missing>',
        actionRequired: 'Supply one approved Competition scope after review.',
      });
    }

    const competitionStart = parseDate(competition.eventStartDate);
    const competitionEnd = parseDate(competition.eventEndDate);
    if (competitionStart.present && !competitionStart.valid) {
      addCompetitionIssue(competition, 'invalid_competition_event_start', {
        value: competition.eventStartDate,
      });
    }
    if (competitionEnd.present && !competitionEnd.valid) {
      addCompetitionIssue(competition, 'invalid_competition_event_end', {
        value: competition.eventEndDate,
      });
    }

    rounds.forEach((round, roundIndex) => {
      const roundDetails = {
        roundId: idString(round?._id),
        roundIndex,
        roundOrder: round?.order ?? '<missing>',
        roundName: round?.name || '<unnamed>',
      };
      const roundStart = parseDate(round?.eventStartsDate);
      const roundEnd = parseDate(round?.eventEndDate);

      if (!roundStart.present) {
        addCompetitionIssue(competition, 'missing_round_event_start', roundDetails);
      } else if (!roundStart.valid) {
        addCompetitionIssue(competition, 'invalid_round_event_start', {
          ...roundDetails,
          value: round.eventStartsDate,
        });
      }

      if (!roundEnd.present) {
        addCompetitionIssue(competition, 'missing_round_event_end', roundDetails);
      } else if (!roundEnd.valid) {
        addCompetitionIssue(competition, 'invalid_round_event_end', {
          ...roundDetails,
          value: round.eventEndDate,
        });
      }

      if (!roundStart.valid || !roundEnd.valid) return;

      if (roundStart.date.getTime() === roundEnd.date.getTime()) {
        addCompetitionIssue(competition, 'equal_round_dates', roundDetails);
      } else if (roundStart.date > roundEnd.date) {
        addCompetitionIssue(competition, 'reversed_round_dates', roundDetails);
      }
      if (competitionStart.valid && roundStart.date < competitionStart.date) {
        addCompetitionIssue(competition, 'round_before_competition_start', roundDetails);
      }
      if (competitionEnd.valid && roundEnd.date > competitionEnd.date) {
        addCompetitionIssue(competition, 'round_after_competition_end', roundDetails);
      }
    });
  }

  const issueCounts = issues.reduce((counts, issue) => {
    counts[issue.type] = (counts[issue.type] || 0) + 1;
    return counts;
  }, {});

  return {
    mode: 'DRY_RUN_AUDIT_ONLY',
    applySupported: false,
    writesPerformed: 0,
    indexChanges: 0,
    competitionCount: competitions.length,
    blockingIssueCount: issues.length,
    deploymentBlocked: issues.length > 0,
    issueCounts,
    inspectedCompetitions,
    issues,
    requiredNextStep: issues.length > 0
      ? 'Provide reviewed scope classifications and round dates, then use a separately reviewed migration that preserves all Competition and embedded round IDs.'
      : 'No metadata violations detected by this audit. Complete independent verification before deploying the strict schema.',
  };
};

const run = async () => {
  if (process.argv.includes('--apply') || process.argv.includes('--write')) {
    throw new Error('This Phase A tool is audit-only. Apply/write mode is intentionally not implemented.');
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required for the read-only Competition metadata audit.');

  const client = new MongoClient(uri, { readPreference: 'primaryPreferred' });
  try {
    await client.connect();
    const database = client.db();
    const competitions = await database.collection('competitions').find({}, {
      projection: {
        title: 1,
        scope: 1,
        eventStartDate: 1,
        eventEndDate: 1,
        rounds: 1,
      },
    }).sort({ _id: 1 }).toArray();
    const report = auditCompetitionMetadata(competitions);
    console.log(JSON.stringify({ database: database.databaseName, ...report }, null, 2));
    if (report.deploymentBlocked) process.exitCode = 2;
  } finally {
    await client.close();
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(`Competition metadata audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  auditCompetitionMetadata,
  parseDate,
  run,
};
