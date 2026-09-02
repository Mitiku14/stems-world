const crypto = require('crypto');
const mongoose = require('mongoose');
const Certificate = require('../models/Certificate');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const Course = require('../models/Course');
const Competition = require('../models/Competition');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');
const { ROLES } = require('../constants');
const escapeRegex = require('../utils/escapeRegex');
const { fullNameFor, compactProfileSummary } = require('../utils/studentProfile');

const generateCertificateNumber = () => {
  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CERT-${year}-${randomHex}`;
};

const resolveOwnedProfile = async (profileId, parentUserId) => {
  if (!mongoose.Types.ObjectId.isValid(profileId)) {
    throw new ApiError(422, 'Invalid student profile ID.');
  }
  const profile = await StudentProfile.findOne({
    _id: profileId,
    parentUser: parentUserId,
  });
  if (!profile) {
    throw new ApiError(404, 'Student profile not found.');
  }
  return profile;
};

/**
 * GET /api/certificates/verify/:certificateNumber
 * Public endpoint — no auth required.
 */
exports.verifyCertificate = asyncHandler(async (req, res) => {
  const certNo = req.params.certificateNumber.trim().toUpperCase();

  const certificate = await Certificate.findOne({ certificateNumber: certNo })
    .populate('studentProfile')
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

  const studentName =
    certificate.recipientNameSnapshot ||
    (certificate.studentProfile ? fullNameFor(certificate.studentProfile) : null) ||
    certificate.student?.name ||
    'Verified Student';

  // Return public verification details only — no private parent contact info
  return res.json(
    new ApiResponse(200, 'Certificate verified successfully.', {
      certificateNumber: certificate.certificateNumber,
      studentName,
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
 * Authenticated parent/student.
 * Optional query: studentProfileId — filters to a specific profile after ownership verification.
 */
exports.getMyCertificates = asyncHandler(async (req, res) => {
  const { studentProfileId } = req.query;

  let filter;

  if (studentProfileId) {
    // Verify ownership (allows active or inactive profiles for historical read access)
    const profile = await resolveOwnedProfile(studentProfileId, req.user._id);
    filter = { studentProfile: profile._id, status: 'valid' };
  } else {
    // All certificates: legacy (student = user) + Phase D (studentProfile owned by user)
    const ownedProfiles = await StudentProfile.find({ parentUser: req.user._id })
      .select('_id')
      .lean();
    const profileIds = ownedProfiles.map((p) => p._id);

    filter = {
      status: 'valid',
      $or: [
        { student: req.user._id },
        ...(profileIds.length > 0 ? [{ studentProfile: { $in: profileIds } }] : []),
      ],
    };
  }

  const certificates = await Certificate.find(filter)
    .populate('studentProfile')
    .populate('course', 'title category')
    .populate('competition', 'title type')
    .sort({ issueDate: -1 })
    .lean();

  const results = certificates.map((c) => ({
    ...c,
    studentProfile: compactProfileSummary(c.studentProfile),
  }));

  return res.json(new ApiResponse(200, 'Certificates fetched successfully.', results));
});

/**
 * GET /api/certificates/:id
 * Authenticated student/parent or Admin.
 */
exports.getCertificateById = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate('studentProfile')
    .populate('student', 'name email')
    .populate('course', 'title category')
    .populate('competition', 'title type')
    .populate('issuedBy', 'name email')
    .lean();

  if (!certificate) throw new ApiError(404, 'Certificate not found.');

  // Access check: Admin OR legacy student OR parent of studentProfile
  let hasAccess = req.user.role === ROLES.ADMIN;
  if (!hasAccess && certificate.student?._id) {
    hasAccess = certificate.student._id.toString() === req.user._id.toString();
  }
  if (!hasAccess && certificate.studentProfile?.parentUser) {
    hasAccess = certificate.studentProfile.parentUser.toString() === req.user._id.toString();
  }

  if (!hasAccess) {
    throw new ApiError(403, 'Access denied. You can only view your own certificates.');
  }

  return res.json(new ApiResponse(200, 'Certificate fetched successfully.', {
    ...certificate,
    studentProfile: compactProfileSummary(certificate.studentProfile),
  }));
});

/**
 * POST /api/admin/certificates
 * Admin only — Issue a certificate to a StudentProfile.
 */
exports.issueCertificate = asyncHandler(async (req, res) => {
  const { studentProfileId, type, title, courseId, competitionId, gradeOrRank, allowDuplicate = false } = req.body;

  if (!studentProfileId || !mongoose.Types.ObjectId.isValid(studentProfileId)) {
    throw new ApiError(422, 'Invalid student profile ID.');
  }

  const profile = await StudentProfile.findById(studentProfileId);
  if (!profile) throw new ApiError(404, 'Student profile not found.');

  // Note: active profile check is NOT required for certificate issuance,
  // as certificates may represent past achievements earned before profile deactivation.

  if (type === 'course_completion' && !courseId) {
    throw new ApiError(400, 'A course is required for a course completion certificate.');
  }
  if (['competition_achievement', 'hackathon_winner'].includes(type) && !competitionId) {
    throw new ApiError(400, 'A competition is required for this certificate type.');
  }

  // Verify course/competition if provided
  if (courseId) {
    const courseDoc = await Course.findById(courseId);
    if (!courseDoc) throw new ApiError(404, 'Associated course not found.');
  }

  if (competitionId) {
    const compDoc = await Competition.findById(competitionId);
    if (!compDoc) throw new ApiError(404, 'Associated competition not found.');
  }

  // Duplicate prevention check for studentProfile
  if (!allowDuplicate) {
    const duplicateFilter = { studentProfile: studentProfileId, type, status: 'valid' };
    if (courseId) duplicateFilter.course = courseId;
    if (competitionId) duplicateFilter.competition = competitionId;

    const existing = await Certificate.findOne(duplicateFilter);
    if (existing) {
      throw new ApiError(
        409,
        `A valid certificate of type '${type}' has already been issued to this student profile for the specified course/competition.`
      );
    }
  }

  // Server-side derive full name snapshot
  const recipientName = fullNameFor(profile);

  // Generate unique certificate number
  let certNo = generateCertificateNumber();
  let attempts = 0;
  while (await Certificate.exists({ certificateNumber: certNo })) {
    certNo = generateCertificateNumber();
    attempts++;
    if (attempts > 10) throw new ApiError(500, 'Failed to generate unique certificate number.');
  }

  const certificate = await Certificate.create({
    studentProfile: studentProfileId,
    student: null,
    recipientNameSnapshot: recipientName,
    certificateNumber: certNo,
    type,
    title,
    course: courseId || null,
    competition: competitionId || null,
    gradeOrRank: gradeOrRank || null,
    issuedBy: req.user._id,
  });

  // Notify parent account owner
  notificationService.createNotification({
    recipient: profile.parentUser,
    title: 'New Digital Certificate Issued! 🎓',
    message: `A digital certificate "${title}" has been awarded to ${recipientName}. Certificate Number: ${certNo}`,
    type: 'general',
    relatedResource: certificate._id,
    relatedResourceType: 'User',
  });

  return res.status(201).json(
    new ApiResponse(201, 'Certificate issued successfully.', {
      id: certificate._id,
      certificateNumber: certificate.certificateNumber,
      studentName: recipientName,
      studentProfile: compactProfileSummary(profile),
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
    const escaped = escapeRegex(search);
    filter.$or = [
      { certificateNumber: { $regex: escaped, $options: 'i' } },
      { title: { $regex: escaped, $options: 'i' } },
      { recipientNameSnapshot: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [certificates, total] = await Promise.all([
    Certificate.find(filter)
      .populate('studentProfile')
      .populate('student', 'name email')
      .populate('course', 'title')
      .populate('competition', 'title')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Certificate.countDocuments(filter),
  ]);

  const results = certificates.map((c) => ({
    ...c,
    studentProfile: compactProfileSummary(c.studentProfile),
  }));

  return res.json(
    new ApiResponse(200, 'Certificates fetched successfully.', {
      certificates: results,
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

