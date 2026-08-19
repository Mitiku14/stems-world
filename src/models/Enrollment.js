const mongoose = require('mongoose');
const { ENROLLMENT_STATUS } = require('../constants');

const enrollmentSchema = new mongoose.Schema(
  {
    // For authenticated enrollments: set from JWT
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // For anonymous enrollments: stored directly from form fields
    studentName: {
      type: String,
      trim: true,
      default: null,
    },

    studentEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
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

    // Student's current grade/class level
    grade: {
      type: String,
      trim: true,
      default: null,
      maxlength: [20, 'Grade cannot exceed 20 characters'],
    },

    // Which site the student selected for in-person classes
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
    },

    academicPdf: {
      type: String,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },

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
  { timestamps: true }
);

enrollmentSchema.index({ student: 1, course: 1, status: 1 });
enrollmentSchema.index({ studentEmail: 1, course: 1, status: 1 });
enrollmentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
