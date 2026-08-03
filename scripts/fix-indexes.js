/**
 * Fixes the googleId index issue:
 * 1. Removes `googleId` field from all documents where it is null
 *    (sparse indexes only skip absent fields, not explicit nulls)
 * 2. Drops and re-syncs indexes from the Mongoose schema
 *
 * Run once:  node scripts/fix-indexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB Connected');

  const collection = User.collection;

  // Step 1: Unset googleId from all documents where it is null
  const result = await collection.updateMany(
    { googleId: null },
    { $unset: { googleId: '' } }
  );
  console.log(`\n🔧 Removed explicit null googleId from ${result.modifiedCount} document(s).`);

  // Step 2: Drop and re-sync indexes
  const indexes = await collection.indexes();
  console.log('\n📋 Current indexes:');
  indexes.forEach((idx) => console.log(`   ${idx.name}  →  ${JSON.stringify(idx.key)}  sparse=${!!idx.sparse}`));

  const googleIdIdx = indexes.find((idx) => idx.key && idx.key.googleId !== undefined);
  if (googleIdIdx) {
    console.log(`\n🗑️  Dropping index "${googleIdIdx.name}" ...`);
    await collection.dropIndex(googleIdIdx.name);
  }

  console.log('\n🔄 Syncing indexes from schema ...');
  await User.syncIndexes();
  console.log('✅ Indexes synced successfully.');

  const newIndexes = await collection.indexes();
  console.log('\n📋 Final indexes:');
  newIndexes.forEach((idx) => console.log(`   ${idx.name}  →  ${JSON.stringify(idx.key)}  sparse=${!!idx.sparse}`));

  process.exit(0);
})().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
