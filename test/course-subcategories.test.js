require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const Course = require('../src/models/Course');
const CourseSubcategory = require('../src/models/CourseSubcategory');
const courseValidator = require('../src/validators/course.validator');
const courseSubcategoryValidator = require('../src/validators/courseSubcategory.validator');
const courseController = require('../src/controllers/course.controller');
const courseSubcategoryController = require('../src/controllers/courseSubcategory.controller');
const adminRoutes = require('../src/routes/admin.routes');
const swaggerSpec = require('../src/config/swagger');
const { COURSE_CATEGORIES } = require('../src/constants');
const { INITIAL_COURSE_SUBCATEGORIES } = require('../seed/courseSubcategory.data');
const { ensureInitialCourseSubcategories } = require('../seed/courseSubcategory.seed');

const validate = async (chains, request = {}) => {
  const req = { body: {}, query: {}, params: {}, ...request };
  for (const chain of chains) await chain.run(req);
  return { errors: validationResult(req), request: req };
};

const invoke = async (handler, request = {}) => {
  let body;
  let nextError;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { body = value; return this; },
  };
  await handler({ body: {}, query: {}, params: {}, ...request }, res, (error) => {
    nextError = error;
  });
  return { statusCode: res.statusCode, body, error: nextError };
};

const makeFindChain = (records) => {
  let result = records;
  const chain = {
    select: () => chain,
    sort: () => {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
      return chain;
    },
    lean: async () => result.map((record) => ({ ...record })),
  };
  return chain;
};

test('CourseSubcategory schema keeps fixed categories and globally unique machine-safe slugs', () => {
  const slugPath = CourseSubcategory.schema.path('slug');
  const categoryPath = CourseSubcategory.schema.path('category');

  assert.equal(slugPath.options.unique, true);
  assert.deepEqual(categoryPath.enumValues, COURSE_CATEGORIES);
  assert.equal(CourseSubcategory.schema.path('isActive').defaultValue, true);
  assert.equal(Course.schema.path('subcategory').instance, 'String');
  assert.equal(mongoose.modelNames().includes('Category'), false);
});

test('CourseSubcategory request validation accepts valid input and rejects invalid fields', async () => {
  const valid = await validate(courseSubcategoryValidator.create, {
    body: { name: 'Web Development', slug: 'web_development', category: 'technology' },
  });
  assert.equal(valid.errors.isEmpty(), true);

  for (const body of [
    { name: '', slug: 'web_development', category: 'technology' },
    { name: 'Web Development', slug: 'Web-Development', category: 'technology' },
    { name: 'Web Development', slug: 'web_development', category: 'business' },
  ]) {
    assert.equal((await validate(courseSubcategoryValidator.create, { body })).errors.isEmpty(), false);
  }
});

test('initial Course subcategory migration helper is idempotent without destructive writes', async () => {
  const store = new Map();
  const fakeModel = {
    init: async () => {},
    bulkWrite: async (operations) => {
      let matchedCount = 0;
      let upsertedCount = 0;
      for (const { updateOne } of operations) {
        const slug = updateOne.filter.slug;
        if (store.has(slug)) {
          matchedCount += 1;
        } else {
          store.set(slug, { ...updateOne.update.$setOnInsert });
          upsertedCount += 1;
        }
      }
      return { matchedCount, modifiedCount: 0, upsertedCount };
    },
    find: ({ slug }) => ({
      select: () => ({
        lean: async () => slug.$in.map((value) => store.get(value)).filter(Boolean),
      }),
    }),
  };

  const first = await ensureInitialCourseSubcategories(fakeModel);
  const second = await ensureInitialCourseSubcategories(fakeModel);

  assert.equal(first.upsertedCount, 17);
  assert.equal(second.upsertedCount, 0);
  assert.equal(second.modifiedCount, 0);
  assert.equal(store.size, 17);
  assert.equal([...store.values()].every((record) => record.isActive === true), true);
});

