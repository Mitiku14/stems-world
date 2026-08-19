require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('../src/models/Competition');

const competitions = [
  {
    title: 'National Coding Hackathon 2026',
    description: 'The premier national coding competition bringing together standard high school teams to solve real-world problems using technology. Show off your team\'s skills in front of top tech industry judges.',
    type: 'hackathon',
    scope: 'national',
    imageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80',
    registrationOpenDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // opened 7 days ago
    registrationCloseDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // closes in 14 days
    eventStartDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    eventEndDate: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000),
    location: 'AfriSTEAM Main Campus, Addis Ababa',
    eligibility: 'Open to all high school students (Grades 9-12)',
    requirements: ['Laptop', 'Basic programming knowledge', 'Team of 3-5 members'],
    maxParticipants: 50, // meaning 50 teams if registrations act like teams
    status: 'open',
    organizer: 'AfriSTEAM Foundation',
    contactEmail: 'hackathons@afristeam.com'
  },
  {
    title: 'Robotics Challenge - Regional Qualifier',
    description: 'Design, build, and program a robot to navigate through an obstacle course. Winners proceed to the National Finals.',
    type: 'competition',
    scope: 'local',
    imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80',
    registrationOpenDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // opens next week
    registrationCloseDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    eventStartDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    eventEndDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    location: 'Bole Youth Center',
    eligibility: 'Middle school students (Grades 6-8)',
    requirements: ['School ID', 'Robotics Kit (Provided)'],
    maxParticipants: 30,
    status: 'upcoming',
    organizer: 'AfriSTEAM Robotics Division',
    contactEmail: 'robotics@afristeam.com'
  },
  {
    title: 'AI Innovation Workshop',
    description: 'An intensive weekend workshop for students passionate about Artificial Intelligence and prompt engineering.',
    type: 'workshop',
    scope: 'local',
    imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80',
    registrationOpenDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
    registrationCloseDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // recently closed
    eventStartDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // started 2 days ago
    eventEndDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // ended yesterday
    location: 'Virtual (Zoom)',
    eligibility: 'All students',
    requirements: ['Internet Connection', 'Computer'],
    maxParticipants: 100,
    status: 'completed',
    organizer: 'AfriSTEAM Tech Labs',
    contactEmail: 'hello@afristeam.com'
  }
];

const seedCompetitions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/afristeam');
    console.log('✅ MongoDB connected');

    await Competition.deleteMany({});
    console.log('🧹 Existing competitions cleared');

    await Competition.insertMany(competitions);
    console.log(`✅ Successfully seeded ${competitions.length} competitions`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding competitions:', error);
    process.exit(1);
  }
};

seedCompetitions();
