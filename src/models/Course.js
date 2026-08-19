const mongoose = require('mongoose');
const { COURSE_CATEGORIES, COURSE_LEVELS } = require('../constants');

const resourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Resource title is required'],
      trim: true,
      maxlength: [150, 'Resource title cannot exceed 150 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    type: {
      type: String,
      enum: ['pdf', 'video', 'external_link', 'document', 'github_repo', 'other'],
      default: 'external_link',
      required: true,
    },
    url: {
      type: String,
      required: [true, 'Resource URL is required'],
      trim: true,
    },
    position: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

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

    // Course syllabus — list of topics/skills covered
    syllabus: [{
      type: String,
      trim: true,
    }],

    // Course resources — pdfs, videos, links, slides, github repos
    resources: [resourceSchema],

    // Instructor name
    instructor: {
      type: String,
      trim: true,
      default: null,
      maxlength: [100, 'Instructor name cannot exceed 100 characters'],
    },

    // Course duration (e.g. "12 weeks", "3 months")
    duration: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, 'Duration cannot exceed 50 characters'],
    },

    // Prerequisites
    requirements: [{
      type: String,
      trim: true,
    }],

    // Registration window — null means always open / no deadline
    registrationOpenDate: {
      type: Date,
      default: null,
    },

    registrationCloseDate: {
      type: Date,
      default: null,
    },

    // Intake label (e.g. "Fall 2026")
    season: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, 'Season cannot exceed 50 characters'],
    },

    // Maximum enrollment capacity — null means unlimited
    maxStudents: {
      type: Number,
      default: null,
      min: [1, 'Maximum students must be at least 1'],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Stable string key used by the frontend (e.g. "cs-1", "math-3").
    // Allows enrollment lookup without knowing the MongoDB ObjectId.
    frontendId: {
      type: String,
      sparse: true,
      unique: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Physical locations where this course is offered
    sites: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
    }],
  },
  { timestamps: true }
);

courseSchema.index({ title: 'text', description: 'text' });
courseSchema.index({ isActive: 1 });
courseSchema.index({ category: 1 });
// frontendId index is handled by the field-level sparse:true + unique:true above

module.exports = mongoose.model('Course', courseSchema);
