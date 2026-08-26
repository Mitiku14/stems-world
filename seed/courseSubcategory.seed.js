const CourseSubcategory = require('../src/models/CourseSubcategory');
const { INITIAL_COURSE_SUBCATEGORIES } = require('./courseSubcategory.data');

const ensureInitialCourseSubcategories = async (Model = CourseSubcategory) => {
  if (typeof Model.init === 'function') await Model.init();
  const migrationTimestamp = new Date();

  const result = await Model.bulkWrite(
    INITIAL_COURSE_SUBCATEGORIES.map((subcategory) => ({
      updateOne: {
        filter: { slug: subcategory.slug },
        update: {
          $setOnInsert: {
            ...subcategory,
            isActive: true,
            createdAt: migrationTimestamp,
            updatedAt: migrationTimestamp,
          },
        },
        upsert: true,
        timestamps: false,
      },
    })),
    { ordered: false }
  );

  const records = await Model.find({
    slug: { $in: INITIAL_COURSE_SUBCATEGORIES.map(({ slug }) => slug) },
  }).select('slug category').lean();
  const bySlug = new Map(records.map((record) => [record.slug, record]));

  for (const expected of INITIAL_COURSE_SUBCATEGORIES) {
    const actual = bySlug.get(expected.slug);
    if (!actual) throw new Error(`Course subcategory migration failed for slug: ${expected.slug}`);
    if (actual.category !== expected.category) {
      throw new Error(
        `Course subcategory slug "${expected.slug}" already belongs to category "${actual.category}"`
      );
    }
  }

  return {
    expectedCount: INITIAL_COURSE_SUBCATEGORIES.length,
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
    upsertedCount: result.upsertedCount || 0,
  };
};

module.exports = { ensureInitialCourseSubcategories };
