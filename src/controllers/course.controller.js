const Course     = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const asyncHandler = require('../utils/asyncHandler');
const ApiError   = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ENROLLMENT_STATUS } = require('../constants');

const buildPagination = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

exports.getCourses = asyncHandler(async (req, res) => {
  const { search, category, level, page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = { isActive: true };
  if (category) filter.category = category;
  if (level)    filter.level    = level;
  if (search)   filter.$text    = { $search: search };

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .select('title description category level requiresDocument isActive createdAt')
      .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Course.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Courses fetched successfully.', {
    courses,
    pagination: buildPagination(total, p, l),
  }));
});

exports.getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, isActive: true }).lean();
  if (!course) throw new ApiError(404, 'Course not found.');
  return res.json(new ApiResponse(200, 'Course fetched successfully.', course));
});

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

exports.updateCourse = asyncHandler(async (req, res) => {
  const { title, description, category, level, requiresDocument } = req.body;
  const course = await Course.findByIdAndUpdate(
    req.params.id,
    { title, description, category, level, requiresDocument },
    { new: true, runValidators: true }
  );
  if (!course) throw new ApiError(404, 'Course not found.');
  return res.json(new ApiResponse(200, 'Course updated successfully.', course));
});

exports.deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new ApiError(404, 'Course not found.');

  const activeEnrollments = await Enrollment.countDocuments({
    course: req.params.id,
    status: ENROLLMENT_STATUS.ACCEPTED,
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

exports.toggleCourseStatus = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new ApiError(404, 'Course not found.');

  course.isActive = !course.isActive;
  await course.save();

  const label = course.isActive ? 'activated' : 'deactivated';
  return res.json(new ApiResponse(200, `Course ${label} successfully.`, { isActive: course.isActive }));
});
