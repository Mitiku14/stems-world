const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ENROLLMENT_STATUS } = require('../constants');

/**
 * GET /api/courses
 * Public. Returns all active courses.
 * Supports: search (text), filter by category/level, pagination.
 */
exports.getCourses = asyncHandler(async (req, res) => {
  const { search, category, level, page = 1, limit = 10 } = req.query;

  const filter = { isActive: true };

  if (category) filter.category = category;
  if (level) filter.level = level;

  // Text search uses the text index on title + description
  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .select('title description category level requiresDocument isActive createdAt')
      .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Course.countDocuments(filter),
  ]);

  return res.json(
    new ApiResponse(200, 'Courses fetched successfully.', {
      courses,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    })
  );
});

/**
 * GET /api/courses/:id
 * Public. Returns a single course by ID.
 */
exports.getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, isActive: true }).lean();

  if (!course) {
    throw new ApiError(404, 'Course not found.');
  }

  return res.json(new ApiResponse(200, 'Course fetched successfully.', course));
});

/**
 * POST /api/courses
 * Admin only. Creates a new course.
 */
exports.createCourse = asyncHandler(async (req, res) => {
  const { title, description, category, level, requiresDocument } = req.body;

  const course = await Course.create({
    title,
    description,
    category,
    level,
    requiresDocument: requiresDocument ?? false,
    createdBy: req.user._id,
  });

  return res.status(201).json(new ApiResponse(201, 'Course created successfully.', course));
});

/**
 * PUT /api/courses/:id
 * Admin only. Updates an existing course.
 */
exports.updateCourse = asyncHandler(async (req, res) => {
  const { title, description, category, level, requiresDocument } = req.body;

  const course = await Course.findByIdAndUpdate(
    req.params.id,
    { title, description, category, level, requiresDocument },
    { new: true, runValidators: true }
  );

  if (!course) {
    throw new ApiError(404, 'Course not found.');
  }

  return res.json(new ApiResponse(200, 'Course updated successfully.', course));
});

/**
 * DELETE /api/courses/:id
 * Admin only. Deletes a course.
 * Business rule: cannot delete a course that has active (approved) enrollments.
 */
exports.deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    throw new ApiError(404, 'Course not found.');
  }

  const activeEnrollments = await Enrollment.countDocuments({
    course: req.params.id,
    status: ENROLLMENT_STATUS.APPROVED,
  });

  if (activeEnrollments > 0) {
    throw new ApiError(
      409,
      `Cannot delete this course — it has ${activeEnrollments} active approved enrollment(s). Deactivate it instead.`
    );
  }

  await course.deleteOne();

  return res.json(new ApiResponse(200, 'Course deleted successfully.'));
});

/**
 * PATCH /api/courses/:id/toggle-status
 * Admin only. Activates or deactivates a course.
 */
exports.toggleCourseStatus = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    throw new ApiError(404, 'Course not found.');
  }

  course.isActive = !course.isActive;
  await course.save();

  const statusLabel = course.isActive ? 'activated' : 'deactivated';

  return res.json(new ApiResponse(200, `Course ${statusLabel} successfully.`, { isActive: course.isActive }));
});
