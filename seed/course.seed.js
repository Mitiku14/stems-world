require('dotenv').config();

const mongoose = require('mongoose');
const Course = require('../src/models/Course');

const courses = [
  {
    title: 'Programming for Kids/Adults',
    description: 'A beginner-friendly introduction to programming concepts for learners of all ages.',
    category: 'programming',
    level: 'beginner',
    requiresDocument: false,
  },
  {
    title: 'Introduction to Machine Learning',
    description: 'Learn the foundations of machine learning including supervised and unsupervised learning.',
    category: 'programming',
    level: 'intermediate',
    requiresDocument: true,
  },
  {
    title: 'Computer Basics / Coding for Kids',
    description: 'An introduction to computers and basic coding tailored for young learners.',
    category: 'programming',
    level: 'beginner',
    requiresDocument: false,
  },
  {
    title: 'Mathematics Grade 3–12',
    description: 'Comprehensive mathematics curriculum covering Grade 3 through Grade 12.',
    category: 'mathematics',
    level: 'all',
    requiresDocument: true,
  },
  {
    title: 'English Language',
    description: 'Develop reading, writing, and communication skills in English.',
    category: 'language',
    level: 'all',
    requiresDocument: false,
  },
  {
    title: 'STEAM Innovation',
    description: 'An interdisciplinary course integrating Science, Technology, Engineering, Art, and Mathematics.',
    category: 'science',
    level: 'intermediate',
    requiresDocument: true,
  },
];

const seedCourses = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    await Course.deleteMany();
    await Course.insertMany(courses);

    console.log(`✅ ${courses.length} Courses Seeded Successfully`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Course seed failed:', error.message);
    process.exit(1);
  }
};

seedCourses();
