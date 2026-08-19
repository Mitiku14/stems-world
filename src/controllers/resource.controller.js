const Course = require('../models/Course');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

/**
 * GET /api/courses/:courseId/resources
 * Public / Student endpoint — returns active resources for accessible course sorted by position.
 */
exports.getCourseResources = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const course = await Course.findOne({ _id: courseId, isActive: true }).select('title resources isActive').lean();
  if (!course) throw new ApiError(404, 'Course not found or is inactive.');

  const activeResources = (course.resources || [])
    .filter((r) => r.isActive !== false)
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((r) => ({
      id: r._id,
      title: r.title,
      description: r.description,
      type: r.type,
      url: r.url,
      position: r.position,
      createdAt: r.createdAt,
    }));

  return res.json(new ApiResponse(200, 'Course resources fetched successfully.', activeResources));
});

/**
 * POST /api/admin/courses/:courseId/resources
 * Admin only — Add a new resource to a course.
 */
exports.addResource = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { title, description, type, url, position, isActive } = req.body;

  const course = await Course.findById(courseId);
  if (!course) throw new ApiError(404, 'Course not found.');

  const nextPos = position !== undefined ? Number(position) : (course.resources.length || 0);

  course.resources.push({
    title,
    description: description || '',
    type,
    url,
    position: nextPos,
    isActive: isActive !== undefined ? isActive : true,
  });

  await course.save();

  const createdResource = course.resources[course.resources.length - 1];
  return res.status(201).json(new ApiResponse(201, 'Resource added to course successfully.', createdResource));
});

/**
 * PUT /api/admin/courses/:courseId/resources/:resourceId
 * Admin only — Update an existing resource.
 */
exports.updateResource = asyncHandler(async (req, res) => {
  const { courseId, resourceId } = req.params;
  const { title, description, type, url, position, isActive } = req.body;

  const course = await Course.findById(courseId);
  if (!course) throw new ApiError(404, 'Course not found.');

  const resource = course.resources.id(resourceId);
  if (!resource) throw new ApiError(404, 'Resource not found in this course.');

  if (title !== undefined) resource.title = title;
  if (description !== undefined) resource.description = description;
  if (type !== undefined) resource.type = type;
  if (url !== undefined) resource.url = url;
  if (position !== undefined) resource.position = Number(position);
  if (isActive !== undefined) resource.isActive = isActive;

  await course.save();

  return res.json(new ApiResponse(200, 'Resource updated successfully.', resource));
});

/**
 * DELETE /api/admin/courses/:courseId/resources/:resourceId
 * Admin only — Remove a resource from a course.
 */
exports.deleteResource = asyncHandler(async (req, res) => {
  const { courseId, resourceId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) throw new ApiError(404, 'Course not found.');

  const resource = course.resources.id(resourceId);
  if (!resource) throw new ApiError(404, 'Resource not found in this course.');

  resource.deleteOne();
  await course.save();

  return res.json(new ApiResponse(200, 'Resource deleted successfully.'));
});

/**
 * PATCH /api/admin/courses/:courseId/resources/reorder
 * Admin only — Reorder resource positions.
 * Body: { resourceOrders: [{ resourceId, position }] }
 */
exports.reorderResources = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { resourceOrders } = req.body;

  if (!Array.isArray(resourceOrders)) {
    throw new ApiError(400, 'resourceOrders must be an array of objects containing resourceId and position.');
  }

  const course = await Course.findById(courseId);
  if (!course) throw new ApiError(404, 'Course not found.');

  const orderMap = new Map();
  resourceOrders.forEach((o) => {
    if (o.resourceId && o.position !== undefined) {
      orderMap.set(o.resourceId.toString(), Number(o.position));
    }
  });

  course.resources.forEach((r) => {
    if (orderMap.has(r._id.toString())) {
      r.position = orderMap.get(r._id.toString());
    }
  });

  await course.save();

  return res.json(new ApiResponse(200, 'Resource positions updated successfully.', course.resources));
});
