const Enrollment = require('../models/Enrollment');
const Course     = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');
const asyncHandler = require('../utils/asyncHandler');
const ApiError   = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ENROLLMENT_STATUS } = require('../constants');
const emailService = require('../services/email.service');
const notificationService = require('../services/notification.service');
const mongoose = require('mongoose');
const User = require('../models/User');
const escapeRegex = require('../utils/escapeRegex');
const { fullNameFor, compactProfileSummary } = require('../utils/studentProfile');

// Active enrollment statuses that block duplicate enrollment
const ACTIVE_ENROLLMENT_STATUSES = [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACCEPTED];

/**
 * Strict classifier for active enrollment duplicate index errors.
 * Rejects duplicate _id errors, bare code 11000 errors, or unrelated unique index errors.
 */
function isEnrollmentDuplicateError(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.code !== 11000 && error.code !== 11001) return false;

  if (error.indexName === 'enrollment_active_unique') return true;
  if (typeof error.message === 'string' && error.message.includes('enrollment_active_unique')) return true;

  const keyPattern = error.keyPattern || {};
  const hasProfileKey = Boolean(keyPattern.studentProfile);
  const hasCourseKey = Boolean(keyPattern.course);
  const keyCount = Object.keys(keyPattern).length;

  if (hasProfileKey && hasCourseKey && keyCount === 2) {
    return true;
  }

  return false;
}

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
    title: { $regex: new RegExp(escapeRegex(courseType), 'i') },
    isActive: true,
  });
};

/**
 * Validates and retrieves a StudentProfile owned by the authenticated user.
 * Allows inactive profiles for historical read access.
 */
const resolveOwnedProfile = async (studentProfileId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(studentProfileId)) {
    throw new ApiError(422, 'Invalid student profile ID.');
  }

  const profile = await StudentProfile.findOne({
    _id: studentProfileId,
    parentUser: userId,
  }).lean();

  if (!profile) {
    throw new ApiError(404, 'Student profile not found.');
  }

  return profile;
};

/**
 * Validates and retrieves an active StudentProfile owned by the authenticated user.
 * Required for new activity creation.
 */
const resolveOwnedActiveProfile = async (studentProfileId, userId) => {
  const profile = await resolveOwnedProfile(studentProfileId, userId);
  if (!profile.isActive) {
    throw new ApiError(400, 'Student profile is not active.');
  }
  return profile;
};

/**
 * POST /api/enrollments
 * Supports both anonymous (legacy) and authenticated enrollment.
 * Authenticated users with studentProfileId get StudentProfile-based enrollment.
 */
