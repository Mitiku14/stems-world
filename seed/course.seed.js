require('dotenv').config();

const mongoose = require('mongoose');
const Course = require('../src/models/Course');

/**
 * frontendId values match the courseData keys in the frontend:
 *   maths:           math-3 … math-12
 *   english:         english-1
 *   computerScience: cs-1, cs-2, cs-3
 *   steam:           steam-1
 */
const courses = [
  {
    frontendId: 'cs-1',
    title: 'Programming for Kids/Adults',
    description:
      'This course provides a comprehensive introduction to fundamental computer programming for beginners of all ages. Students build foundational skills in computational thinking, algorithm design, control flow structures, and modular function design through practical hands-on coding exercises. Throughout the course, learners gain confidence in writing clean, structured code to solve real-world logic problems. By the end of the program, participants develop interactive mini-projects that demonstrate core programming principles.',
    category: 'technology',
    subcategory: 'programming',
    level: 'beginner',
    requiresDocument: false,
    imageUrl: '/cs/programming.jpg',
    syllabus: ['Variables & Data Types', 'Control Flow (if/else, loops)', 'Functions & Reusability', 'Basic OOP Concepts', 'Mini Project'],
    instructor: 'Mr. Daniel Kebede',
    duration: '10 weeks',
    requirements: ['Basic computer skills', 'Access to a laptop or desktop'],
    season: 'Fall 2026',
    maxStudents: 30,
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'cs-2',
    title: 'Introduction to Machine Learning',
    description:
      'An applied introduction to the foundational principles and practical algorithms of machine learning using modern tools and libraries. Students explore data preprocessing techniques, supervised learning models such as regression and classification, unsupervised clustering, and quantitative evaluation metrics. Practical coding exercises empower learners to prepare datasets, train predictive models, and diagnose performance. The course culminates in a capstone project where students build and evaluate their own machine learning solution.',
    category: 'technology',
    subcategory: 'machine_learning',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: '/cs/ml.jpg',
    syllabus: ['Python Review', 'NumPy & Pandas', 'Supervised Learning', 'Unsupervised Learning', 'Model Evaluation', 'Capstone Project'],
    instructor: 'Dr. Abebe Tessema',
    duration: '12 weeks',
    requirements: ['Basic Python programming', 'High school mathematics', 'English proficiency'],
    season: 'Fall 2026',
    maxStudents: 25,
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'cs-3',
    title: 'Computer Basics / Coding for Kids',
    description:
      'An engaging, age-appropriate course designed to introduce young learners to digital literacy and block-based programming concepts. Students explore basic computer hardware navigation, interactive Scratch coding, visual storytelling, and elementary problem-solving strategies. Creative hands-on activities foster logical thinking, creative design, and early technology confidence in a supportive environment. Learners complete the course with their own animated projects and interactive games.',
    category: 'technology',
    subcategory: 'computer_literacy',
    level: 'beginner',
    requiresDocument: false,
    imageUrl: '/cs/basics.jpg',
    syllabus: ['What is a Computer?', 'Using a Keyboard & Mouse', 'Scratch Programming', 'Simple Animations', 'Fun Project'],
    instructor: 'Ms. Hana Mekonnen',
    duration: '8 weeks',
    requirements: ['Ages 6-12', 'Parental consent'],
    season: 'Fall 2026',
    maxStudents: 20,
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'english-1',
    title: 'English Language',
    description:
      'A structured language program focused on enhancing reading comprehension, formal written expression, and effective verbal communication. Students expand their academic vocabulary, master key grammatical structures, analyze diverse literary and informative texts, and practice structured public speaking. Interactive classroom discussions and written assignments guide learners toward clear, articulate communication. This course prepares participants for success in academic, professional, and everyday English-speaking contexts.',
    category: 'arts',
    subcategory: 'language_arts',
    level: 'all',
    requiresDocument: false,
    imageUrl: '/english/English-class.jpg',
    syllabus: ['Reading Comprehension', 'Grammar Fundamentals', 'Essay Writing', 'Speaking & Presentation', 'Vocabulary Building'],
    instructor: 'Mrs. Sara Tadesse',
    duration: '12 weeks',
    requirements: ['Basic literacy'],
    season: 'Fall 2026',
    maxStudents: 35,
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-3',
    title: 'Mathematics Grade 3',
    description:
      'A foundational mathematics course tailored for Grade 3 students to build strong numerical fluency and core problem-solving abilities. Learners master multi-digit addition and subtraction, introductory multiplication and division concepts, basic geometric shapes, and simple data representation. Guided exercises and relatable story problems help students connect mathematical operations to everyday experiences. By working through structured practice, young learners build confidence and intuition in fundamental mathematics.',
    category: 'mathematics',
    subcategory: 'elementary_mathematics',
    level: 'beginner',
    requiresDocument: true,
    imageUrl: '/math/Math-class-3.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-4',
    title: 'Mathematics Grade 4',
    description:
      'An interactive Grade 4 mathematics curriculum focused on expanding computational skills and developing structured logical reasoning. Students explore multi-digit multiplication, long division algorithms, introductory fraction concepts, perimeter, and area measurements. Step-by-step problem-solving activities encourage students to analyze mathematical patterns and apply arithmetic operations accurately. The course prepares learners for upper elementary mathematics by strengthening their quantitative understanding and accuracy.',
    category: 'mathematics',
    subcategory: 'elementary_mathematics',
    level: 'beginner',
    requiresDocument: true,
    imageUrl: '/math/Math-class-4.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-5',
    title: 'Mathematics Grade 5',
    description:
      'A comprehensive Grade 5 mathematics program designed to deepen understanding of rational numbers and spatial geometric reasoning. Students develop fluency in fraction arithmetic, decimal operations, volume calculations, and basic coordinate grid plotting. Engaging problem sets guide learners in analyzing mathematical relationships and evaluating solution strategies. This curriculum establishes a solid quantitative bridge to prepare students for middle school mathematics coursework.',
    category: 'mathematics',
    subcategory: 'elementary_mathematics',
    level: 'beginner',
    requiresDocument: true,
    imageUrl: '/math/Math-class-5.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-6',
    title: 'Mathematics Grade 6',
    description:
      'A transition-level Grade 6 mathematics curriculum introducing early algebraic concepts and quantitative ratio analysis. Students master unit rates, percentage applications, variable expressions, single-variable equations, and basic statistical distributions. Guided problem sets emphasize analytical reasoning, data interpretation, and mathematical communication. By connecting abstract concepts to real-world situations, students build the foundational skills necessary for success in middle school STEM subjects.',
    category: 'mathematics',
    subcategory: 'middle_school_mathematics',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: '/math/Math-class-6.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-7',
    title: 'Mathematics Grade 7',
    description:
      'An intermediate Grade 7 mathematics course centered on proportional reasoning, rational number operations, and algebraic problem-solving techniques. Students investigate linear equations, scale drawings, probability concepts, surface area calculations, and geometric constructions. Collaborative activities and structured practice problems develop critical thinking and mathematical precision. Learners emerge with a strong conceptual foundation for pre-algebraic topics and high school mathematics.',
    category: 'mathematics',
    subcategory: 'middle_school_mathematics',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: '/math/Math-class-7.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-8',
    title: 'Mathematics Grade 8',
    description:
      'A rigorous Grade 8 mathematics course providing essential pre-algebra skills and geometric transformation principles. Students study linear functions, systems of equations, irrational numbers, the Pythagorean theorem, and bivariate data relationships. Hands-on exercises emphasize slope analysis, graphical representations, and algebraic modeling. The course provides comprehensive preparation for high school Algebra I and foundational geometry.',
    category: 'mathematics',
    subcategory: 'pre_algebra',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: '/math/Math-class-8.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-9',
    title: 'Mathematics Grade 9',
    description:
      'An advanced Grade 9 mathematics curriculum covering core algebraic structures, functional analysis, and mathematical modeling. Students analyze linear and quadratic equations, polynomial operations, exponential growth functions, and coordinate geometry. Structured lessons emphasize step-by-step problem-solving, graphical interpretation, and formal mathematical arguments. Learners build rigorous quantitative reasoning skills that serve as the foundation for higher-level high school mathematics.',
    category: 'mathematics',
    subcategory: 'algebra',
    level: 'advanced',
    requiresDocument: true,
    imageUrl: '/math/Math-class-9.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-10',
    title: 'Mathematics Grade 10',
    description:
      'A comprehensive Grade 10 mathematics course exploring synthetic plane geometry, trigonometry, and advanced algebraic concepts. Students investigate geometric proof structures, right-triangle trigonometry, circle theorems, polynomial expressions, and logarithmic properties. Rigorous problem-solving assignments refine logical deduction and analytical thinking skills. This course prepares students for upper-level STEM subjects and college-preparatory mathematics examinations.',
    category: 'mathematics',
    subcategory: 'geometry_trigonometry',
    level: 'advanced',
    requiresDocument: true,
    imageUrl: '/math/Math-class-10.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-11',
    title: 'Mathematics Grade 11',
    description:
      'An advanced Grade 11 mathematics curriculum focusing on pre-calculus topics, trigonometric identities, and functional analysis. Students examine polynomial, rational, exponential, and logarithmic functions along with sequences, series, and analytic geometry. Mathematical modeling projects guide learners in applying advanced functions to physical and real-world phenomena. The curriculum equips students with the technical precision required for calculus and university-level STEM coursework.',
    category: 'mathematics',
    subcategory: 'pre_calculus',
    level: 'advanced',
    requiresDocument: true,
    imageUrl: '/math/Math-class-11.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'math-12',
    title: 'Mathematics Grade 12',
    description:
      'A college-preparatory Grade 12 mathematics program mastering differential and integral calculus concepts. Students solve rate-of-change problems, evaluate limits, compute derivatives and integrals, and explore practical optimization models. Through structured analytical exercises, learners apply calculus techniques to real-world scientific and economic scenarios. This course offers thorough academic preparation for university degrees in engineering, computer science, and physical sciences.',
    category: 'mathematics',
    subcategory: 'calculus',
    level: 'advanced',
    requiresDocument: true,
    imageUrl: '/math/Math-class-12.webp',
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
  {
    frontendId: 'steam-1',
    title: 'STEAM Innovation',
    description:
      'An interdisciplinary project-based course integrating Science, Technology, Engineering, Art, and Mathematics. Students collaborate on hands-on innovation projects combining basic electronics, creative visual design, physical prototyping, and scientific investigation methods. Interactive team challenges foster critical technical skills, design thinking, and innovative problem-solving techniques. Learners complete the course by designing and presenting a functional integrated STEAM artifact.',
    category: 'engineering',
    subcategory: 'interdisciplinary',
    level: 'intermediate',
    requiresDocument: true,
    imageUrl: null,
    isActive: true,
    registrationOpenDate: new Date('2026-08-01T00:00:00Z'),
    registrationCloseDate: new Date('2026-09-30T23:59:59Z'),
  },
];

const seedCourses = async () => {
  try {
    // Static check for frontendId presence and uniqueness before database execution
    const frontendIds = courses.map((c) => c.frontendId);
    if (frontendIds.some((id) => !id)) {
      throw new Error('One or more seed courses are missing a frontendId');
    }
    const uniqueIds = new Set(frontendIds);
    if (uniqueIds.size !== courses.length) {
      throw new Error('Duplicate frontendId values found in course seed data');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    let updatedCount = 0;
    for (const courseData of courses) {
      await Course.updateOne(
        { frontendId: courseData.frontendId },
        {
          $set: {
            frontendId: courseData.frontendId,
            title: courseData.title,
            description: courseData.description,
            category: courseData.category,
            subcategory: courseData.subcategory,
            level: courseData.level,
            requiresDocument: courseData.requiresDocument ?? false,
            imageUrl: courseData.imageUrl || null,
            syllabus: courseData.syllabus || [],
            instructor: courseData.instructor || null,
            duration: courseData.duration || null,
            requirements: courseData.requirements || [],
            season: courseData.season || null,
            maxStudents: courseData.maxStudents || null,
            isActive: true,
            registrationOpenDate: courseData.registrationOpenDate || null,
            registrationCloseDate: courseData.registrationCloseDate || null,
          },
        },
        { upsert: true, runValidators: true }
      );
      updatedCount++;
    }

    console.log(`✅ ${updatedCount} courses seeded/updated successfully (in-place)`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Course seed failed:', error.message);
    process.exit(1);
  }
};

seedCourses();
