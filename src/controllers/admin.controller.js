const User       = require('../models/User');
const Course     = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const asyncHandler = require('../utils/asyncHandler');
const ApiError   = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ROLES, ENROLLMENT_STATUS } = require('../constants');
const emailService = require('../services/email.service');

const paginate = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

/**
 * Flattens a raw enrollment document into the shape the admin frontend expects:
 *   { id, studentName, email, courseType, academicFileName, status, registeredAt }
 */
const flattenEnrollment = (e) => ({
  id:                e._id,
  studentName:       e.student?.name  || e.studentName  || '—',
  email:             e.student?.email || e.studentEmail || '—',
  courseType:        e.course?.title  || '—',
  academicFileName:  e.academicPdf    || null,
  status:            e.status,
  registeredAt:      e.createdAt,
  rejectionReason:   e.rejectionReason || null,
  reviewedAt:        e.reviewedAt      || null,
});

// ── Dashboard ──────────────────────────────────────────────────────────────

exports.getDashboard = asyncHandler(async (_req, res) => {
  const [
    totalStudents,
    totalCourses,
    totalEnrollments,
    pendingEnrollments,
    acceptedEnrollments,
    rejectedEnrollments,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.STUDENT }),
    Course.countDocuments(),
    Enrollment.countDocuments(),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.PENDING }),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.ACCEPTED }),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.REJECTED }),
  ]);

  return res.json(new ApiResponse(200, 'Dashboard stats fetched successfully.', {
    totalStudents,
    totalCourses,
    enrollments: {
      total:    totalEnrollments,
      pending:  pendingEnrollments,
      accepted: acceptedEnrollments,
      rejected: rejectedEnrollments,
    },
  }));
});

// ── Enrollment Management ──────────────────────────────────────────────────

exports.getAllEnrollments = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = {};
  if (status) filter.status = status;

  if (search) {
    const students = await User.find({
      role: ROLES.STUDENT,
      $or: [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    }).select('_id').lean();

    const studentIds = students.map((u) => u._id);

    // Search also covers anonymous enrollments stored by email/name
    filter.$or = [
      { student: { $in: studentIds } },
      { studentName:  { $regex: search, $options: 'i' } },
      { studentEmail: { $regex: search, $options: 'i' } },
    ];
  }

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('student',    'name email')
      .populate('course',     'title category')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Enrollment.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Enrollments fetched successfully.', {
    enrollments: enrollments.map(flattenEnrollment),
    pagination: paginate(total, p, l),
  }));
});

exports.getEnrollmentById = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id)
    .populate('student',    'name email phone')
    .populate('course',     'title description category level requiresDocument')
    .populate('reviewedBy', 'name email')
    .lean();

  if (!enrollment) throw new ApiError(404, 'Enrollment not found.');
  return res.json(new ApiResponse(200, 'Enrollment fetched successfully.', flattenEnrollment(enrollment)));
});

exports.approveEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id)
    .populate('student', 'name email')
    .populate('course',  'title _id');

  if (!enrollment) throw new ApiError(404, 'Enrollment not found.');

  if (enrollment.status !== ENROLLMENT_STATUS.PENDING) {
    throw new ApiError(409, `This enrollment has already been ${enrollment.status}. Only pending enrollments can be accepted.`);
  }

  enrollment.status     = ENROLLMENT_STATUS.ACCEPTED;
  enrollment.reviewedBy = req.user._id;
  enrollment.reviewedAt = new Date();
  enrollment.rejectionReason = null;
  await enrollment.save();

  // Send email using student data (may be from populated student or anonymous fields)
  const recipientName  = enrollment.student?.name  || enrollment.studentName;
  const recipientEmail = enrollment.student?.email || enrollment.studentEmail;
  if (recipientEmail) {
    emailService.sendEnrollmentApprovedEmail(
      { name: recipientName, email: recipientEmail },
      enrollment.course
    );
  }

  return res.json(new ApiResponse(200, 'Enrollment accepted successfully.', {
    id:         enrollment._id,
    status:     enrollment.status,
    reviewedAt: enrollment.reviewedAt,
  }));
});

exports.rejectEnrollment = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;

  const enrollment = await Enrollment.findById(req.params.id)
    .populate('student', 'name email')
    .populate('course',  'title _id');

  if (!enrollment) throw new ApiError(404, 'Enrollment not found.');

  if (enrollment.status !== ENROLLMENT_STATUS.PENDING) {
    throw new ApiError(409, `This enrollment has already been ${enrollment.status}. Only pending enrollments can be rejected.`);
  }

  enrollment.status          = ENROLLMENT_STATUS.REJECTED;
  enrollment.rejectionReason = rejectionReason || null;
  enrollment.reviewedBy      = req.user._id;
  enrollment.reviewedAt      = new Date();
  await enrollment.save();

  const recipientName  = enrollment.student?.name  || enrollment.studentName;
  const recipientEmail = enrollment.student?.email || enrollment.studentEmail;
  if (recipientEmail) {
    emailService.sendEnrollmentRejectedEmail(
      { name: recipientName, email: recipientEmail },
      enrollment.course,
      rejectionReason || 'No reason provided.'
    );
  }

  return res.json(new ApiResponse(200, 'Enrollment rejected successfully.', {
    id:              enrollment._id,
    status:          enrollment.status,
    rejectionReason: enrollment.rejectionReason,
    reviewedAt:      enrollment.reviewedAt,
  }));
});

// ── Student Management ─────────────────────────────────────────────────────

exports.getAllStudents = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = { role: ROLES.STUDENT };
  if (search) {
    filter.$or = [
      { name:     { $regex: search, $options: 'i' } },
      { email:    { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } },
    ];
  }

  const [students, total] = await Promise.all([
    User.find(filter)
      .select('username name email phone isEmailVerified isActive createdAt')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    User.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Students fetched successfully.', {
    students,
    pagination: paginate(total, p, l),
  }));
});

exports.getStudentById = asyncHandler(async (req, res) => {
  const [student, enrollments] = await Promise.all([
    User.findOne({ _id: req.params.id, role: ROLES.STUDENT }).select('-password').lean(),
    Enrollment.find({ student: req.params.id })
      .populate('course', 'title category')
      .select('course status rejectionReason createdAt reviewedAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  if (!student) throw new ApiError(404, 'Student not found.');

  return res.json(new ApiResponse(200, 'Student fetched successfully.', { ...student, enrollments }));
});

exports.toggleStudentStatus = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(400, 'You cannot disable your own account.');
  }

  const student = await User.findOne({ _id: req.params.id, role: ROLES.STUDENT });
  if (!student) throw new ApiError(404, 'Student not found.');

  student.isActive = !student.isActive;
  await student.save();

  const label = student.isActive ? 'enabled' : 'disabled';
  return res.json(new ApiResponse(200, `Student account ${label} successfully.`, {
    id:       student._id,
    isActive: student.isActive,
  }));
});

exports.deleteStudent = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: ROLES.STUDENT });
  if (!student) throw new ApiError(404, 'Student not found.');

  await Enrollment.deleteMany({ student: req.params.id });
  await student.deleteOne();

  return res.json(new ApiResponse(200, 'Student and all associated data deleted successfully.'));
});
