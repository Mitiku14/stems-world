const Course = require('../models/Course');
const CourseSubcategory = require('../models/CourseSubcategory');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const escapeRegex = require('../utils/escapeRegex');

const paginate = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

exports.getAllCourseSubcategories = asyncHandler(async (req, res) => {
  const { category, isActive, search, page = 1, limit = 20 } = req.query;
  const p = Number(page);
  const l = Number(limit);
  const filter = {};

  if (category) filter.category = category;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [subcategories, total] = await Promise.all([
    CourseSubcategory.find(filter)
      .sort({ category: 1, name: 1, slug: 1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    CourseSubcategory.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, 'Course subcategories fetched successfully.', {
    subcategories,
    pagination: paginate(total, p, l),
  }));
});

exports.createCourseSubcategory = asyncHandler(async (req, res) => {
  const { name, slug, category, isActive } = req.body;
  const duplicate = await CourseSubcategory.exists({ slug });
  if (duplicate) throw new ApiError(409, 'Course subcategory slug already exists.');

  let subcategory;
  try {
    subcategory = await CourseSubcategory.create({
      name,
      slug,
      category,
      ...(isActive !== undefined && { isActive }),
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'A Course subcategory with this slug already exists.');
    }
    throw error;
  }

  return res.status(201).json(new ApiResponse(
    201,
    'Course subcategory created successfully.',
    subcategory
  ));
});

exports.updateCourseSubcategory = asyncHandler(async (req, res) => {
  const { name, slug, category, isActive } = req.body;
  const subcategory = await CourseSubcategory.findById(req.params.id);
  if (!subcategory) throw new ApiError(404, 'Course subcategory not found.');

  const slugChanged = slug !== undefined && slug !== subcategory.slug;
  const categoryChanged = category !== undefined && category !== subcategory.category;

  if (slugChanged || categoryChanged) {
    const referenced = await Course.exists({ subcategory: subcategory.slug });
    if (referenced) {
      throw new ApiError(
        409,
        'Cannot change the slug or category of a Course subcategory that is referenced by Courses.'
      );
    }
  }

  if (slugChanged && await CourseSubcategory.exists({ slug, _id: { $ne: subcategory._id } })) {
    throw new ApiError(409, 'Course subcategory slug already exists.');
  }

  if (name !== undefined) subcategory.name = name;
  if (slug !== undefined) subcategory.slug = slug;
  if (category !== undefined) subcategory.category = category;
  if (isActive !== undefined) subcategory.isActive = isActive;
  await subcategory.save();

  return res.json(new ApiResponse(
    200,
    'Course subcategory updated successfully.',
    subcategory
  ));
});

exports.toggleCourseSubcategoryStatus = asyncHandler(async (req, res) => {
  const subcategory = await CourseSubcategory.findById(req.params.id);
  if (!subcategory) throw new ApiError(404, 'Course subcategory not found.');

  subcategory.isActive = !subcategory.isActive;
  await subcategory.save();

  const label = subcategory.isActive ? 'activated' : 'deactivated';
  return res.json(new ApiResponse(200, `Course subcategory ${label} successfully.`, {
    id: subcategory._id,
    isActive: subcategory.isActive,
  }));
});
