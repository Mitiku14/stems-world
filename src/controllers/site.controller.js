const Site = require('../models/Site');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

const paginate = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * GET /api/sites
 * Public — returns active sites only.
 */
exports.getActiveSites = asyncHandler(async (_req, res) => {
  const sites = await Site.find({ isActive: true })
    .select('name address description')
    .sort({ name: 1 })
    .lean();

  return res.json(new ApiResponse(200, 'Sites fetched successfully.', { sites }));
});

// ── Admin ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/sites
 * Admin — returns ALL sites (including inactive) with pagination.
 */
exports.getAllSites = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
    ];
  }

  const [sites, total] = await Promise.all([
    Site.find(filter)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Site.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Sites fetched successfully.', {
    sites,
    pagination: paginate(total, p, l),
  }));
});

/**
 * POST /api/admin/sites
 * Admin — create a new site.
 */
exports.createSite = asyncHandler(async (req, res) => {
  const { name, address, description } = req.body;
  const site = await Site.create({ name, address, description });
  return res.status(201).json(new ApiResponse(201, 'Site created successfully.', site));
});

/**
 * PUT /api/admin/sites/:id
 * Admin — update a site.
 */
exports.updateSite = asyncHandler(async (req, res) => {
  const { name, address, description } = req.body;

  const updates = {};
  if (name !== undefined)        updates.name = name;
  if (address !== undefined)     updates.address = address || null;
  if (description !== undefined) updates.description = description || null;

  const site = await Site.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  );

  if (!site) throw new ApiError(404, 'Site not found.');
  return res.json(new ApiResponse(200, 'Site updated successfully.', site));
});

/**
 * PATCH /api/admin/sites/:id/toggle-status
 * Admin — toggle isActive.
 */
exports.toggleSiteStatus = asyncHandler(async (req, res) => {
  const site = await Site.findById(req.params.id);
  if (!site) throw new ApiError(404, 'Site not found.');

  site.isActive = !site.isActive;
  await site.save();

  const label = site.isActive ? 'activated' : 'deactivated';
  return res.json(new ApiResponse(200, `Site ${label} successfully.`, {
    id: site._id,
    isActive: site.isActive,
  }));
});
