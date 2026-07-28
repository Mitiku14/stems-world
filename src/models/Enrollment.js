const mongoose = require('mongoose');
const { ENROLLMENT_STATUS } = require('../constants');

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(ENROLLMENT_STATUS),
      default: ENROLLMENT_STATUS.PENDING,
    },

    // Relative path to uploaded PDF — only set when course.requiresDocument = true
    academicPdf: {
      type: String,
      default: null,
    },

    // Populated by admin when rejecting
    rejectionReason: {
      type: String,
      default: null,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },

    // Which admin reviewed this enrollment
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index covering the duplicate-enrollment check query:
// Enrollment.findOne({ student, course, status: { $in: [...] } })
enrollmentSchema.index({ student: 1, course: 1, status: 1 });

// Compound index for admin list: filter by status, sort by newest first
enrollmentSchema.index({ status: 1, createdAt: -1 });

// Keep simple student+course index for general lookups
enrollmentSchema.index({ student: 1, course: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
