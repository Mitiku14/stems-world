/**
 * Admin Seed Script
 * -----------------
 * Creates the first admin account.
 * Run once: node seed/admin.seed.js
 *
 * Credentials are read from .env — never hardcode them here.
 *
 * Required .env variables:
 *   ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const { ROLES } = require('../src/constants');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    const { ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    if (!ADMIN_NAME || !ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      console.error('❌ Missing admin seed variables in .env');
      console.error('   Required: ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD');
      process.exit(1);
    }

    const existing = await User.findOne({
      $or: [{ email: ADMIN_EMAIL }, { username: ADMIN_USERNAME.toLowerCase() }],
    });

    if (existing) {
      console.log('⚠️  Admin already exists — skipping seed.');
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await User.create({
      name: ADMIN_NAME,
      username: ADMIN_USERNAME.toLowerCase(),
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: ROLES.ADMIN,
      isEmailVerified: true, // admin accounts are pre-verified
      isActive: true,
    });

    console.log(`✅ Admin created: ${ADMIN_EMAIL}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Admin seed failed:', error.message);
    process.exit(1);
  }
};

seedAdmin();
