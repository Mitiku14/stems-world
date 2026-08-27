const User       = require('../models/User');
const Course     = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Competition = require('../models/Competition');
const CompetitionRegistration = require('../models/CompetitionRegistration');
const asyncHandler = require('../utils/asyncHandler');
const ApiError   = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ROLES, ENROLLMENT_STATUS, COMMUNICATION_CHANNELS } = require('../constants');
const emailService = require('../services/email.service');
const notificationService = require('../services/notification.service');
const escapeRegex = require('../utils/escapeRegex');

const paginate = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

const withContactDefaults = (user) => ({
  ...user,
  phone: user.phone || null,
  isPhoneVerified: user.isPhoneVerified === true,
  preferredCommunication: user.preferredCommunication || COMMUNICATION_CHANNELS.EMAIL,
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
  grade:             e.grade          || null,
  siteName:          e.site?.name     || null,
  status:            e.status,
  registeredAt:      e.createdAt,
  rejectionReason:   e.rejectionReason || null,
  reviewedAt:        e.reviewedAt      || null,
});

// ── Dashboard ──────────────────────────────────────────────────────────────

exports.getDashboard = asyncHandler(async (_req, res) => {
  const [
    totalStudents,
    activeStudents,
    totalCourses,
    activeCourses,
    totalEnrollments,
    pendingEnrollments,
    acceptedEnrollments,
    rejectedEnrollments,
    totalCompetitions,
    activeCompetitions,
    totalCompRegistrations,
    pendingCompRegistrations,
    approvedCompRegistrations,
    rejectedCompRegistrations,
    enrollmentsByCourse,
    enrollmentsBySite,
    enrollmentsByStatus,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.STUDENT }),
    User.countDocuments({ role: ROLES.STUDENT, isActive: true }),
    Course.countDocuments(),
    Course.countDocuments({ isActive: true }),
    Enrollment.countDocuments(),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.PENDING }),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.ACCEPTED }),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.REJECTED }),
    Competition.countDocuments(),
    Competition.countDocuments({ isActive: true, status: { $in: ['open', 'upcoming'] } }),
    CompetitionRegistration.countDocuments(),
    CompetitionRegistration.countDocuments({ status: ENROLLMENT_STATUS.PENDING }),
    CompetitionRegistration.countDocuments({ status: ENROLLMENT_STATUS.ACCEPTED }),
    CompetitionRegistration.countDocuments({ status: ENROLLMENT_STATUS.REJECTED }),
    Enrollment.aggregate([
      { $group: { _id: '$course', count: { $sum: 1 } } },
      { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
      { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, title: '$course.title', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Enrollment.aggregate([
      { $match: { site: { $ne: null } } },
      { $group: { _id: '$site', count: { $sum: 1 } } },
      { $lookup: { from: 'sites', localField: '_id', foreignField: '_id', as: 'site' } },
      { $unwind: { path: '$site', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, name: '$site.name', count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Enrollment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  return res.json(new ApiResponse(200, 'Dashboard stats fetched successfully.', {
    totalStudents,
    activeStudents,
    totalCourses,
    activeCourses,
    enrollments: {
      total:    totalEnrollments,
      pending:  pendingEnrollments,
      accepted: acceptedEnrollments,
      rejected: rejectedEnrollments,
      byCourse: enrollmentsByCourse,
      bySite:   enrollmentsBySite,
      byStatus: enrollmentsByStatus.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
    },
    competitions: {
      total: totalCompetitions,
      active: activeCompetitions,
      registrations: {
        total: totalCompRegistrations,
        pending: pendingCompRegistrations,
        approved: approvedCompRegistrations,
        rejected: rejectedCompRegistrations,
      },
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
    const escaped = escapeRegex(search);
    const students = await User.find({
      role: ROLES.STUDENT,
      $or: [
        { name:  { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ],
    }).select('_id').lean();

    const studentIds = students.map((u) => u._id);

    // Search also covers anonymous enrollments stored by email/name
    filter.$or = [
      { student: { $in: studentIds } },
      { studentName:  { $regex: escaped, $options: 'i' } },
      { studentEmail: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('student',    'name email')
      .populate('course',     'title category')
      .populate('site',       'name')
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
    .populate('site',       'name')
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
  if (!enrollment.course) throw new ApiError(404, 'The associated course no longer exists.');

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

  // In-app notification
  if (enrollment.student?._id) {
    notificationService.createNotification({
      recipient: enrollment.student._id,
      title: 'Course Enrollment Approved! 🎉',
      message: `Your enrollment for "${enrollment.course.title}" has been approved.`,
      type: 'enrollment_approved',
      relatedResource: enrollment._id,
      relatedResourceType: 'Enrollment',
    });
  } else if (recipientEmail) {
    notificationService.notifyUserByEmail(recipientEmail, {
      title: 'Course Enrollment Approved! 🎉',
      message: `Your enrollment for "${enrollment.course.title}" has been approved.`,
      type: 'enrollment_approved',
      relatedResource: enrollment._id,
      relatedResourceType: 'Enrollment',
    });
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
  if (!enrollment.course) throw new ApiError(404, 'The associated course no longer exists.');

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

  // In-app notification
  if (enrollment.student?._id) {
    notificationService.createNotification({
      recipient: enrollment.student._id,
      title: 'Course Enrollment Status Update',
      message: `Your enrollment for "${enrollment.course.title}" was not approved. ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`,
      type: 'enrollment_rejected',
      relatedResource: enrollment._id,
      relatedResourceType: 'Enrollment',
    });
  } else if (recipientEmail) {
    notificationService.notifyUserByEmail(recipientEmail, {
      title: 'Course Enrollment Status Update',
      message: `Your enrollment for "${enrollment.course.title}" was not approved. ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`,
      type: 'enrollment_rejected',
      relatedResource: enrollment._id,
      relatedResourceType: 'Enrollment',
    });
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
    const escaped = escapeRegex(search);
    filter.$or = [
      { name:     { $regex: escaped, $options: 'i' } },
      { email:    { $regex: escaped, $options: 'i' } },
      { username: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [students, total] = await Promise.all([
    User.find(filter)
      .select('username name email phone isEmailVerified isPhoneVerified preferredCommunication isActive createdAt')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    User.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Students fetched successfully.', {
    students: students.map(withContactDefaults),
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

  return res.json(new ApiResponse(200, 'Student fetched successfully.', {
    ...withContactDefaults(student),
    enrollments,
  }));
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

  return res.json(new ApiResponse(200, 'Student account and course enrollments deleted successfully.'));
});

// ── Admin Management ───────────────────────────────────────────────────────

exports.createAdmin = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, 'No registered user found with that email address.');

  if (user.role === ROLES.ADMIN) {
    throw new ApiError(409, 'User is already an admin.');
  }

  user.role = ROLES.ADMIN;
  await user.save();

  return res.status(200).json(new ApiResponse(200, 'User promoted to admin successfully.', {
    id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
  }));
});

// ── Course Management ──────────────────────────────────────────────────────

exports.getAllCourses = asyncHandler(async (req, res) => {
  const { search, category, subcategory, level, page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = {};  // No isActive filter — admin sees everything
  if (category) filter.category = category;
  if (subcategory) filter.subcategory = subcategory;
  if (level) filter.level = level;
  if (search) filter.$text = { $search: search };

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .select('title description category subcategory level requiresDocument imageUrl isActive frontendId instructor duration season maxStudents createdAt')
      .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Course.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Courses fetched successfully.', {
    courses,
    pagination: paginate(total, p, l),
  }));
});
