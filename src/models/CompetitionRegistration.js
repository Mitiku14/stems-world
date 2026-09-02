const mongoose = require('mongoose');
const {
  ENROLLMENT_STATUS,
  COMPETITION_PROGRESSION_STATUSES,
  COMPETITION_ROUND_STATUSES,
} = require('../constants');

const roundProgressSchema = new mongoose.Schema(
  {
    round: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      enum: COMPETITION_ROUND_STATUSES,
      default: 'pending',
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
  { _id: true }
);

const competitionRegistrationSchema = new mongoose.Schema(
  {
    competition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competition',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // For authenticated students (legacy)
    },
    // Phase C: parent-owned participant identity
    studentProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudentProfile',
      default: null,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      maxlength: [20, 'Phone cannot exceed 20 characters'],
    },
    academicFile: {
      type: String,
      trim: true,
      default: null,
    },
    grade: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, 'Grade cannot exceed 50 characters'],
    },
    school: {
      type: String,
      trim: true,
      default: null,
      maxlength: [150, 'School name cannot exceed 150 characters'],
    },
    skills: [{
      type: String,
      trim: true,
    }],
    motivation: {
      type: String,
      trim: true,
      default: null,
      maxlength: [2000, 'Motivation cannot exceed 2000 characters'],
    },
    teamName: {
      type: String,
      trim: true,
      default: null,
      maxlength: [100, 'Team name cannot exceed 100 characters'],
    },
    teamMembers: [{
      type: String,
      trim: true,
    }],
    status: {
      type: String,
      enum: Object.values(ENROLLMENT_STATUS),
      default: ENROLLMENT_STATUS.PENDING,
    },
    progressionStatus: {
      type: String,
      enum: COMPETITION_PROGRESSION_STATUSES,
      default: 'not_started',
    },
    currentRound: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    roundProgress: {
      type: [roundProgressSchema],
      default: [],
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

competitionRegistrationSchema.index({ competition: 1, email: 1, status: 1 });
competitionRegistrationSchema.index({ student: 1, competition: 1 });
competitionRegistrationSchema.index({ status: 1, createdAt: -1 });

// Phase C partial unique index for active StudentProfile competition registrations (pending or accepted)
competitionRegistrationSchema.index(
  { studentProfile: 1, competition: 1 },
  {
    name: 'competition_reg_active_unique',
    unique: true,
    partialFilterExpression: {
      studentProfile: { $type: 'objectId' },
      status: { $in: ['pending', 'accepted'] },
    },
  }
);

module.exports = mongoose.model('CompetitionRegistration', competitionRegistrationSchema);
