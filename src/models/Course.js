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

    isActive: {
      type: Boolean,
      default: true,
    },

    // Track which admin created this course
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Text index for search on title and description
courseSchema.index({ title: 'text', description: 'text' });
courseSchema.index({ isActive: 1 });
courseSchema.index({ category: 1 });

module.exports = mongoose.model('Course', courseSchema);
