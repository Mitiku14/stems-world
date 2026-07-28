const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ROLES, ENROLLMENT_STATUS } = require('../constants');
const emailService = require('../services/email.service');

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/dashboard
 * Returns aggregate stats for the admin dashboard.
 */
exports.getDashboard = asyncHandler(async (req, res) => {
  const [
    totalStudents,
    totalCourses,
    totalEnrollments,
    pendingEnrollments,
    approvedEnrollments,
    rejectedEnrollments,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.STUDENT }),
    Course.countDocuments(),
    Enrollment.countDocuments(),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.PENDING }),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.APPROVED }),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.REJECTED }),
  ]);

  return res.json(
    new ApiResponse(200, 'Dashboard stats fetched successfully.', {
      totalStudents,
      totalCourses,
      enrollments: {
        total: totalEnrollments,
        pending: pendingEnrollments,
        approved: approvedEnrollments,
        rejected: rejectedEnrollments,
      },
    })
  );
});

// ─── Enrollment Management ────────────────────────────────────────────────────

/**
 * GET /api/admin/enrollments
 * Returns all enrollments with optional filtering and pagination.
 */
exports.getAllEnrollments = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  // If searching by student name/email, we need to match on the populated field.
  // We use a two-step approach: find matching user IDs first, then filter enrollments.
  if (search) {
    const matchingStudents = await User.find({
      role: ROLES.STUDENT,
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    const studentIds = matchingStudents.map((u) => u._id);
    filter.student = { $in: studentIds };
  }

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('student', 'name email username')
      .populate('course', 'title category')
      .populate('reviewedBy', 'name email')
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
 * GET /api/admin/enrollments/:id
 * Returns a single enrollment with full detail.
 */
exports.getEnrollmentById = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id)
    .populate('student', 'name email username phone')
    .populate('course', 'title description category level requiresDocument')
    .populate('reviewedBy', 'name email')
    .lean();

  if (!enrollment) {
    throw new ApiError(404, 'Enrollment not found.');
  }

  return res.json(new ApiResponse(200, 'Enrollment fetched successfully.', enrollment));
});

/**
 * PATCH /api/admin/enrollments/:id/approve
 * Approves a pending enrollment and notifies the student.
 */
exports.approveEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id)
    .populate('student', 'name email')
    .populate('course', 'title _id');

  if (!enrollment) {
    throw new ApiError(404, 'Enrollment not found.');
  }

  if (enrollment.status !== ENROLLMENT_STATUS.PENDING) {
    throw new ApiError(409, `This enrollment has already been ${enrollment.status}. Only pending enrollments can be approved.`);
  }

  enrollment.status = ENROLLMENT_STATUS.APPROVED;
  enrollment.reviewedBy = req.user._id;
  enrollment.reviewedAt = new Date();
  enrollment.rejectionReason = null;
  await enrollment.save();

  // Notify student — fire and forget
  emailService.sendEnrollmentApprovedEmail(enrollment.student, enrollment.course);

  return res.json(
    new ApiResponse(200, 'Enrollment approved successfully.', {
      id: enrollment._id,
      status: enrollment.status,
      reviewedAt: enrollment.reviewedAt,
    })
  );
});

/**
 * PATCH /api/admin/enrollments/:id/reject
 * Rejects a pending enrollment with a required reason and notifies the student.
 */
exports.rejectEnrollment = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;

  const enrollment = await Enrollment.findById(req.params.id)
    .populate('student', 'name email')
    .populate('course', 'title _id');

  if (!enrollment) {
    throw new ApiError(404, 'Enrollment not found.');
  }

  if (enrollment.status !== ENROLLMENT_STATUS.PENDING) {
    throw new ApiError(409, `This enrollment has already been ${enrollment.status}. Only pending enrollments can be rejected.`);
  }

  enrollment.status = ENROLLMENT_STATUS.REJECTED;
  enrollment.rejectionReason = rejectionReason;
  enrollment.reviewedBy = req.user._id;
  enrollment.reviewedAt = new Date();
  await enrollment.save();

  // Notify student — fire and forget
  emailService.sendEnrollmentRejectedEmail(enrollment.student, enrollment.course, rejectionReason);

  return res.json(
    new ApiResponse(200, 'Enrollment rejected successfully.', {
      id: enrollment._id,
      status: enrollment.status,
      rejectionReason: enrollment.rejectionReason,
      reviewedAt: enrollment.reviewedAt,
    })
  );
});

// ─── Student Management ───────────────────────────────────────────────────────

/**
 * GET /api/admin/students
 * Returns all students with optional search and pagination.
 */
exports.getAllStudents = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;

  const filter = { role: ROLES.STUDENT };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [students, total] = await Promise.all([
    User.find(filter)
      .select('username name email phone isEmailVerified isActive createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(filter),
  ]);

  return res.json(
    new ApiResponse(200, 'Students fetched successfully.', {
      students,
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
 * GET /api/admin/students/:id
 * Returns a single student's profile and their enrollment history.
 */
exports.getStudentById = asyncHandler(async (req, res) => {
  // Run both queries in parallel — they are independent of each other
  const [student, enrollments] = await Promise.all([
    User.findOne({ _id: req.params.id, role: ROLES.STUDENT })
      .select('-password')
      .lean(),
    Enrollment.find({ student: req.params.id })
      .populate('course', 'title category')
      .select('course status rejectionReason createdAt reviewedAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  if (!student) {
    throw new ApiError(404, 'Student not found.');
  }

  return res.json(
    new ApiResponse(200, 'Student fetched successfully.', {
      ...student,
      enrollments,
    })
  );
});

/**
 * PATCH /api/admin/students/:id/toggle-status
 * Enables or disables a student account.
 * A disabled student's JWT will be rejected by auth middleware on next request.
 */
exports.toggleStudentStatus = asyncHandler(async (req, res) => {
  // Prevent admin from disabling themselves
  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(400, 'You cannot disable your own account.');
  }

  const student = await User.findOne({ _id: req.params.id, role: ROLES.STUDENT });

  if (!student) {
    throw new ApiError(404, 'Student not found.');
  }

  student.isActive = !student.isActive;
  await student.save();

  const statusLabel = student.isActive ? 'enabled' : 'disabled';

  return res.json(
    new ApiResponse(200, `Student account ${statusLabel} successfully.`, {
      id: student._id,
      isActive: student.isActive,
    })
  );
});

/**
 * DELETE /api/admin/students/:id
 * Permanently deletes a student and all their enrollments.
 */
exports.deleteStudent = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: ROLES.STUDENT });

  if (!student) {
    throw new ApiError(404, 'Student not found.');
  }

  // Delete all associated enrollments before removing the user
  await Enrollment.deleteMany({ student: req.params.id });
  await student.deleteOne();

  return res.json(new ApiResponse(200, 'Student and all associated data deleted successfully.'));
});
