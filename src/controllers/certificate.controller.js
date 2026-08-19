const crypto = require('crypto');
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const Course = require('../models/Course');
const Competition = require('../models/Competition');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');
const { ROLES } = require('../constants');

const generateCertificateNumber = () => {
  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CERT-${year}-${randomHex}`;
};

/**
 * GET /api/certificates/verify/:certificateNumber
 * Public endpoint — no auth required.
 */
exports.verifyCertificate = asyncHandler(async (req, res) => {
  const certNo = req.params.certificateNumber.trim().toUpperCase();

  const certificate = await Certificate.findOne({ certificateNumber: certNo })
    .populate('student', 'name email')
    .populate('course', 'title category')
    .populate('competition', 'title type')
    .lean();

  if (!certificate) {
    throw new ApiError(404, 'Certificate not found. Please check the certificate number and try again.');
  }

  if (certificate.status === 'revoked') {
    return res.status(400).json(
      new ApiResponse(400, 'This certificate has been revoked by the issuing authority.', {
        certificateNumber: certificate.certificateNumber,
        status: 'revoked',
        issuedAt: certificate.issueDate,
      })
    );
  }

  // Return public verification details only
  return res.json(
    new ApiResponse(200, 'Certificate verified successfully.', {
      certificateNumber: certificate.certificateNumber,
      studentName: certificate.student?.name || 'Verified Student',
      title: certificate.title,
      type: certificate.type,
      gradeOrRank: certificate.gradeOrRank || null,
      issueDate: certificate.issueDate,
      status: certificate.status,
      course: certificate.course ? { id: certificate.course._id, title: certificate.course.title } : null,
      competition: certificate.competition ? { id: certificate.competition._id, title: certificate.competition.title } : null,
    })
  );
});

/**
 * GET /api/certificates/my
 * Authenticated student only.
 */
exports.getMyCertificates = asyncHandler(async (req, res) => {
  const certificates = await Certificate.find({ student: req.user._id, status: 'valid' })
    .populate('course', 'title category')
    .populate('competition', 'title type')
    .sort({ issueDate: -1 })
    .lean();

  return res.json(new ApiResponse(200, 'Certificates fetched successfully.', certificates));
});

/**
 * GET /api/certificates/:id
 * Authenticated student or Admin.
 */
exports.getCertificateById = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate('student', 'name email')
    .populate('course', 'title category')
    .populate('competition', 'title type')
    .populate('issuedBy', 'name email')
    .lean();

  if (!certificate) throw new ApiError(404, 'Certificate not found.');

  // Access check
  if (req.user.role !== ROLES.ADMIN && certificate.student?._id.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Access denied. You can only view your own certificates.');
  }

  return res.json(new ApiResponse(200, 'Certificate fetched successfully.', certificate));
});

/**
 * POST /api/admin/certificates
 * Admin only — Issue a certificate to a student.
 */
exports.issueCertificate = asyncHandler(async (req, res) => {
  const { studentId, type, title, courseId, competitionId, gradeOrRank, allowDuplicate = false } = req.body;

  const student = await User.findById(studentId);
  if (!student) throw new ApiError(404, 'Student not found.');

  // Verify course/competition if provided
  if (courseId) {
    const courseDoc = await Course.findById(courseId);
    if (!courseDoc) throw new ApiError(404, 'Associated course not found.');
  }

  if (competitionId) {
    const compDoc = await Competition.findById(competitionId);
    if (!compDoc) throw new ApiError(404, 'Associated competition not found.');
  }

  // Duplicate prevention check
  if (!allowDuplicate) {
    const duplicateFilter = { student: studentId, type, status: 'valid' };
    if (courseId) duplicateFilter.course = courseId;
    if (competitionId) duplicateFilter.competition = competitionId;

    const existing = await Certificate.findOne(duplicateFilter);
    if (existing) {
      throw new ApiError(
        409,
        `A valid certificate of type '${type}' has already been issued to this student for the specified course/competition.`
      );
    }
  }

  // Generate unique certificate number
  let certNo = generateCertificateNumber();
  let attempts = 0;
  while (await Certificate.exists({ certificateNumber: certNo })) {
    certNo = generateCertificateNumber();
    attempts++;
    if (attempts > 10) throw new ApiError(500, 'Failed to generate unique certificate number.');
  }

  const certificate = await Certificate.create({
    student: studentId,
    certificateNumber: certNo,
    type,
    title,
    course: courseId || null,
    competition: competitionId || null,
    gradeOrRank: gradeOrRank || null,
    issuedBy: req.user._id,
  });

  // Notify student
  notificationService.createNotification({
    recipient: studentId,
    title: 'New Digital Certificate Issued! 🎓',
    message: `You have been awarded a digital certificate: "${title}". Certificate Number: ${certNo}`,
    type: 'general',
    relatedResource: certificate._id,
    relatedResourceType: 'User',
  });

  return res.status(201).json(
    new ApiResponse(201, 'Certificate issued successfully.', {
      id: certificate._id,
      certificateNumber: certificate.certificateNumber,
      studentName: student.name,
      title: certificate.title,
      type: certificate.type,
      issueDate: certificate.issueDate,
    })
  );
});

/**
 * GET /api/admin/certificates
 * Admin only — List all issued certificates.
 */
exports.getAllCertificates = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = {};
  if (status) filter.status = status;

  if (search) {
    filter.$or = [
      { certificateNumber: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
    ];
  }

  const [certificates, total] = await Promise.all([
    Certificate.find(filter)
      .populate('student', 'name email')
      .populate('course', 'title')
      .populate('competition', 'title')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Certificate.countDocuments(filter),
  ]);

  return res.json(
    new ApiResponse(200, 'Certificates fetched successfully.', {
      certificates,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    })
  );
});

/**
 * PATCH /api/admin/certificates/:id/revoke
 * Admin only — Revoke an issued certificate.
 */
exports.revokeCertificate = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findById(req.params.id);
  if (!certificate) throw new ApiError(404, 'Certificate not found.');

  if (certificate.status === 'revoked') {
    throw new ApiError(409, 'Certificate is already revoked.');
  }

  certificate.status = 'revoked';
  await certificate.save();

  return res.json(
    new ApiResponse(200, 'Certificate revoked successfully.', {
      id: certificate._id,
      certificateNumber: certificate.certificateNumber,
      status: certificate.status,
    })
  );
});
