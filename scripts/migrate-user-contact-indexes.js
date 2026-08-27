require('dotenv').config();

const mongoose = require('mongoose');
const normalizePhone = require('../src/utils/normalizePhone');
const { AUTH_PROVIDERS } = require('../src/constants');

const PHONE_CATEGORIES = Object.freeze({
  SAFE_NORMALIZATION: 'SAFE_NORMALIZATION',
  INVALID: 'INVALID',
  AMBIGUOUS: 'AMBIGUOUS',
  DUPLICATE: 'DUPLICATE',
  EMPTY: 'EMPTY',
  MISSING: 'MISSING',
});

const PHONE_INDEX = Object.freeze({
  key: { phone: 1 },
  options: {
    name: 'user_phone_unique_present',
    unique: true,
    partialFilterExpression: { phone: { $type: 'string' } },
  },
});

const FUTURE_EMAIL_INDEX = Object.freeze({
  key: { email: 1 },
  options: {
    name: 'user_email_unique_present',
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
  },
  phase: 'FUTURE — apply only when phone-only accounts and optional email are activated',
});

const idString = (value) => String(value?._id || value?.userId || value || '');
const isApplyRequested = (argv = process.argv) => argv.includes('--apply');

const classifyPhone = (value) => {
  if (value === null || value === undefined) {
    return { category: PHONE_CATEGORIES.MISSING, normalized: null };
  }
  if (typeof value === 'string' && !value.trim()) {
    return { category: PHONE_CATEGORIES.EMPTY, normalized: null };
  }

  try {
    return {
      category: PHONE_CATEGORIES.SAFE_NORMALIZATION,
      normalized: normalizePhone(value),
    };
  } catch {
    const text = typeof value === 'string' ? value.trim() : '';
    const digitsAndSeparatorsOnly = /^[\d\s-]+$/.test(text);
    const missingInternationalPrefix = digitsAndSeparatorsOnly && !text.startsWith('0');
    const internationalDialPrefix = /^00/.test(text.replace(/[\s-]/g, ''));
    return {
      category: missingInternationalPrefix || internationalDialPrefix
        ? PHONE_CATEGORIES.AMBIGUOUS
        : PHONE_CATEGORIES.INVALID,
      normalized: null,
    };
  }
};

const duplicateGroups = (records, valueFor) => {
  const groups = new Map();
  for (const record of records) {
    const value = valueFor(record);
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(idString(record));
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([value, userIds]) => ({ value, userIds }));
};

const summarizeIndexes = (indexes) => indexes.map((index) => ({
  name: index.name,
  key: index.key,
  unique: index.unique === true,
  sparse: index.sparse === true,
  partialFilterExpression: index.partialFilterExpression || null,
}));

const buildContactPlan = (users, indexes = []) => {
  const classified = users.map((user) => ({
    userId: idString(user),
    original: user.phone,
    ...classifyPhone(user.phone),
  }));
  const safeRecords = classified.filter(({ category }) => (
    category === PHONE_CATEGORIES.SAFE_NORMALIZATION
  ));
  const canonicalDuplicates = duplicateGroups(safeRecords, ({ normalized }) => normalized);
  const duplicateNumbers = new Set(canonicalDuplicates.map(({ value }) => value));
  const phoneRecords = classified.map((record) => (
    duplicateNumbers.has(record.normalized)
      ? { ...record, category: PHONE_CATEGORIES.DUPLICATE }
      : record
  ));

  const duplicateEmails = duplicateGroups(users, ({ email }) => (
    typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null
  ));
  const missingEmailUsers = users
    .filter(({ email }) => typeof email !== 'string' || !email.trim())
    .map(idString);

  const updates = phoneRecords
    .filter(({ category }) => category === PHONE_CATEGORIES.SAFE_NORMALIZATION)
    .filter((record) => {
      const user = users.find(({ _id }) => idString(_id) === record.userId);
      return user.phone !== record.normalized;
    })
    .map(({ userId, normalized }) => ({ userId, phone: normalized, isPhoneVerified: false }));

  return {
    summary: {
      totalUsers: users.length,
      usersWithPhone: users.filter(({ phone }) => phone !== null && phone !== undefined).length,
      usersWithoutPhone: users.filter(({ phone }) => phone === null || phone === undefined).length,
      emptyPhoneStrings: phoneRecords.filter(({ category }) => category === PHONE_CATEGORIES.EMPTY).length,
      safeNormalizations: phoneRecords.filter(({ category }) => category === PHONE_CATEGORIES.SAFE_NORMALIZATION).length,
      invalidPhones: phoneRecords.filter(({ category }) => category === PHONE_CATEGORIES.INVALID).length,
      ambiguousPhones: phoneRecords.filter(({ category }) => category === PHONE_CATEGORIES.AMBIGUOUS).length,
      duplicateCanonicalPhones: canonicalDuplicates.length,
      duplicateEmails: duplicateEmails.length,
      missingEmails: missingEmailUsers.length,
      googleUsers: users.filter(({ authProvider }) => authProvider === AUTH_PROVIDERS.GOOGLE).length,
      localUsers: users.filter(({ authProvider }) => authProvider === AUTH_PROVIDERS.LOCAL).length,
    },
    phoneValues: phoneRecords,
    normalizedPhoneCandidates: phoneRecords
      .filter(({ normalized }) => normalized)
      .map(({ userId, original, normalized, category }) => ({ userId, original, normalized, category })),
    canonicalPhoneDuplicates: canonicalDuplicates,
    duplicateEmails,
    missingEmailUsers,
    currentIndexes: summarizeIndexes(indexes),
    plannedPhoneUpdates: updates,
    plannedPhoneIndex: PHONE_INDEX,
    futureEmailPartialIndex: FUTURE_EMAIL_INDEX,
  };
};

