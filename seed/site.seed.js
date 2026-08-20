/**
 * Seeds initial learning sites / physical locations.
 * Safe to run repeatedly (uses upsert by site name).
 * Run: node seed/site.seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Site = require('../src/models/Site');

const sites = [
  {
    name: 'Addis Ababa Site',
    address: 'Central Campus, Addis Ababa, Ethiopia',
    description: 'Main headquarters and primary learning hub.',
    isActive: true,
  },
  {
    name: 'Bole Site',
    address: 'Bole Road, near Friendship City Center, Addis Ababa, Ethiopia',
    description: 'Bole branch training center equipped with modern computer labs.',
    isActive: true,
  },
  {
    name: 'Piassa Site',
    address: 'Piassa Church Square, Addis Ababa, Ethiopia',
    description: 'Historic Piassa branch center for STEM and programming classes.',
    isActive: true,
  },
];

const seedSites = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI is not set in environment.');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    for (const siteData of sites) {
      await Site.findOneAndUpdate(
        { name: siteData.name },
        siteData,
        { upsert: true, new: true, runValidators: true }
      );
    }

    console.log(`✅ ${sites.length} sites seeded/updated successfully`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Site seed failed:', error.message);
    process.exit(1);
  }
};

seedSites();
