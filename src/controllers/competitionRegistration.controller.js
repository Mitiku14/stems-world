const CompetitionRegistration = require('../models/CompetitionRegistration');
const Competition = require('../models/Competition');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ENROLLMENT_STATUS } = require('../constants');
const emailService = require('../services/email.service');
const notificationService = require('../services/notification.service');

const paginate = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

/**
 * Helper to flatten registration structure for the frontend
 */
const flattenRegistration = (r) => ({
  id: r._id,
  competitionTitle: r.competition?.title || '—',
  studentName: r.student?.name || r.fullName || '—',
  email: r.student?.email || r.email || '—',
  phone: r.phone,
  grade: r.grade,
  school: r.school,
  skills: r.skills,
  motivation: r.motivation,
  teamName: r.teamName,
  teamMembers: r.teamMembers,
  status: r.status,
  registeredAt: r.createdAt,
  rejectionReason: r.rejectionReason || null,
  reviewedAt: r.reviewedAt || null,
});

// ── Public ─────────────────────────────────────────────────────────────────

exports.submitRegistration = asyncHandler(async (req, res) => {
  const compId = req.params.id;
  const { fullName, email, phone, grade, school, skills, motivation, teamName, teamMembers } = req.body;

  const competition = await Competition.findOne({ _id: compId, isActive: true });
  if (!competition) throw new ApiError(404, 'Competition not found or no longer available.');

  if (competition.status !== 'open') {
    throw new ApiError(400, `Registration is not open for this competition (Status: ${competition.status}).`);
  }

  // Registration window
  const now = new Date();
  if (competition.registrationOpenDate && now < competition.registrationOpenDate) {
    throw new ApiError(400, `Registration opens on ${competition.registrationOpenDate.toISOString().split('T')[0]}.`);
  }
  if (competition.registrationCloseDate && now > competition.registrationCloseDate) {
    throw new ApiError(400, 'Registration has closed.');
  }

  // Max participants
  if (competition.maxParticipants) {
    const acceptedCount = await CompetitionRegistration.countDocuments({
      competition: competition._id,
      status: { $in: [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACCEPTED] },
    });
    if (acceptedCount >= competition.maxParticipants) {
      throw new ApiError(400, 'This competition has reached max capacity.');
    }
  }

  const regEmail = req.user ? req.user.email : email.toLowerCase().trim();
  const regName = req.user ? req.user.name : fullName;

  // Duplicate check
  const duplicateFilter = {
    competition: competition._id,
    status: { $in: [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACCEPTED] },
  };
  if (req.user) duplicateFilter.student = req.user._id;
  else duplicateFilter.email = regEmail;

  const existing = await CompetitionRegistration.findOne(duplicateFilter);
  if (existing) {
    const msg = existing.status === ENROLLMENT_STATUS.PENDING
      ? 'You already have a pending registration.'
      : 'You are already registered.';
    throw new ApiError(409, msg);
  }

  const registration = await CompetitionRegistration.create({
    competition: competition._id,
    student: req.user ? req.user._id : null,
    fullName: regName,
    email: regEmail,
    phone: phone || null,
    grade: grade || null,
    school: school || null,
    skills: skills || [],
    motivation: motivation || null,
    teamName: teamName || null,
    teamMembers: teamMembers || [],
  });

  if (emailService.sendCompetitionRegistrationSubmittedEmail) {
    emailService.sendCompetitionRegistrationSubmittedEmail({ name: regName, email: regEmail }, competition);
  }

  // In-app notification
  if (req.user) {
    notificationService.createNotification({
      recipient: req.user._id,
      title: 'Competition Registration Submitted',
      message: `Your registration for "${competition.title}" has been submitted.`,
      type: 'competition_submitted',
      relatedResource: registration._id,
      relatedResourceType: 'CompetitionRegistration',
    });
  } else if (regEmail) {
    notificationService.notifyUserByEmail(regEmail, {
      title: 'Competition Registration Submitted',
      message: `Your registration for "${competition.title}" has been submitted.`,
      type: 'competition_submitted',
      relatedResource: registration._id,
      relatedResourceType: 'CompetitionRegistration',
    });
  }

  return res.status(201).json(new ApiResponse(201, 'Registration submitted successfully.', {
    id: registration._id,
    status: registration.status,
  }));
});


// ── Admin ──────────────────────────────────────────────────────────────────

