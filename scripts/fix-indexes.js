/**
 * One-time migration — drops stale non-sparse indexes on the users collection.
 * Run once if you see "GoogleId already exists" errors on new registrations.
 * Usage: node scripts/fix-indexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const dropIndex = async (collection, name) => {
  try {
    await collection.dropIndex(name);
    console.log(`✅ Dropped: ${name}`);
  } catch (err) {
    console.log(err.code === 27 ? `ℹ️  ${name} — not found, skipping` : `❌ ${name}: ${err.message}`);
  }
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.db.collection('users');
  await dropIndex(users, 'googleId_1');
  await dropIndex(users, 'username_1');
  console.log('\n✅ Done. Restart the server to recreate correct indexes.');
  process.exit(0);
};

run().catch((err) => { console.error('❌', err.message); process.exit(1); });
