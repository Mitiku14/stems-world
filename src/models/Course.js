const mongoose = require('mongoose');
const { COURSE_CATEGORIES, COURSE_LEVELS } = require('../constants');

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Course title is required'],
      unique: true,
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },

    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    category: {
      type: String,
      enum: COURSE_CATEGORIES,
      default: 'other',
    },

    level: {
      type: String,
      enum: COURSE_LEVELS,
      default: 'all',
    },

    // When true, students must upload an academic PDF when enrolling
    requiresDocument: {
      type: Boolean,
      default: false,
    },


    // Optional image URL for the course card (external URL or relative path)
    imageUrl: {
      type: String,
      default: null,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Stable string key used by the frontend (e.g. "cs-1", "math-3").
    // Allows enrollment lookup without knowing the MongoDB ObjectId.
    frontendId: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

courseSchema.index({ title: 'text', description: 'text' });
courseSchema.index({ isActive: 1 });
courseSchema.index({ category: 1 });
// frontendId index is handled by the field-level sparse:true + unique:true above

module.exports = mongoose.model('Course', courseSchema);
