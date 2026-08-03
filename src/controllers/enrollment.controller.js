const Enrollment = require('../models/Enrollment');
const Course     = require('../models/Course');
const asyncHandler = require('../utils/asyncHandler');
const ApiError   = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ENROLLMENT_STATUS } = require('../constants');
const emailService = require('../services/email.service');
const mongoose = require('mongoose');

/**
 * Resolves a course from either:
 *  - A MongoDB ObjectId string (e.g. "64a1b2c3...")
 *  - A frontendId string (e.g. "cs-1", "math-3", "english-1")
 *  - A course title (partial or exact, case-insensitive)
 */
const resolveCourse = async (courseType) => {
  // Try ObjectId first
  if (mongoose.Types.ObjectId.isValid(courseType)) {
    return Course.findOne({ _id: courseType, isActive: true });
  }

  // Try frontendId
  const byFrontendId = await Course.findOne({ frontendId: courseType, isActive: true });
  if (byFrontendId) return byFrontendId;

  // Fall back to title match (case-insensitive)
  return Course.findOne({
    title: { $regex: new RegExp(courseType.replace(/[-_]/g, '.*'), 'i') },
    isActive: true,
  });
};

/**
 * POST /api/enrollments
 * Public (no auth required) — frontend form is shown to anonymous visitors.
 * Frontend sends: { studentName, email, courseType, academicPdf (file) }
 * courseType can be a frontendId like "cs-1", "math-3", or a course title.
 */
exports.submitEnrollment = asyncHandler(async (req, res) => {
  const { studentName, email, courseType, academicPdf } = req.body;

  const course = await resolveCourse(courseType);
  if (!course) throw new ApiError(404, 'Course not found or is no longer available.');

  // Prevent duplicate pending/accepted submissions for the same email + course
  const existing = await Enrollment.findOne({
    studentEmail: email.toLowerCase().trim(),
    course: course._id,
    status: { $in: [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACCEPTED] },
  });

  if (existing) {
    const msg = existing.status === ENROLLMENT_STATUS.PENDING
      ? 'You already have a pending enrollment for this course.'
      : 'You are already accepted for this course.';
    throw new ApiError(409, msg);
  }

  if (course.requiresDocument && !academicPdf) {
    throw new ApiError(400, 'An academic PDF public URL is required to enroll in this course.');
  }

  const enrollment = await Enrollment.create({
    studentName,
    studentEmail: email.toLowerCase().trim(),
    course: course._id,
    academicPdf: academicPdf || null,
  });

  // Confirmation email — fire and forget
  emailService.sendEnrollmentSubmittedEmail({ name: studentName, email }, course);

  return res.status(201).json(
    new ApiResponse(201, 'Enrollment submitted successfully. You will be notified once it has been reviewed.', {
      id:          enrollment._id,
      studentName: enrollment.studentName,
      course:      { id: course._id, title: course.title },
      status:      enrollment.status,
      submittedAt: enrollment.createdAt,
    })
  );
});

/**
 * GET /api/enrollments/my
 * Authenticated student only.
 */
exports.getMyEnrollments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = { student: req.user._id };

  if (status) {
    const valid = Object.values(ENROLLMENT_STATUS);
    if (!valid.includes(status)) {
      throw new ApiError(400, `Invalid status. Must be one of: ${valid.join(', ')}`);
    }
    filter.status = status;
  }

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('course', 'title description category level')
      .select('course status academicPdf rejectionReason createdAt reviewedAt')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Enrollment.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Enrollments fetched successfully.', {
    enrollments,
    pagination: { total, page: p, limit: l, totalPages: Math.ceil(total / l) },
  }));
});

/**
 * GET /api/enrollments/my/:id
 * Authenticated student only.
 */
exports.getMyEnrollmentById = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({ _id: req.params.id, student: req.user._id })
    .populate('course', 'title description category level requiresDocument')
    .lean();

  if (!enrollment) throw new ApiError(404, 'Enrollment not found.');
  return res.json(new ApiResponse(200, 'Enrollment fetched successfully.', enrollment));
});
