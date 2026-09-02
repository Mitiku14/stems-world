const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const CompetitionRegistration = require('../models/CompetitionRegistration');
const Certificate = require('../models/Certificate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

const paginate = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

const WHITELISTED_CREATE_FIELDS = [
  'title',
  'description',
  'imageUrl',
  'category',
  'type',
  'scope',
  'registrationOpenDate',
  'registrationCloseDate',
  'eventStartDate',
  'eventEndDate',
  'location',
  'requirements',
  'rounds',
  'maxRegistrations',
  'maxParticipants',
  'status',
  'organizer',
  'contactEmail',
];

const WHITELISTED_UPDATE_FIELDS = [
  'title',
  'description',
  'imageUrl',
  'category',
  'type',
  'scope',
  'registrationOpenDate',
  'registrationCloseDate',
  'eventStartDate',
  'eventEndDate',
  'location',
  'requirements',
  'rounds',
  'maxRegistrations',
  'maxParticipants',
  'status',
  'organizer',
  'contactEmail',
  'isActive',
];

const pick = (obj, keys) => {
  const result = {};
  for (const k of keys) {
    if (obj[k] !== undefined) {
      result[k] = obj[k];
    }
  }
  return result;
};

// ── Public ─────────────────────────────────────────────────────────────────

// Public — list active + (published or completed) competitions
exports.getCompetitions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, category, type, scope } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = {
    isActive: true,
    status: { $in: ['published', 'completed'] },
  };

  if (category) filter.category = category;
  if (type) filter.type = type;
  if (scope) filter.scope = scope;

  const [competitions, total] = await Promise.all([
    Competition.find(filter)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Competition.countDocuments(filter),
  ]);

  return res.json(
    new ApiResponse(200, 'Competitions fetched successfully.', {
      competitions,
      pagination: paginate(total, p, l),
    })
  );
});

// Public — single competition
exports.getCompetition = asyncHandler(async (req, res) => {
  const competition = await Competition.findOne({
    _id: req.params.id,
    isActive: true,
    status: { $in: ['published', 'completed'] },
  }).lean();
  if (!competition) throw new ApiError(404, 'Competition not found or inactive.');
  return res.json(new ApiResponse(200, 'Competition fetched successfully.', competition));
});

// ── Admin ──────────────────────────────────────────────────────────────────

// Admin — all competitions (including drafts, inactive, etc)
exports.getAllCompetitions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const [competitions, total] = await Promise.all([
    Competition.find()
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Competition.countDocuments(),
  ]);

  return res.json(
    new ApiResponse(200, 'Competitions fetched successfully.', {
      competitions,
      pagination: paginate(total, p, l),
    })
  );
});

exports.createCompetition = asyncHandler(async (req, res) => {
  const data = pick(req.body, WHITELISTED_CREATE_FIELDS);
  data.createdBy = req.user._id;

  if (data.maxParticipants !== undefined && data.maxRegistrations === undefined) {
    data.maxRegistrations = data.maxParticipants;
  }

  const competition = await Competition.create(data);
  return res.status(201).json(new ApiResponse(201, 'Competition created successfully.', competition));
});

