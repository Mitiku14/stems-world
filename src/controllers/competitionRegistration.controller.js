const mongoose = require('mongoose');
const CompetitionRegistration = require('../models/CompetitionRegistration');
const Competition = require('../models/Competition');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { ENROLLMENT_STATUS } = require('../constants');
const emailService = require('../services/email.service');
const notificationService = require('../services/notification.service');
const User = require('../models/User');
const escapeRegex = require('../utils/escapeRegex');

const paginate = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

const assertRegistrationAvailable = (competition, now = new Date()) => {
  if (competition.status !== 'published') {
    throw new ApiError(400, `Registration is not open for this competition (Status: ${competition.status}).`);
  }
  if (competition.registrationOpenDate && now < competition.registrationOpenDate) {
    throw new ApiError(400, `Registration opens on ${competition.registrationOpenDate.toISOString().split('T')[0]}.`);
  }
  if (competition.registrationCloseDate && now > competition.registrationCloseDate) {
    throw new ApiError(400, 'Registration has closed.');
  }
};

const assertRegistrationTypePayload = (competition, teamName, teamMembers) => {
  if (competition.type === 'individual') {
    if (teamName || (teamMembers && teamMembers.length > 0)) {
      throw new ApiError(400, 'Individual competitions cannot include teamName or teamMembers.');
    }
  } else if (competition.type === 'team') {
    if (!teamName || !teamName.trim()) {
      throw new ApiError(400, 'Team name is required for team competitions.');
    }
    if (!teamMembers || !Array.isArray(teamMembers) || teamMembers.length === 0) {
      throw new ApiError(400, 'At least one team member is required for team competitions.');
    }
  }
};

const flattenRegistration = (r) => ({
  id: r._id,
  competitionId: r.competition?._id || r.competition,
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
  progressionStatus: r.progressionStatus,
  currentRound: r.currentRound,
  roundProgress: r.roundProgress || [],
  registeredAt: r.createdAt,
  rejectionReason: r.rejectionReason || null,
  reviewedAt: r.reviewedAt || null,
});

// ── Public / Student ───────────────────────────────────────────────────────

exports.submitRegistration = asyncHandler(async (req, res) => {
  const compId = req.params.id;
  const { fullName, email, phone, grade, school, skills, motivation, teamName, teamMembers } = req.body;

  const competition = await Competition.findOne({ _id: compId, isActive: true });
  if (!competition) throw new ApiError(404, 'Competition not found or no longer available.');

  assertRegistrationAvailable(competition);
  assertRegistrationTypePayload(competition, teamName, teamMembers);

  if (!req.user && (await User.exists({ email }))) {
    throw new ApiError(409, 'An account already exists with this email. Please sign in to register.');
  }

  const regEmail = req.user ? req.user.email : email.toLowerCase().trim();
  const regName = req.user ? req.user.name : fullName;

  const duplicateFilter = {
    competition: competition._id,
    status: { $in: [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACCEPTED] },
  };
  if (req.user) duplicateFilter.student = req.user._id;
  else duplicateFilter.email = regEmail;

  let registration;
  try {
    await mongoose.connection.transaction(async (session) => {
      // Every registration writes this Competition document first. Concurrent
      // transactions for the same Competition therefore conflict and retry
      // before counting capacity or checking duplicates.
      const lockedCompetition = await Competition.findOneAndUpdate(
        { _id: competition._id, isActive: true, status: 'published' },
        { $inc: { capacityVersion: 1 } },
        { new: true, session }
      );
      if (!lockedCompetition) {
        throw new ApiError(400, 'Registration is not open for this competition.');
      }

      assertRegistrationAvailable(lockedCompetition);
      assertRegistrationTypePayload(lockedCompetition, teamName, teamMembers);

      const existing = await CompetitionRegistration.findOne(duplicateFilter).session(session);
      if (existing) {
        const msg =
          existing.status === ENROLLMENT_STATUS.PENDING
            ? 'You already have a pending registration.'
            : 'You are already registered.';
        throw new ApiError(409, msg);
      }

      const maxCap = lockedCompetition.maxRegistrations ?? lockedCompetition.maxParticipants;
      if (maxCap) {
        const activeCount = await CompetitionRegistration.countDocuments({
          competition: lockedCompetition._id,
          status: { $in: [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACCEPTED] },
        }).session(session);
        if (activeCount >= maxCap) {
          throw new ApiError(400, 'This competition has reached max capacity.');
        }
      }

      const created = await CompetitionRegistration.create([{
        competition: lockedCompetition._id,
        student: req.user ? req.user._id : null,
        fullName: regName,
        email: regEmail,
        phone: phone || null,
        grade: grade || null,
        school: school || null,
        skills: skills || [],
        motivation: motivation || null,
        teamName: lockedCompetition.type === 'team' ? teamName.trim() : null,
        teamMembers: lockedCompetition.type === 'team' ? teamMembers : [],
        status: ENROLLMENT_STATUS.PENDING,
        progressionStatus: 'not_started',
        currentRound: null,
        roundProgress: [],
      }], { session });
      [registration] = created;
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'You are already registered for this competition.');
    }
    throw error;
  }

  if (emailService.sendCompetitionRegistrationSubmittedEmail) {
    emailService.sendCompetitionRegistrationSubmittedEmail({ name: regName, email: regEmail }, competition);
  }

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

  return res.status(201).json(
    new ApiResponse(201, 'Registration submitted successfully.', {
      id: registration._id,
      status: registration.status,
      progressionStatus: registration.progressionStatus,
    })
  );
});

