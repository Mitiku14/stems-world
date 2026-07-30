const Enrollment = require('../models/Enrollment');
const Course     = require('../models/Course');
const asyncHandler = require('../utils/asyncHandler');
const ApiError   = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ENROLLMENT_STATUS } = require('../constants');
const emailService = require('../services/email.service');

exports.submitEnrollment = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  const student = req.user;

  const course = await Course.findOne({ _id: courseId, isActive: true });
  if (!course) throw new ApiError(404, 'Course not found or is no longer available.');

  const existing = await Enrollment.findOne({
    student: student._id,
    course: courseId,
    status: { $in: [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.APPROVED] },
  });

  if (existing) {
    const msg = existing.status === ENROLLMENT_STATUS.PENDING
      ? 'You already have a pending enrollment for this course.'
      : 'You are already enrolled in this course.';
    throw new ApiError(409, msg);
  }

  if (course.requiresDocument && !req.file) {
    throw new ApiError(400, 'An academic PDF document is required to enroll in this course.');
  }

  const enrollment = await Enrollment.create({
    student: student._id,
    course: courseId,
    academicPdf: req.file ? req.file.filename : null,
  });

  emailService.sendEnrollmentSubmittedEmail(student, course);

  await enrollment.populate('course', 'title description category level');

  return res.status(201).json(
    new ApiResponse(201, 'Enrollment submitted successfully. You will be notified once it has been reviewed.', {
      id:          enrollment._id,
      course:      enrollment.course,
      status:      enrollment.status,
      academicPdf: enrollment.academicPdf,
      submittedAt: enrollment.createdAt,
    })
  );
});

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

exports.getMyEnrollmentById = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({ _id: req.params.id, student: req.user._id })
    .populate('course', 'title description category level requiresDocument')
    .lean();

  if (!enrollment) throw new ApiError(404, 'Enrollment not found.');
  return res.json(new ApiResponse(200, 'Enrollment fetched successfully.', enrollment));
});
