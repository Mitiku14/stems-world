const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ENROLLMENT_STATUS } = require('../constants');
const emailService = require('../services/email.service');

/**
 * POST /api/enrollments
 * Student only. Submit an enrollment for a course.
 * Handles optional PDF upload when course.requiresDocument = true.
 */
exports.submitEnrollment = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  const student = req.user;

  // 1. Verify course exists and is active
  const course = await Course.findOne({ _id: courseId, isActive: true });
  if (!course) {
    throw new ApiError(404, 'Course not found or is no longer available.');
  }

  // 2. Prevent duplicate pending/approved enrollment for the same course
  const existingEnrollment = await Enrollment.findOne({
    student: student._id,
    course: courseId,
    status: { $in: [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.APPROVED] },
  });

  if (existingEnrollment) {
    const statusMsg =
      existingEnrollment.status === ENROLLMENT_STATUS.PENDING
        ? 'You already have a pending enrollment for this course.'
        : 'You are already enrolled in this course.';
    throw new ApiError(409, statusMsg);
  }

  // 3. PDF requirement check
  if (course.requiresDocument && !req.file) {
    throw new ApiError(400, 'An academic PDF document is required to enroll in this course.');
  }

  // 4. Create enrollment
  const enrollment = await Enrollment.create({
    student: student._id,
    course: courseId,
    academicPdf: req.file ? req.file.filename : null,
  });

  // 5. Send confirmation email — fire and forget (don't await in request cycle)
  emailService.sendEnrollmentSubmittedEmail(student, course);

  // 6. Populate for response
  await enrollment.populate('course', 'title description category level');

  return res.status(201).json(
    new ApiResponse(201, 'Enrollment submitted successfully. You will be notified once it has been reviewed.', {
      id: enrollment._id,
      course: enrollment.course,
      status: enrollment.status,
      academicPdf: enrollment.academicPdf,
      submittedAt: enrollment.createdAt,
    })
  );
});

/**
 * GET /api/enrollments/my
 * Student only. Returns all enrollments for the authenticated student.
 */
exports.getMyEnrollments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  const filter = { student: req.user._id };

  // Only apply status filter if the value is one of the valid enum values
  if (status) {
    const validStatuses = Object.values(ENROLLMENT_STATUS);
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }
    filter.status = status;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('course', 'title description category level')
      .select('course status academicPdf rejectionReason createdAt reviewedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Enrollment.countDocuments(filter),
  ]);

  return res.json(
    new ApiResponse(200, 'Enrollments fetched successfully.', {
      enrollments,
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
 * GET /api/enrollments/my/:id
 * Student only. Returns a single enrollment by ID — must belong to the student.
 */
exports.getMyEnrollmentById = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({
    _id: req.params.id,
    student: req.user._id,
  })
    .populate('course', 'title description category level requiresDocument')
    .lean();

  if (!enrollment) {
    throw new ApiError(404, 'Enrollment not found.');
  }

  return res.json(new ApiResponse(200, 'Enrollment fetched successfully.', enrollment));
});
