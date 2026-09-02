const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    // Legacy student reference (User)
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    // Phase D: parent-owned participant identity
    studentProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudentProfile',
      default: null,
      index: true,
    },
    // Name snapshot at time of certificate issuance
    recipientNameSnapshot: {
      type: String,
      trim: true,
      default: null,
    },
    certificateNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['course_completion', 'competition_achievement', 'hackathon_winner', 'special_recognition'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
    },
    competition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competition',
      default: null,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['valid', 'revoked'],
      default: 'valid',
      index: true,
    },
    gradeOrRank: {
      type: String,
      trim: true,
      default: null,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes
certificateSchema.index({ student: 1, createdAt: -1 });
certificateSchema.index({ studentProfile: 1, createdAt: -1 });

module.exports = mongoose.model('Certificate', certificateSchema);