exports.submitEnrollment = asyncHandler(async (req, res) => {
  const { studentName, email, courseType, academicPdf, grade, site, studentProfileId } = req.body;

  const course = await resolveCourse(courseType);
  if (!course) throw new ApiError(404, 'Course not found or is no longer available.');

  // ── Registration window check ──
  const now = new Date();
  if (course.registrationOpenDate && now < course.registrationOpenDate) {
    throw new ApiError(400, `Registration for this course opens on ${course.registrationOpenDate.toISOString().split('T')[0]}.`);
  }
  if (course.registrationCloseDate && now > course.registrationCloseDate) {
    throw new ApiError(400, 'Registration for this course has closed.');
  }

  // ── Max capacity check ──
  if (course.maxStudents) {
    const acceptedCount = await Enrollment.countDocuments({
      course: course._id,
      status: { $in: ACTIVE_ENROLLMENT_STATUSES },
    });
    if (acceptedCount >= course.maxStudents) {
      throw new ApiError(400, 'This course has reached its maximum enrollment capacity.');
    }
  }

  // ── Phase C: authenticated StudentProfile-based enrollment ──
  if (req.user) {
    if (!studentProfileId) {
      throw new ApiError(400, 'studentProfileId is required for authenticated enrollments.');
    }

    const profile = await resolveOwnedActiveProfile(studentProfileId, req.user._id);

    // Duplicate check: same StudentProfile + same course in active status
    const duplicateFilter = {
      studentProfile: profile._id,
      course: course._id,
      status: { $in: ACTIVE_ENROLLMENT_STATUSES },
    };

    const existing = await Enrollment.findOne(duplicateFilter);
    if (existing) {
      const msg = existing.status === ENROLLMENT_STATUS.PENDING
        ? 'This student already has a pending enrollment for this course.'
        : 'This student is already accepted for this course.';
      throw new ApiError(409, msg);
    }

    // ── Site validation ──
    if (site) {
      const Site = require('../models/Site');
      const siteDoc = await Site.findOne({ _id: site, isActive: true });
      if (!siteDoc) throw new ApiError(400, 'Selected site is not available.');
      if (!(course.sites || []).some((courseSite) => courseSite.toString() === site.toString())) {
        throw new ApiError(400, 'Selected site is not offered for this course.');
      }
    }

    // ── Document check ──
    if (course.requiresDocument && !academicPdf) {
      throw new ApiError(400, 'An academic PDF public URL is required to enroll in this course.');
    }

    // Derive participant snapshot from StudentProfile
    const participantName = fullNameFor(profile);

    let enrollment;
    try {
      enrollment = await Enrollment.create({
        student: null,
        studentProfile: profile._id,
        studentName: participantName,
        studentEmail: req.user.email || null,
        course: course._id,
        academicPdf: academicPdf || null,
        grade: profile.grade || grade || null,
        site: site || null,
      });
    } catch (error) {
      if (isEnrollmentDuplicateError(error)) {
        throw new ApiError(409, 'This student already has an active enrollment for this course.');
      }
      throw error;
    }

    // Confirmation email to parent account
    if (req.user.email) {
      emailService.sendEnrollmentSubmittedEmail(
        { name: participantName, email: req.user.email },
        course
      );
    }

    // In-app notification to parent
    notificationService.createNotification({
      recipient: req.user._id,
      title: 'Course Enrollment Submitted',
      message: `Enrollment for "${participantName}" in "${course.title}" has been submitted.`,
      type: 'enrollment_submitted',
      relatedResource: enrollment._id,
      relatedResourceType: 'Enrollment',
    });

    return res.status(201).json(
      new ApiResponse(201, 'Enrollment submitted successfully. You will be notified once it has been reviewed.', {
        id: enrollment._id,
        studentName: participantName,
        studentProfile: compactProfileSummary(profile),
        course: { id: course._id, title: course.title },
        status: enrollment.status,
        submittedAt: enrollment.createdAt,
      })
    );
  }

  // ── Legacy path: anonymous or authenticated-without-profile ──
  if (!req.user && await User.exists({ email })) {
    throw new ApiError(409, 'An account already exists with this email. Please sign in to enroll.');
  }

  // ── Determine student identity ──
  const enrollmentEmail = req.user ? req.user.email : email.toLowerCase().trim();
  const enrollmentName = req.user ? req.user.name : studentName;

  // ── Duplicate check ──
  const duplicateFilter = {
    course: course._id,
    status: { $in: ACTIVE_ENROLLMENT_STATUSES },
  };
  if (req.user) {
    duplicateFilter.student = req.user._id;
  } else {
    duplicateFilter.studentEmail = enrollmentEmail;
  }

  const existing = await Enrollment.findOne(duplicateFilter);
  if (existing) {
    const msg = existing.status === ENROLLMENT_STATUS.PENDING
      ? 'You already have a pending enrollment for this course.'
      : 'You are already accepted for this course.';
    throw new ApiError(409, msg);
  }

  // ── Site validation ──
  if (site) {
    const Site = require('../models/Site');
    const siteDoc = await Site.findOne({ _id: site, isActive: true });
    if (!siteDoc) throw new ApiError(400, 'Selected site is not available.');
    if (!(course.sites || []).some((courseSite) => courseSite.toString() === site.toString())) {
      throw new ApiError(400, 'Selected site is not offered for this course.');
    }
  }

  // ── Document check ──
  if (course.requiresDocument && !academicPdf) {
    throw new ApiError(400, 'An academic PDF public URL is required to enroll in this course.');
  }

  // ── Create enrollment ──
  const enrollment = await Enrollment.create({
    student: req.user ? req.user._id : null,
    studentName: enrollmentName,
    studentEmail: enrollmentEmail,
    course: course._id,
    academicPdf: academicPdf || null,
    grade: grade || null,
    site: site || null,
  });

  // Confirmation email
  emailService.sendEnrollmentSubmittedEmail(
    { name: enrollmentName, email: enrollmentEmail },
    course
  );

  // In-app notification
  if (req.user) {
    notificationService.createNotification({
      recipient: req.user._id,
      title: 'Course Enrollment Submitted',
      message: `Your enrollment request for "${course.title}" has been submitted.`,
      type: 'enrollment_submitted',
      relatedResource: enrollment._id,
      relatedResourceType: 'Enrollment',
    });
  } else if (enrollmentEmail) {
    notificationService.notifyUserByEmail(enrollmentEmail, {
      title: 'Course Enrollment Submitted',
      message: `Your enrollment request for "${course.title}" has been submitted.`,
      type: 'enrollment_submitted',
      relatedResource: enrollment._id,
      relatedResourceType: 'Enrollment',
    });
  }

  return res.status(201).json(
    new ApiResponse(201, 'Enrollment submitted successfully. You will be notified once it has been reviewed.', {
      id: enrollment._id,
      studentName: enrollmentName,
      course: { id: course._id, title: course.title },
      status: enrollment.status,
      submittedAt: enrollment.createdAt,
    })
  );
});

