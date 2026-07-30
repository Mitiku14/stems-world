/**
 * Creates the first admin account.
 * Run once: node seed/admin.seed.js
 * Required .env vars: ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('../src/models/User');
const { ROLES } = require('../src/constants');

const seedAdmin = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB Connected');

  const { ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_NAME || !ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('❌ Missing required env vars: ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD');
    process.exit(1);
  }

  const existing = await User.findOne({
    $or: [{ email: ADMIN_EMAIL }, { username: ADMIN_USERNAME.toLowerCase() }],
  });

  if (existing) {
    console.log('⚠️  Admin already exists — skipping seed.');
    return process.exit(0);
  }

  await User.create({
    name:            ADMIN_NAME,
    username:        ADMIN_USERNAME.toLowerCase(),
    email:           ADMIN_EMAIL,
    password:        await bcrypt.hash(ADMIN_PASSWORD, 12),
    role:            ROLES.ADMIN,
    isEmailVerified: true,
    isActive:        true,
  });

  console.log(`✅ Admin created: ${ADMIN_EMAIL}`);
  process.exit(0);
};

seedAdmin().catch((err) => {
  console.error('❌ Admin seed failed:', err.message);
  process.exit(1);
});
