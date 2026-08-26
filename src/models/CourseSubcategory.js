const mongoose = require('mongoose');
const { COURSE_CATEGORIES, COURSE_SUBCATEGORY_SLUG_REGEX } = require('../constants');

const courseSubcategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Course subcategory name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Course subcategory slug is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Slug cannot exceed 100 characters'],
      match: [
        COURSE_SUBCATEGORY_SLUG_REGEX,
        'Slug must contain only lowercase letters, numbers, and single underscores',
      ],
    },
    category: {
      type: String,
      required: [true, 'Course subcategory category is required'],
      enum: COURSE_CATEGORIES,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

courseSubcategorySchema.index({ category: 1, isActive: 1, name: 1 });

module.exports = mongoose.model('CourseSubcategory', courseSubcategorySchema);