exports.updateCompetition = asyncHandler(async (req, res) => {
  const data = pick(req.body, WHITELISTED_UPDATE_FIELDS);
  let competition;

  await mongoose.connection.transaction(async (session) => {
    // capacityVersion is the existing hidden per-Competition write token. Writing
    // it first serializes capacity checks, approval initialization, lifecycle
    // transitions, and structural round edits on the same MongoDB document.
    const existing = await Competition.findOneAndUpdate(
      { _id: req.params.id },
      { $inc: { capacityVersion: 1 } },
      { new: true, session }
    );
    if (!existing) throw new ApiError(404, 'Competition not found.');

    // Rule: Cannot set status to 'completed' while active registrations remain in_progress
    if (data.status === 'completed' && existing.status !== 'completed') {
      const activeProgression = await CompetitionRegistration.exists({
        competition: existing._id,
        progressionStatus: 'in_progress',
      }).session(session);
      if (activeProgression) {
        throw new ApiError(409, 'Cannot complete competition while registrations remain in progress.');
      }
    }

    // Rule: Cannot alter structural identity or order of rounds if any participant has roundProgress
    if (data.rounds !== undefined) {
      const existingRounds = existing.rounds || [];
      const newRounds = data.rounds || [];

      if (existingRounds.length === 0 && newRounds.length > 0) {
        const hasAcceptedRoundlessRegistration = await CompetitionRegistration.exists({
          competition: existing._id,
          status: 'accepted',
        }).session(session);

        if (hasAcceptedRoundlessRegistration) {
          throw new ApiError(
            409,
            'Cannot add rounds after registrations have been accepted for a roundless competition.'
          );
        }
      }

      const hasProgress = await CompetitionRegistration.exists({
        competition: existing._id,
        $or: [
          { currentRound: { $ne: null } },
          { 'roundProgress.0': { $exists: true } },
        ],
      }).session(session);

      const hasSameLogicalRoundPositions = existingRounds.length === newRounds.length
        && existingRounds.every((oldRound, index) => (
          Number(newRounds[index]?.order) === Number(oldRound.order)
        ));
      const hasExplicitIdentityMismatch = hasSameLogicalRoundPositions
        && existingRounds.some((oldRound, index) => (
          newRounds[index]?._id
          && String(newRounds[index]._id) !== String(oldRound._id)
        ));

      if (hasProgress) {
        // Structural check: lengths, positions, IDs, and orders must remain stable.
        // Restore omitted IDs so a safe rename does not regenerate embedded identity.
        const isStructuralMismatch = !hasSameLogicalRoundPositions || hasExplicitIdentityMismatch;

        if (isStructuralMismatch) {
          throw new ApiError(409, 'Cannot modify round structure after participant progression has started.');
        }

        data.rounds = newRounds.map((round, index) => ({
          ...round,
          _id: existingRounds[index]._id,
        }));
      } else if (hasSameLogicalRoundPositions && !hasExplicitIdentityMismatch) {
        // Name/date edits are non-structural. Preserve identity even before
        // progression when clients omit embedded IDs. Explicit replacement IDs,
        // additions, removals, and reordering retain their existing pre-progress
        // structural behavior.
        data.rounds = newRounds.map((round, index) => ({
          ...round,
          _id: existingRounds[index]._id,
        }));
      }
    }

    if (data.maxParticipants !== undefined && data.maxRegistrations === undefined) {
      data.maxRegistrations = data.maxParticipants;
    }

    Object.assign(existing, data);
    await existing.save({ session });
    competition = existing;
  });

  return res.json(new ApiResponse(200, 'Competition updated successfully.', competition));
});

exports.deleteCompetition = asyncHandler(async (req, res) => {
  const competition = await Competition.findById(req.params.id);
  if (!competition) throw new ApiError(404, 'Competition not found.');

  const [hasRegistrations, hasCertificates] = await Promise.all([
    CompetitionRegistration.exists({ competition: competition._id }),
    Certificate.exists({ competition: competition._id }),
  ]);
  if (hasRegistrations || hasCertificates) {
    throw new ApiError(409, 'Cannot delete competition with existing registrations or certificates.');
  }

  await competition.deleteOne();
  return res.json(new ApiResponse(200, 'Competition deleted successfully.'));
});

exports.toggleCompetitionStatus = asyncHandler(async (req, res) => {
  let competition;
  await mongoose.connection.transaction(async (session) => {
    competition = await Competition.findOneAndUpdate(
      { _id: req.params.id },
      { $inc: { capacityVersion: 1 } },
      { new: true, session }
    );
    if (!competition) throw new ApiError(404, 'Competition not found.');

    competition.isActive = !competition.isActive;
    await competition.save({ session });
  });

  const label = competition.isActive ? 'activated' : 'deactivated';
  return res.json(new ApiResponse(200, `Competition ${label} successfully.`, { isActive: competition.isActive }));
});
