const Competition = require('../models/Competition');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

const paginate = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

// ── Public ─────────────────────────────────────────────────────────────────

// Public — list active + (open or upcoming) competitions
exports.getCompetitions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, type, scope } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = {
    isActive: true,
    status: { $in: ['open', 'upcoming', 'completed'] },
  };
  
  if (type) filter.type = type;
  if (scope) filter.scope = scope;

  const [competitions, total] = await Promise.all([
    Competition.find(filter)
      .sort({ eventStartDate: 1, createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Competition.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Competitions fetched successfully.', {
    competitions,
    pagination: paginate(total, p, l),
  }));
});

// Public — single competition
exports.getCompetition = asyncHandler(async (req, res) => {
  const competition = await Competition.findOne({ _id: req.params.id, isActive: true }).lean();
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

  return res.json(new ApiResponse(200, 'Competitions fetched successfully.', {
    competitions,
    pagination: paginate(total, p, l),
  }));
});

exports.createCompetition = asyncHandler(async (req, res) => {
  const data = req.body;
  data.createdBy = req.user._id;

  const competition = await Competition.create(data);
  return res.status(201).json(new ApiResponse(201, 'Competition created successfully.', competition));
});

exports.updateCompetition = asyncHandler(async (req, res) => {
  const data = req.body;

  const competition = await Competition.findByIdAndUpdate(
    req.params.id,
    { $set: data },
    { new: true, runValidators: true }
  );

  if (!competition) throw new ApiError(404, 'Competition not found.');
  return res.json(new ApiResponse(200, 'Competition updated successfully.', competition));
});

exports.deleteCompetition = asyncHandler(async (req, res) => {
  const competition = await Competition.findById(req.params.id);
  if (!competition) throw new ApiError(404, 'Competition not found.');

  await competition.deleteOne();
  return res.json(new ApiResponse(200, 'Competition deleted successfully.'));
});

exports.toggleCompetitionStatus = asyncHandler(async (req, res) => {
  const competition = await Competition.findById(req.params.id);
  if (!competition) throw new ApiError(404, 'Competition not found.');

  competition.isActive = !competition.isActive;
  await competition.save();

  const label = competition.isActive ? 'activated' : 'deactivated';
  return res.json(new ApiResponse(200, `Competition ${label} successfully.`, { isActive: competition.isActive }));
});
