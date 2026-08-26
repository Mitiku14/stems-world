const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const CompetitionRegistration = require('../models/CompetitionRegistration');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../constants');
const escapeRegex = require('../utils/escapeRegex');

const formatCSVRow = (values) =>
  values
    .map((v) => {
      if (v === null || v === undefined) return '""';
      const str = String(v).replace(/"/g, '""');
      return `"${str}"`;
    })
    .join(',');

const sendCSVResponse = (res, filename, headers, rows) => {
  const csvString = [headers.map((h) => `"${h}"`).join(','), ...rows.map(formatCSVRow)].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csvString);
};

exports.exportStudents = asyncHandler(async (_req, res) => {
  const students = await User.find({ role: ROLES.STUDENT })
    .select('name email username isActive isEmailVerified createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const headers = ['ID', 'Name', 'Email', 'Username', 'Status', 'Email Verified', 'Registered At'];
  const rows = students.map((s) => [
    s._id.toString(),
    s.name || '',
    s.email || '',
    s.username || '',
    s.isActive ? 'Active' : 'Disabled',
    s.isEmailVerified ? 'Yes' : 'No',
    s.createdAt ? new Date(s.createdAt).toISOString() : '',
  ]);

  const dateStr = new Date().toISOString().split('T')[0];
  return sendCSVResponse(res, `students_export_${dateStr}.csv`, headers, rows);
});

exports.exportEnrollments = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const filter = {};
  if (status) filter.status = status;

  if (search) {
    const escaped = escapeRegex(search);
    const students = await User.find({
      role: ROLES.STUDENT,
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ],
    }).select('_id').lean();

    const studentIds = students.map((u) => u._id);

    filter.$or = [
      { student: { $in: studentIds } },
      { studentName: { $regex: escaped, $options: 'i' } },
      { studentEmail: { $regex: escaped, $options: 'i' } },
    ];
  }

  const enrollments = await Enrollment.find(filter)
    .populate('student', 'name email')
    .populate('course', 'title')
    .populate('site', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'Enrollment ID',
    'Student Name',
    'Student Email',
    'Course Title',
    'Grade',
    'Site Name',
    'Status',
    'Academic PDF URL',
    'Rejection Reason',
    'Registered At',
    'Reviewed At',
  ];

  const rows = enrollments.map((e) => [
    e._id.toString(),
    e.student?.name || e.studentName || '',
    e.student?.email || e.studentEmail || '',
    e.course?.title || '',
    e.grade || '',
    e.site?.name || '',
    e.status || '',
    e.academicPdf || '',
    e.rejectionReason || '',
    e.createdAt ? new Date(e.createdAt).toISOString() : '',
    e.reviewedAt ? new Date(e.reviewedAt).toISOString() : '',
  ]);

  const dateStr = new Date().toISOString().split('T')[0];
  return sendCSVResponse(res, `enrollments_export_${dateStr}.csv`, headers, rows);
});

exports.exportCompetitionRegistrations = asyncHandler(async (req, res) => {
  const { status, competitionId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (competitionId) filter.competition = competitionId;

  const registrations = await CompetitionRegistration.find(filter)
    .populate('student', 'name email')
    .populate('competition', 'title')
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'Registration ID',
    'Participant Name',
    'Email',
    'Phone',
    'Team Name',
    'Grade',
    'Competition Title',
    'Status',
    'Rejection Reason',
    'Registered At',
  ];

  const rows = registrations.map((r) => [
    r._id.toString(),
    r.student?.name || r.fullName || '',
    r.student?.email || r.email || '',
    r.phone || '',
    r.teamName || '',
    r.grade || '',
    r.competition?.title || '',
    r.status || '',
    r.rejectionReason || '',
    r.createdAt ? new Date(r.createdAt).toISOString() : '',
  ]);

  const dateStr = new Date().toISOString().split('T')[0];
  return sendCSVResponse(res, `competition_registrations_export_${dateStr}.csv`, headers, rows);
});

exports.exportCourses = asyncHandler(async (_req, res) => {
  const courses = await Course.find()
    .select('title frontendId category subcategory level instructor duration season maxStudents requiresDocument isActive createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'Course ID',
    'Title',
    'Frontend ID',
    'Category',
    'Subcategory',
    'Level',
    'Instructor',
    'Duration',
    'Season',
    'Max Students',
    'Requires Document',
    'Is Active',
    'Created At',
  ];

  const rows = courses.map((c) => [
    c._id.toString(),
    c.title || '',
    c.frontendId || '',
    c.category || '',
    c.subcategory || '',
    c.level || '',
    c.instructor || '',
    c.duration || '',
    c.season || '',
    c.maxStudents !== null && c.maxStudents !== undefined ? c.maxStudents : 'Unlimited',
    c.requiresDocument ? 'Yes' : 'No',
    c.isActive ? 'Active' : 'Disabled',
    c.createdAt ? new Date(c.createdAt).toISOString() : '',
  ]);

  const dateStr = new Date().toISOString().split('T')[0];
  return sendCSVResponse(res, `courses_export_${dateStr}.csv`, headers, rows);
});