/**
 * GET /api/enrollments/my
 * Authenticated student/parent. Returns enrollments across all owned StudentProfiles,
 * plus legacy enrollments linked to this User directly.
 * Optional query: studentProfileId — filters to a specific profile after ownership verification.
 */
exports.getMyEnrollments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10, studentProfileId } = req.query;
  const p = Number(page);
  const l = Number(limit);

  let filter;

  if (studentProfileId) {
    // Verify ownership (allows active or inactive profiles for historical read access)
    const profile = await resolveOwnedProfile(studentProfileId, req.user._id);
    filter = { studentProfile: profile._id };
  } else {
    // All enrollments: legacy (student = user) + Phase C (studentProfile owned by user)
    const ownedProfiles = await StudentProfile.find({ parentUser: req.user._id })
      .select('_id')
      .lean();
    const profileIds = ownedProfiles.map((p) => p._id);

    filter = {
      $or: [
        { student: req.user._id },
        ...(profileIds.length > 0 ? [{ studentProfile: { $in: profileIds } }] : []),
      ],
    };
  }

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
      .populate('studentProfile')
      .select('course status academicPdf rejectionReason createdAt reviewedAt studentProfile studentName')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Enrollment.countDocuments(filter),
  ]);

  const results = enrollments.map((e) => ({
    ...e,
    studentProfile: compactProfileSummary(e.studentProfile),
  }));

  return res.json(new ApiResponse(200, 'Enrollments fetched successfully.', {
    enrollments: results,
    pagination: { total, page: p, limit: l, totalPages: Math.ceil(total / l) },
  }));
});

/**
 * GET /api/enrollments/my/:id
 * Authenticated student only.
 */
exports.getMyEnrollmentById = asyncHandler(async (req, res) => {
  // Try legacy path first
  let enrollment = await Enrollment.findOne({ _id: req.params.id, student: req.user._id })
    .populate('course', 'title description category level requiresDocument')
    .populate('studentProfile')
    .lean();

  // If not found via legacy, try StudentProfile ownership
  if (!enrollment) {
    const ownedProfiles = await StudentProfile.find({ parentUser: req.user._id })
      .select('_id')
      .lean();
    const profileIds = ownedProfiles.map((p) => p._id);

    if (profileIds.length > 0) {
      enrollment = await Enrollment.findOne({
        _id: req.params.id,
        studentProfile: { $in: profileIds },
      })
        .populate('course', 'title description category level requiresDocument')
        .populate('studentProfile')
        .lean();
    }
  }

  if (!enrollment) throw new ApiError(404, 'Enrollment not found.');

  return res.json(new ApiResponse(200, 'Enrollment fetched successfully.', {
    ...enrollment,
    studentProfile: compactProfileSummary(enrollment.studentProfile),
  }));
});

// Exported for testing
exports.resolveOwnedActiveProfile = resolveOwnedActiveProfile;
exports.ACTIVE_ENROLLMENT_STATUSES = ACTIVE_ENROLLMENT_STATUSES;