const assertSafeApplyTarget = ({ nodeEnv, host, database, argv = process.argv }) => {
  if (!argv.includes('--apply')) {
    throw new Error('Write mode requires --apply');
  }
  if (nodeEnv !== 'development') {
    throw new Error('Refusing User contact migration outside NODE_ENV=development');
  }
  if (!argv.includes('--confirm-development')) {
    throw new Error('Pass --confirm-development after verifying the database host and name');
  }
  if (!argv.includes('--confirm-user-contact-indexes')) {
    throw new Error('Pass --confirm-user-contact-indexes to acknowledge the contact identity changes');
  }

  const target = `${host || ''} ${database || ''}`;
  const looksProduction = /(^|[-_.])(prod|production)([-_.]|$)/i.test(target);
  const provenNonProductionDatabase = /(dev|development|test|demo)/i.test(database || '');
  if (!host || !database || looksProduction || !provenNonProductionDatabase) {
    throw new Error('User contact migration target could not be proven to be a safe development/test database');
  }
};

const assertNoPhoneConflicts = (plan) => {
  const blockers = [];
  if (plan.summary.duplicateCanonicalPhones > 0) {
    blockers.push('DUPLICATE — MANUAL PRODUCT/DATA DECISION REQUIRED');
  }
  if (plan.summary.invalidPhones > 0) blockers.push('INVALID phone values');
  if (plan.summary.ambiguousPhones > 0) blockers.push('AMBIGUOUS phone values');
  if (plan.summary.emptyPhoneStrings > 0) blockers.push('empty phone strings');
  if (blockers.length > 0) {
    throw new Error(`Refusing apply while contact conflicts remain: ${blockers.join('; ')}`);
  }
};

const isExpectedPhoneIndex = (index) => (
  index.name === PHONE_INDEX.options.name
  && index.key?.phone === 1
  && index.unique === true
  && index.partialFilterExpression?.phone?.$type === 'string'
);

const assertCompatiblePhoneIndexes = (indexes) => {
  const phoneIndexes = indexes.filter((index) => index.key?.phone !== undefined);
  const incompatible = phoneIndexes.filter((index) => !isExpectedPhoneIndex(index));
  if (incompatible.length > 0) {
    throw new Error(
      `Existing phone indexes require manual review before apply: ${incompatible.map(({ name }) => name).join(', ')}`
    );
  }
};

const migrate = async ({
  apply = isApplyRequested(),
  argv = process.argv,
} = {}) => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

  await mongoose.connect(process.env.MONGODB_URI);
  const usersCollection = mongoose.connection.collection('users');
  const target = {
    NODE_ENV: process.env.NODE_ENV || '<unset>',
    databaseHost: mongoose.connection.host || '<unknown>',
    databaseName: mongoose.connection.name || '<unknown>',
  };
  const users = await usersCollection.find({}).sort({ _id: 1 }).toArray();
  const indexes = await usersCollection.indexes();
  const before = buildContactPlan(users, indexes);

  console.log(JSON.stringify({
    migrationMode: apply ? 'APPLY REQUESTED' : 'DRY RUN — NO WRITES',
    target,
    report: before,
  }, null, 2));

  if (!apply) return { applied: false, before, after: before };

  assertSafeApplyTarget({
    nodeEnv: process.env.NODE_ENV,
    host: mongoose.connection.host,
    database: mongoose.connection.name,
    argv,
  });
  assertNoPhoneConflicts(before);
  assertCompatiblePhoneIndexes(indexes);

  if (before.plannedPhoneUpdates.length > 0) {
    await mongoose.connection.transaction(async (session) => {
      await usersCollection.bulkWrite(
        before.plannedPhoneUpdates.map(({ userId, phone, isPhoneVerified }) => ({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(userId) },
            update: { $set: { phone, isPhoneVerified } },
          },
        })),
        { ordered: true, session }
      );
    });
  }

  if (!indexes.some(isExpectedPhoneIndex)) {
    await usersCollection.createIndex(PHONE_INDEX.key, PHONE_INDEX.options);
  }

  const afterUsers = await usersCollection.find({}).sort({ _id: 1 }).toArray();
  const afterIndexes = await usersCollection.indexes();
  const after = buildContactPlan(afterUsers, afterIndexes);
  if (after.plannedPhoneUpdates.length > 0) {
    throw new Error('User contact migration is not idempotent; planned phone updates remain');
  }

  console.log(JSON.stringify({
    migrationMode: 'APPLIED',
    usersDeleted: 0,
    userIdsChanged: 0,
    after,
  }, null, 2));
  return { applied: true, before, after };
};

if (require.main === module) {
  migrate()
    .catch((error) => {
      console.error(`User contact migration failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = {
  PHONE_CATEGORIES,
  PHONE_INDEX,
  FUTURE_EMAIL_INDEX,
  classifyPhone,
  isApplyRequested,
  buildContactPlan,
  assertSafeApplyTarget,
  assertNoPhoneConflicts,
  assertCompatiblePhoneIndexes,
  migrate,
};