exports.getAllRegistrations = asyncHandler(async (req, res) => {
  const { status, search, competitionId, page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = {};
  if (status) filter.status = status;
  if (competitionId) filter.competition = competitionId;

  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { teamName: { $regex: search, $options: 'i' } },
    ];
  }

  const [registrations, total] = await Promise.all([
    CompetitionRegistration.find(filter)
      .populate('student', 'name email')
      .populate('competition', 'title')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    CompetitionRegistration.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Registrations fetched successfully.', {
    registrations: registrations.map(flattenRegistration),
    pagination: paginate(total, p, l),
  }));
});

exports.approveRegistration = asyncHandler(async (req, res) => {
  const registration = await CompetitionRegistration.findById(req.params.id)
    .populate('student', 'name email')
    .populate('competition', 'title');

  if (!registration) throw new ApiError(404, 'Registration not found.');
  if (registration.status !== ENROLLMENT_STATUS.PENDING) {
    throw new ApiError(409, `Registration is already ${registration.status}.`);
  }

  registration.status = ENROLLMENT_STATUS.ACCEPTED;
  registration.reviewedBy = req.user._id;
  registration.reviewedAt = new Date();
  registration.rejectionReason = null;
  await registration.save();

  const recipientName = registration.student?.name || registration.fullName;
  const recipientEmail = registration.student?.email || registration.email;
  const compObj = registration.competition || { title: 'Competition', _id: '' };
  if (recipientEmail && emailService.sendCompetitionRegistrationApprovedEmail) {
    emailService.sendCompetitionRegistrationApprovedEmail({ name: recipientName, email: recipientEmail }, compObj);
  }

  // In-app notification
  if (registration.student?._id) {
    notificationService.createNotification({
      recipient: registration.student._id,
      title: 'Competition Registration Approved! 🎉',
      message: `Your registration for "${compObj.title}" has been approved.`,
      type: 'competition_approved',
      relatedResource: registration._id,
      relatedResourceType: 'CompetitionRegistration',
    });
  } else if (recipientEmail) {
    notificationService.notifyUserByEmail(recipientEmail, {
      title: 'Competition Registration Approved! 🎉',
      message: `Your registration for "${compObj.title}" has been approved.`,
      type: 'competition_approved',
      relatedResource: registration._id,
      relatedResourceType: 'CompetitionRegistration',
    });
  }

  return res.json(new ApiResponse(200, 'Registration accepted.', {
    id: registration._id,
    status: registration.status,
  }));
});

exports.rejectRegistration = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  const registration = await CompetitionRegistration.findById(req.params.id)
    .populate('student', 'name email')
    .populate('competition', 'title');

  if (!registration) throw new ApiError(404, 'Registration not found.');
  if (registration.status !== ENROLLMENT_STATUS.PENDING) {
    throw new ApiError(409, `Registration is already ${registration.status}.`);
  }

  registration.status = ENROLLMENT_STATUS.REJECTED;
  registration.rejectionReason = rejectionReason;
  registration.reviewedBy = req.user._id;
  registration.reviewedAt = new Date();
  await registration.save();

  const recipientName = registration.student?.name || registration.fullName;
  const recipientEmail = registration.student?.email || registration.email;
  const compObj = registration.competition || { title: 'Competition', _id: '' };
  if (recipientEmail && emailService.sendCompetitionRegistrationRejectedEmail) {
    emailService.sendCompetitionRegistrationRejectedEmail(
      { name: recipientName, email: recipientEmail }, 
      compObj,
      registration.rejectionReason
    );
  }

  // In-app notification
  if (registration.student?._id) {
    notificationService.createNotification({
      recipient: registration.student._id,
      title: 'Competition Registration Status Update',
      message: `Your registration for "${compObj.title}" was not approved. ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`,
      type: 'competition_rejected',
      relatedResource: registration._id,
      relatedResourceType: 'CompetitionRegistration',
    });
  } else if (recipientEmail) {
    notificationService.notifyUserByEmail(recipientEmail, {
      title: 'Competition Registration Status Update',
      message: `Your registration for "${compObj.title}" was not approved. ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`,
      type: 'competition_rejected',
      relatedResource: registration._id,
      relatedResourceType: 'CompetitionRegistration',
    });
  }

  return res.json(new ApiResponse(200, 'Registration rejected.', {
    id: registration._id,
    status: registration.status,
  }));
});