test('admin-created subcategory immediately drives taxonomy and Course validation, then deactivation blocks only new assignment', async () => {
  const records = [];
  const original = {
    exists: CourseSubcategory.exists,
    create: CourseSubcategory.create,
    find: CourseSubcategory.find,
    findById: CourseSubcategory.findById,
    courseFindOne: Course.findOne,
  };

  CourseSubcategory.exists = async (filter) => records.find((record) => (
    record.slug === filter.slug
      && (filter.category === undefined || record.category === filter.category)
      && (filter.isActive === undefined || record.isActive === filter.isActive)
  )) || null;
  CourseSubcategory.create = async (payload) => {
    const record = { _id: 'managed-mobile', isActive: true, ...payload, save: async () => record };
    records.push(record);
    return record;
  };
  CourseSubcategory.find = (filter = {}) => makeFindChain(records.filter((record) => (
    filter.isActive === undefined || record.isActive === filter.isActive
  )));
  CourseSubcategory.findById = async (id) => records.find((record) => record._id === id) || null;

  try {
    const courseBody = {
      title: 'Mobile Development Course',
      category: 'technology',
      subcategory: 'mobile_development',
    };
    assert.equal((await validate(courseValidator.create, { body: courseBody })).errors.isEmpty(), false);

    const created = await invoke(courseSubcategoryController.createCourseSubcategory, {
      body: { name: 'Mobile Development', slug: 'mobile_development', category: 'technology' },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.error, undefined);

    assert.equal((await validate(courseValidator.create, { body: courseBody })).errors.isEmpty(), true);
    assert.equal((await validate(courseValidator.listQuery, {
      query: { category: 'technology', subcategory: 'mobile_development' },
    })).errors.isEmpty(), true);
    assert.equal((await validate(courseValidator.listQuery, {
      query: { subcategory: 'mobile_development' },
    })).errors.isEmpty(), true);
    await new Course(courseBody).validate();

    const activeTaxonomy = await invoke(courseController.getCourseTaxonomy);
    assert.deepEqual(activeTaxonomy.body.data.technology, [
      { name: 'Mobile Development', slug: 'mobile_development' },
    ]);
    assert.deepEqual(Object.keys(activeTaxonomy.body.data), COURSE_CATEGORIES);

    const toggled = await invoke(courseSubcategoryController.toggleCourseSubcategoryStatus, {
      params: { id: 'managed-mobile' },
    });
    assert.equal(toggled.body.data.isActive, false);

    const inactiveTaxonomy = await invoke(courseController.getCourseTaxonomy);
    assert.deepEqual(inactiveTaxonomy.body.data.technology, []);
    assert.equal((await validate(courseValidator.create, { body: courseBody })).errors.isEmpty(), false);
    await assert.rejects(new Course(courseBody).validate(), /active managed subcategory/);

    Course.findOne = () => {
      const chain = {
        populate: () => chain,
        lean: async () => ({ _id: 'historical-course', ...courseBody, isActive: true }),
      };
      return chain;
    };
    const historical = await invoke(courseController.getCourse, { params: { id: 'historical-course' } });
    assert.equal(historical.error, undefined);
    assert.equal(historical.body.data.subcategory, 'mobile_development');
  } finally {
    CourseSubcategory.exists = original.exists;
    CourseSubcategory.create = original.create;
    CourseSubcategory.find = original.find;
    CourseSubcategory.findById = original.findById;
    Course.findOne = original.courseFindOne;
  }
});

test('duplicate slugs and referenced structural updates return 409 while name/status updates remain safe', async () => {
  const record = {
    _id: 'managed-programming',
    name: 'Programming',
    slug: 'programming',
    category: 'technology',
    isActive: true,
    async save() { return this; },
  };
  const original = {
    exists: CourseSubcategory.exists,
    findById: CourseSubcategory.findById,
    create: CourseSubcategory.create,
    courseExists: Course.exists,
  };

  try {
    CourseSubcategory.exists = async () => ({ _id: 'duplicate' });
    CourseSubcategory.create = async () => { throw new Error('create must not run for duplicate'); };
    const duplicate = await invoke(courseSubcategoryController.createCourseSubcategory, {
      body: { name: 'Programming Again', slug: 'programming', category: 'technology' },
    });
    assert.equal(duplicate.error.statusCode, 409);

    // Simulated concurrent race condition where pre-check passes but DB unique index throws E11000
    CourseSubcategory.exists = async () => null;
    CourseSubcategory.create = async () => {
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      throw err;
    };
    const raceDuplicate = await invoke(courseSubcategoryController.createCourseSubcategory, {
      body: { name: 'Programming Race', slug: 'programming', category: 'technology' },
    });
    assert.equal(raceDuplicate.error.statusCode, 409);
    assert.equal(raceDuplicate.error.message, 'A Course subcategory with this slug already exists.');

    CourseSubcategory.findById = async () => record;
    Course.exists = async () => ({ _id: 'referencing-course' });
    const renamed = await invoke(courseSubcategoryController.updateCourseSubcategory, {
      params: { id: record._id }, body: { name: 'Software Programming', isActive: false },
    });
    assert.equal(renamed.error, undefined);
    assert.equal(record.name, 'Software Programming');
    assert.equal(record.isActive, false);

    const slugChange = await invoke(courseSubcategoryController.updateCourseSubcategory, {
      params: { id: record._id }, body: { slug: 'coding' },
    });
    assert.equal(slugChange.error.statusCode, 409);

    const categoryChange = await invoke(courseSubcategoryController.updateCourseSubcategory, {
      params: { id: record._id }, body: { category: 'science' },
    });
    assert.equal(categoryChange.error.statusCode, 409);
  } finally {
    CourseSubcategory.exists = original.exists;
    CourseSubcategory.findById = original.findById;
    CourseSubcategory.create = original.create;
    Course.exists = original.courseExists;
  }
});

test('admin Course subcategory list supports category, active-state, search, and pagination filters', async () => {
  const originalFind = CourseSubcategory.find;
  const originalCount = CourseSubcategory.countDocuments;
  let capturedFilter;
  const records = [{
    _id: 'inactive-web', name: 'Web Development', slug: 'web_development',
    category: 'technology', isActive: false,
  }];

  CourseSubcategory.find = (filter) => {
    capturedFilter = filter;
    const chain = {
      sort: () => chain,
      skip: () => chain,
      limit: () => chain,
      lean: async () => records,
    };
    return chain;
  };
  CourseSubcategory.countDocuments = async () => 1;

  try {
    const result = await invoke(courseSubcategoryController.getAllCourseSubcategories, {
      query: { category: 'technology', isActive: false, search: 'web', page: '2', limit: '5' },
    });
    assert.equal(result.error, undefined);
    assert.equal(capturedFilter.category, 'technology');
    assert.equal(capturedFilter.isActive, false);
    assert.equal(capturedFilter.$or.length, 2);
    assert.equal(result.body.data.subcategories.length, 1);
    assert.deepEqual(result.body.data.pagination, { total: 1, page: 2, limit: 5, totalPages: 1 });

    const validated = await validate(courseSubcategoryValidator.listQuery, {
      query: { category: 'technology', isActive: 'false', search: 'web', page: '1', limit: '20' },
    });
    assert.equal(validated.errors.isEmpty(), true);
    assert.equal(validated.request.query.isActive, false);
  } finally {
    CourseSubcategory.find = originalFind;
    CourseSubcategory.countDocuments = originalCount;
  }
});

test('admin routes and Swagger expose managed subcategories without a fixed subcategory enum', () => {
  const routes = adminRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  const hasRoute = (path, method) => routes.some((route) => (
    route.path === path && route.methods.includes(method)
  ));

  assert.equal(hasRoute('/course-subcategories', 'get'), true);
  assert.equal(hasRoute('/course-subcategories', 'post'), true);
  assert.equal(hasRoute('/course-subcategories/:id', 'put'), true);
  assert.equal(hasRoute('/course-subcategories/:id/toggle-status', 'patch'), true);

  assert.deepEqual(swaggerSpec.components.schemas.CourseCategory.enum, COURSE_CATEGORIES);
  assert.equal(swaggerSpec.components.schemas.CourseSubcategorySlug.enum, undefined);
  assert.equal(swaggerSpec.components.schemas.CourseSubcategorySlug.pattern, '^[a-z0-9]+(?:_[a-z0-9]+)*$');
  assert.ok(swaggerSpec.paths['/api/admin/course-subcategories'].get);
  assert.ok(swaggerSpec.paths['/api/admin/course-subcategories'].post);
  assert.ok(swaggerSpec.paths['/api/admin/course-subcategories/{id}'].put);
  assert.ok(swaggerSpec.paths['/api/admin/course-subcategories/{id}/toggle-status'].patch);
});