// Public / Student — get my registrations with progression
exports.getMyRegistrations = asyncHandler(async (req, res) => {
  const filter = {
    $or: [{ student: req.user._id }, { email: req.user.email }],
  };

  const registrations = await CompetitionRegistration.find(filter)
    .populate('competition', 'title category type scope eventStartDate status')
    .sort({ createdAt: -1 })
    .lean();

  return res.json(
    new ApiResponse(200, 'My competition registrations fetched successfully.', {
      registrations: registrations.map(flattenRegistration),
    })
  );
});

// ── Admin ──────────────────────────────────────────────────────────────────

exports.getAllRegistrations = asyncHandler(async (req, res) => {
  const { status, progressionStatus, search, competitionId, page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = {};
  if (status) filter.status = status;
  if (progressionStatus) filter.progressionStatus = progressionStatus;
  if (competitionId) filter.competition = competitionId;

  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [
      { fullName: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { teamName: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [registrations, total] = await Promise.all([
    CompetitionRegistration.find(filter)
      .populate('student', 'name email')
      .populate('competition', 'title category type rounds')
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    CompetitionRegistration.countDocuments(filter),
  ]);

  return res.json(
    new ApiResponse(200, 'Registrations fetched successfully.', {
      registrations: registrations.map(flattenRegistration),
      pagination: paginate(total, p, l),
    })
  );
});

exports.approveRegistration = asyncHandler(async (req, res) => {
  const registrationRef = await CompetitionRegistration.findById(req.params.id)
    .populate('student', 'name email')
    .populate('competition', 'title rounds status isActive');

  if (!registrationRef) throw new ApiError(404, 'Registration not found.');
  if (registrationRef.status !== ENROLLMENT_STATUS.PENDING) {
    throw new ApiError(409, `Registration is already ${registrationRef.status}.`);
  }
  if (!registrationRef.competition) {
    throw new ApiError(409, 'Cannot approve registration without an associated competition.');
  }

  const competitionId = registrationRef.competition._id || registrationRef.competition;
  let competition;
  let registration;

  await mongoose.connection.transaction(async (session) => {
    competition = await Competition.findOneAndUpdate(
      { _id: competitionId, status: 'published', isActive: true },
      { $inc: { capacityVersion: 1 } },
      { new: true, session }
    );
    if (!competition) {
      throw new ApiError(409, 'Registration can only be approved for an active published competition.');
    }

    const sortedRounds = [...(competition.rounds || [])].sort((a, b) => a.order - b.order);
    const firstRound = sortedRounds[0] || null;
    const progression = firstRound
      ? {
        progressionStatus: 'in_progress',
        currentRound: firstRound._id,
        roundProgress: [{ round: firstRound._id, status: 'pending' }],
      }
      : {
        progressionStatus: 'not_started',
        currentRound: null,
        roundProgress: [],
      };

    registration = await CompetitionRegistration.findOneAndUpdate(
      {
        _id: registrationRef._id,
        competition: competition._id,
        status: ENROLLMENT_STATUS.PENDING,
      },
      {
        $set: {
          status: ENROLLMENT_STATUS.ACCEPTED,
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
          rejectionReason: null,
          ...progression,
        },
      },
      { new: true, session, runValidators: true }
    ).populate('student', 'name email');

    if (!registration) {
      throw new ApiError(409, 'Registration approval conflict: registration is no longer pending.');
    }
  });

  const recipientName = registration.student?.name || registration.fullName;
  const recipientEmail = registration.student?.email || registration.email;
  const compObj = competition || { title: 'Competition', _id: '' };
  if (recipientEmail && emailService.sendCompetitionRegistrationApprovedEmail) {
    emailService.sendCompetitionRegistrationApprovedEmail({ name: recipientName, email: recipientEmail }, compObj);
  }

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

  return res.json(
    new ApiResponse(200, 'Registration accepted.', {
      id: registration._id,
      status: registration.status,
      progressionStatus: registration.progressionStatus,
      currentRound: registration.currentRound,
    })
  );
});

exports.rejectRegistration = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  const registration = await CompetitionRegistration.findById(req.params.id)
    .populate('student', 'name email')
    .populate('competition', 'title');

  if (!registration) throw new ApiError(404, 'Registration not found.');

  if (registration.status === ENROLLMENT_STATUS.REJECTED) {
    throw new ApiError(409, 'Registration is already rejected.');
  }

  if (registration.status === ENROLLMENT_STATUS.ACCEPTED) {
    if (registration.progressionStatus !== 'not_started' || (registration.roundProgress && registration.roundProgress.length > 0)) {
      throw new ApiError(409, 'Cannot reject registration after round progression has started.');
    }
  }

  registration.status = ENROLLMENT_STATUS.REJECTED;
  registration.rejectionReason = rejectionReason;
  registration.reviewedBy = req.user._id;
  registration.reviewedAt = new Date();
  registration.progressionStatus = 'not_started';
  registration.currentRound = null;
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

  return res.json(
    new ApiResponse(200, 'Registration rejected.', {
      id: registration._id,
      status: registration.status,
    })
  );
});

// Admin — Pass Round
exports.passRound = asyncHandler(async (req, res) => {
  const { roundId } = req.body;
  const reg = await CompetitionRegistration.findById(req.params.id).populate('competition');
  if (!reg) throw new ApiError(404, 'Registration not found.');

  const comp = reg.competition;
  if (!comp) throw new ApiError(404, 'Associated competition not found.');

  if (comp.status === 'cancelled' || comp.status === 'completed') {
    throw new ApiError(400, `Cannot process round for ${comp.status} competition.`);
  }

  if (reg.status !== ENROLLMENT_STATUS.ACCEPTED || reg.progressionStatus !== 'in_progress') {
    throw new ApiError(409, 'Registration is not actively in progress.');
  }

  if (!reg.currentRound || String(reg.currentRound) !== String(roundId)) {
    throw new ApiError(409, 'Submitted roundId does not match participant current round.');
  }

  const rounds = comp.rounds || [];
  const sortedRounds = [...rounds].sort((a, b) => a.order - b.order);
  const currentIdx = sortedRounds.findIndex((r) => String(r._id) === String(roundId));

  if (currentIdx === -1) throw new ApiError(404, 'Round not found in competition rounds.');

  const isFinalRound = currentIdx === sortedRounds.length - 1;
  const nextRound = isFinalRound ? null : sortedRounds[currentIdx + 1];

  let updateOp;
  if (isFinalRound) {
    updateOp = {
      $set: {
        'roundProgress.$.status': 'passed',
        'roundProgress.$.reviewedBy': req.user._id,
        'roundProgress.$.reviewedAt': new Date(),
        currentRound: null,
        progressionStatus: 'completed',
      },
    };
  } else {
    updateOp = {
      $set: {
        'roundProgress.$.status': 'passed',
        'roundProgress.$.reviewedBy': req.user._id,
        'roundProgress.$.reviewedAt': new Date(),
        currentRound: nextRound._id,
        progressionStatus: 'in_progress',
      },
      $push: {
        roundProgress: {
          round: nextRound._id,
          status: 'pending',
        },
      },
    };
  }

  const updatedReg = await CompetitionRegistration.findOneAndUpdate(
    {
      _id: reg._id,
      currentRound: roundId,
      progressionStatus: 'in_progress',
      'roundProgress.round': roundId,
      'roundProgress.status': 'pending',
    },
    updateOp,
    { new: true }
  );

  if (!updatedReg) {
    throw new ApiError(409, 'Round decision conflict: round already processed or inactive.');
  }

  return res.json(
    new ApiResponse(200, isFinalRound ? 'Participant passed final round and completed competition!' : 'Participant passed round.', {
      id: updatedReg._id,
      progressionStatus: updatedReg.progressionStatus,
      currentRound: updatedReg.currentRound,
      roundProgress: updatedReg.roundProgress,
    })
  );
});

// Admin — Fail Round
exports.failRound = asyncHandler(async (req, res) => {
  const { roundId } = req.body;
  const reg = await CompetitionRegistration.findById(req.params.id).populate('competition');
  if (!reg) throw new ApiError(404, 'Registration not found.');

  const comp = reg.competition;
  if (!comp) throw new ApiError(404, 'Associated competition not found.');

  if (comp.status === 'cancelled' || comp.status === 'completed') {
    throw new ApiError(400, `Cannot process round for ${comp.status} competition.`);
  }

  if (reg.status !== ENROLLMENT_STATUS.ACCEPTED || reg.progressionStatus !== 'in_progress') {
    throw new ApiError(409, 'Registration is not actively in progress.');
  }

  if (!reg.currentRound || String(reg.currentRound) !== String(roundId)) {
    throw new ApiError(409, 'Submitted roundId does not match participant current round.');
  }

  const updatedReg = await CompetitionRegistration.findOneAndUpdate(
    {
      _id: reg._id,
      currentRound: roundId,
      progressionStatus: 'in_progress',
      'roundProgress.round': roundId,
      'roundProgress.status': 'pending',
    },
    {
      $set: {
        'roundProgress.$.status': 'failed',
        'roundProgress.$.reviewedBy': req.user._id,
        'roundProgress.$.reviewedAt': new Date(),
        currentRound: null,
        progressionStatus: 'eliminated',
      },
    },
    { new: true }
  );

  if (!updatedReg) {
    throw new ApiError(409, 'Round decision conflict: round already processed or inactive.');
  }

  return res.json(
    new ApiResponse(200, 'Participant failed round and is eliminated.', {
      id: updatedReg._id,
      progressionStatus: updatedReg.progressionStatus,
      currentRound: updatedReg.currentRound,
      roundProgress: updatedReg.roundProgress,
    })
  );
});
