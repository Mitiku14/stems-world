const mongoose = require('mongoose');
const { COMPETITION_TYPES, COMPETITION_SCOPES, COMPETITION_STATUSES } = require('../constants');

const competitionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      unique: true,
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    imageUrl: { type: String, default: null, trim: true },
    type: {
      type: String,
      enum: COMPETITION_TYPES,
      required: [true, 'Competition type is required'],
    },
    scope: {
      type: String,
      enum: COMPETITION_SCOPES,
      required: [true, 'Competition scope is required'],
    },
    registrationOpenDate: { type: Date, default: null },
    registrationCloseDate: { type: Date, default: null },
    eventStartDate: { type: Date, default: null },
    eventEndDate: { type: Date, default: null },
    location: { type: String, trim: true, default: null },
    eligibility: { type: String, trim: true, default: null },
    requirements: [{ type: String, trim: true }],
    maxParticipants: { type: Number, default: null, min: [1, 'Must be at least 1'] },
    status: {
      type: String,
      enum: COMPETITION_STATUSES,
      default: 'draft',
    },
    organizer: { type: String, trim: true, default: null },
    contactEmail: { type: String, trim: true, lowercase: true, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

competitionSchema.index({ isActive: 1, status: 1 });
competitionSchema.index({ type: 1 });
competitionSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Competition', competitionSchema);
