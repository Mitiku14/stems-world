require('dotenv').config();

const mongoose = require('mongoose');
const Competition = require('../src/models/Competition');

const COMPETITION_SEEDS = [
  {
    title: 'National Coding Hackathon 2026',
    description: 'A national team coding challenge focused on solving real-world problems with technology.',
    category: 'steam_innovation',
    type: 'team',
    scope: 'national',
    imageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80',
    registrationOpenDate: new Date('2026-08-01T00:00:00.000Z'),
    registrationCloseDate: new Date('2026-10-01T00:00:00.000Z'),
    eventStartDate: new Date('2026-10-15T00:00:00.000Z'),
    eventEndDate: new Date('2026-10-17T00:00:00.000Z'),
    location: 'AfriSTEAM Main Campus, Addis Ababa',
    requirements: [
      'Open to high school students in Grades 9-12',
      'Laptop',
      'Basic programming knowledge',
      'Team of 3-5 members',
    ],
    maxRegistrations: 50,
    status: 'published',
    organizer: 'AfriSTEAM Foundation',
    contactEmail: 'hackathons@afristeam.com',
  },
  {
    title: 'Robotics Challenge - Regional Qualifier',
    description: 'An individual robotics challenge to design and program a robot for an obstacle course.',
    category: 'steam_innovation',
    type: 'individual',
    scope: 'local',
    imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80',
    registrationOpenDate: new Date('2026-09-01T00:00:00.000Z'),
    registrationCloseDate: new Date('2026-09-21T00:00:00.000Z'),
    eventStartDate: new Date('2026-10-15T00:00:00.000Z'),
    eventEndDate: new Date('2026-10-15T00:00:00.000Z'),
    location: 'Bole Youth Center',
    requirements: [
      'Middle school students in Grades 6-8',
      'School ID',
      'Robotics kit provided',
    ],
    maxRegistrations: 30,
    status: 'published',
    organizer: 'AfriSTEAM Robotics Division',
    contactEmail: 'robotics@afristeam.com',
  },
  {
    title: 'AI Innovation Workshop',
    description: 'An individual artificial-intelligence innovation challenge for students.',
    category: 'steam_innovation',
    type: 'individual',
    scope: 'local',
    imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80',
    registrationOpenDate: new Date('2026-05-01T00:00:00.000Z'),
    registrationCloseDate: new Date('2026-06-01T00:00:00.000Z'),
    eventStartDate: new Date('2026-06-06T00:00:00.000Z'),
    eventEndDate: new Date('2026-06-07T00:00:00.000Z'),
    location: 'Virtual',
    requirements: ['Open to all students', 'Internet connection', 'Computer'],
    maxRegistrations: 100,
    status: 'completed',
    organizer: 'AfriSTEAM Tech Labs',
    contactEmail: 'hello@afristeam.com',
  },
];

const ensureSeedCompetitions = async (Model = Competition) => {
  if (typeof Model.init === 'function') await Model.init();
  const timestamp = new Date();

  const result = await Model.bulkWrite(
    COMPETITION_SEEDS.map((competition) => ({
      updateOne: {
        filter: { title: competition.title },
        update: {
          $setOnInsert: {
            ...competition,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        },
        upsert: true,
        timestamps: false,
      },
    })),
    { ordered: false }
  );

  return {
    expectedCount: COMPETITION_SEEDS.length,
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
    upsertedCount: result.upsertedCount || 0,
  };
};

const seedCompetitions = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/afristeam');
  console.log('MongoDB connected');

  const result = await ensureSeedCompetitions();
  console.log(JSON.stringify({ message: 'Competition seed complete', ...result }, null, 2));
};

if (require.main === module) {
  seedCompetitions()
    .catch((error) => {
      console.error(`Competition seed failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { COMPETITION_SEEDS, ensureSeedCompetitions, seedCompetitions };
