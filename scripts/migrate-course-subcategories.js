require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');
const Course = require('../src/models/Course');
const CourseSubcategory = require('../src/models/CourseSubcategory');
const { ensureInitialCourseSubcategories } = require('../seed/courseSubcategory.seed');

const normalizeCourses = (courses) => courses.map((course) => ({
  id: String(course._id),
  category: course.category ?? null,
  subcategory: course.subcategory ?? null,
  frontendId: course.frontendId ?? null,
  sites: (course.sites || []).map(String).sort(),
  resources: (course.resources || []).map((resource) => String(resource?._id || resource)).sort(),
}));

const sha256 = (value) => crypto.createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const snapshotCourses = async () => normalizeCourses(await Course.find({})
  .select('_id category subcategory frontendId sites resources')
  .sort({ _id: 1 })
  .lean());

const migrate = async () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Refusing Course subcategory migration outside NODE_ENV=development');
  }
  if (!process.argv.includes('--confirm-development')) {
    throw new Error('Pass --confirm-development after verifying the database host and name');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const host = mongoose.connection.host;
  const database = mongoose.connection.name;
  const beforeCourses = await snapshotCourses();
  const beforeSubcategories = await CourseSubcategory.countDocuments({});

  const migration = await ensureInitialCourseSubcategories();

  const managed = await CourseSubcategory.find({})
    .select('slug category isActive')
    .lean();
  const managedPairs = new Set(managed.map(({ category, slug }) => `${category}:${slug}`));
  const missingPairs = [...new Set(beforeCourses
    .map(({ category, subcategory }) => `${category}:${subcategory}`)
    .filter((pair) => !managedPairs.has(pair)))];
  if (missingPairs.length > 0) {
    throw new Error(`Courses reference unmanaged subcategories: ${missingPairs.join(', ')}`);
  }

  const afterCourses = await snapshotCourses();
  if (JSON.stringify(beforeCourses) !== JSON.stringify(afterCourses)) {
    throw new Error('Course data changed during Course subcategory migration');
  }

  const duplicateSlugs = await CourseSubcategory.aggregate([
    { $group: { _id: '$slug', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  const afterSubcategories = await CourseSubcategory.countDocuments({});
  console.log(JSON.stringify({
    databaseEnvironment: process.env.NODE_ENV,
    databaseHost: host,
    databaseName: database,
    subcategoriesBefore: beforeSubcategories,
    subcategoriesAfter: afterSubcategories,
    migration,
    existingCourseCount: beforeCourses.length,
    existingCoursesChanged: false,
    existingCourseIdsChanged: false,
    courseSnapshotSha256: sha256(afterCourses),
    courseSiteAssignmentsSha256: sha256(afterCourses.map(({ id, sites }) => ({ id, sites }))),
    missingCoursePairs: missingPairs,
    duplicateManagedSubcategorySlugs: duplicateSlugs.length,
  }, null, 2));
};

if (require.main === module) {
  migrate()
    .catch((error) => {
      console.error(`Course subcategory migration failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { migrate, normalizeCourses, sha256 };
