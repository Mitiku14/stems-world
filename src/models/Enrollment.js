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
enrollmentSchema.index({ status: 1, createdAt: -1 });
enrollmentSchema.index({ student: 1, course: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
