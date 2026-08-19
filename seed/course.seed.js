require('dotenv').config();

const mongoose = require('mongoose');
const Course = require('../src/models/Course');

/**
 * frontendId values must match the courseData keys in the frontend:
 *   courses.tsx / programs.tsx
 *
 *   maths:           math-3 … math-12
 *   english:         english-1
 *   computerScience: cs-1, cs-2, cs-3
 */
const courses = [
  {
    frontendId: 'cs-1',
    title: 'Programming for Kids/Adults',
    description: 'A beginner-friendly introduction to programming concepts for learners of all ages.',
    category: 'programming',
    level: 'beginner',
    requiresDocument: false,
    imageUrl: '/cs/programming.jpg',
    syllabus: ['Variables & Data Types', 'Control Flow (if/else, loops)', 'Functions & Reusability', 'Basic OOP Concepts', 'Mini Project'],
    instructor: 'Mr. Daniel Kebede',
    duration: '10 weeks',
    requirements: ['Basic computer skills', 'Access to a laptop or desktop'],
    season: 'Fall 2026',
    maxStudents: 30,
  },
  {
    frontendId: 'cs-2',
    title: 'Introduction to Machine Learning',
    description: 'Learn the foundations of machine learning including supervised and unsupervised learning.',
    category: 'programming',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: '/cs/ml.jpg',
    syllabus: ['Python Review', 'NumPy & Pandas', 'Supervised Learning', 'Unsupervised Learning', 'Model Evaluation', 'Capstone Project'],
    instructor: 'Dr. Abebe Tessema',
    duration: '12 weeks',
    requirements: ['Basic Python programming', 'High school mathematics', 'English proficiency'],
    season: 'Fall 2026',
    maxStudents: 25,
  },
  {
    frontendId: 'cs-3',
    title: 'Computer Basics / Coding for Kids',
    description: 'An introduction to computers and basic coding tailored for young learners.',
    category: 'programming',
    level: 'beginner',
    requiresDocument: false,
    imageUrl: '/cs/basics.jpg',
    syllabus: ['What is a Computer?', 'Using a Keyboard & Mouse', 'Scratch Programming', 'Simple Animations', 'Fun Project'],
    instructor: 'Ms. Hana Mekonnen',
    duration: '8 weeks',
    requirements: ['Ages 6-12', 'Parental consent'],
    season: 'Fall 2026',
    maxStudents: 20,
  },
  {
    frontendId: 'english-1',
    title: 'English Language',
    description: 'Develop reading, writing, and communication skills in English.',
    category: 'language',
    level: 'all',
    requiresDocument: false,
    imageUrl: '/english/English-class.jpg',
    syllabus: ['Reading Comprehension', 'Grammar Fundamentals', 'Essay Writing', 'Speaking & Presentation', 'Vocabulary Building'],
    instructor: 'Mrs. Sara Tadesse',
    duration: '12 weeks',
    requirements: ['Basic literacy'],
    season: 'Fall 2026',
    maxStudents: 35,
  },
  {
    frontendId: 'math-3',
    title: 'Mathematics Grade 3',
    description: 'Mathematics curriculum for Grade 3.',
    category: 'mathematics',
    level: 'beginner',
    requiresDocument: true,
    imageUrl: '/math/Math-class-3.webp',
  },
  {
    frontendId: 'math-4',
    title: 'Mathematics Grade 4',
    description: 'Mathematics curriculum for Grade 4.',
    category: 'mathematics',
    level: 'beginner',
    requiresDocument: true,
    imageUrl: '/math/Math-class-4.webp',
  },
  {
    frontendId: 'math-5',
    title: 'Mathematics Grade 5',
    description: 'Mathematics curriculum for Grade 5.',
    category: 'mathematics',
    level: 'beginner',
    requiresDocument: true,
    imageUrl: '/math/Math-class-5.webp',
  },
  {
    frontendId: 'math-6',
    title: 'Mathematics Grade 6',
    description: 'Mathematics curriculum for Grade 6.',
    category: 'mathematics',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: '/math/Math-class-6.webp',
  },
  {
    frontendId: 'math-7',
    title: 'Mathematics Grade 7',
    description: 'Mathematics curriculum for Grade 7.',
    category: 'mathematics',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: '/math/Math-class-7.webp',
  },
  {
    frontendId: 'math-8',
    title: 'Mathematics Grade 8',
    description: 'Mathematics curriculum for Grade 8.',
    category: 'mathematics',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: '/math/Math-class-8.webp',
  },
  {
    frontendId: 'math-9',
    title: 'Mathematics Grade 9',
    description: 'Mathematics curriculum for Grade 9.',
    category: 'mathematics',
    level: 'advanced',
    requiresDocument: true,
    imageUrl: '/math/Math-class-9.webp',
  },
  {
    frontendId: 'math-10',
    title: 'Mathematics Grade 10',
    description: 'Mathematics curriculum for Grade 10.',
    category: 'mathematics',
    level: 'advanced',
    requiresDocument: true,
    imageUrl: '/math/Math-class-10.webp',
  },
  {
    frontendId: 'math-11',
    title: 'Mathematics Grade 11',
    description: 'Mathematics curriculum for Grade 11.',
    category: 'mathematics',
    level: 'advanced',
    requiresDocument: true,
    imageUrl: '/math/Math-class-11.webp',
  },
  {
    frontendId: 'math-12',
    title: 'Mathematics Grade 12',
    description: 'Mathematics curriculum for Grade 12.',
    category: 'mathematics',
    level: 'advanced',
    requiresDocument: true,
    imageUrl: '/math/Math-class-12.webp',
  },
  {
    frontendId: 'steam-1',
    title: 'STEAM Innovation',
    description: 'An interdisciplinary course integrating Science, Technology, Engineering, Art, and Mathematics.',
    category: 'science',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: null,
  },
];

const seedCourses = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    await Course.deleteMany();
    await Course.insertMany(courses);

    console.log(`✅ ${courses.length} courses seeded successfully`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Course seed failed:', error.message);
    process.exit(1);
  }
};

seedCourses();
