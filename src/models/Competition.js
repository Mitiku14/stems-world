const mongoose = require('mongoose');
const {
  COMPETITION_CATEGORIES,
  COMPETITION_TYPES,
  COMPETITION_SCOPES,
  COMPETITION_STATUSES,
} = require('../constants');

const roundSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Round name is required'],
      trim: true,
      maxlength: [100, 'Round name cannot exceed 100 characters'],
    },
    order: {
      type: Number,
      required: [true, 'Round order is required'],
      min: [1, 'Round order must be at least 1'],
    },
  },
  { _id: true }
);

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
    category: {
      type: String,
      enum: COMPETITION_CATEGORIES,
      required: [true, 'Competition category is required'],
    },
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
    registrationOpenDate: {
      type: Date,
      default: null,
      required: [function requireDateForNewCompetition() { return this.isNew; }, 'Registration open date is required'],
    },
    registrationCloseDate: {
      type: Date,
      default: null,
      required: [function requireDateForNewCompetition() { return this.isNew; }, 'Registration close date is required'],
      validate: {
        validator(value) {
          return !value || !this.registrationOpenDate || this.registrationOpenDate < value;
        },
        message: 'Registration open date must be earlier than registration close date',
      },
    },
    eventStartDate: {
      type: Date,
      default: null,
      validate: {
        validator(value) {
          return !value || !this.registrationCloseDate || this.registrationCloseDate <= value;
        },
        message: 'Registration close date cannot be later than event start date',
      },
    },
    eventEndDate: {
      type: Date,
      default: null,
      validate: {
        validator(value) {
          return !value || !this.eventStartDate || this.eventStartDate <= value;
        },
        message: 'Event start date cannot be later than event end date',
      },
    },
    location: { type: String, trim: true, default: null },
    requirements: [{ type: String, trim: true }],
    rounds: {
      type: [roundSchema],
      default: [],
      validate: [
        {
          validator(rounds) {
            return rounds.length <= 20;
          },
          message: 'Competition cannot have more than 20 rounds',
        },
        {
          validator(rounds) {
            if (!rounds.length) return true;
            const names = rounds.map((r) => r.name.toLowerCase().trim());
            return new Set(names).size === names.length;
          },
          message: 'Round names must be unique within a competition',
        },
        {
          validator(rounds) {
            if (!rounds.length) return true;
            const ids = rounds.map((round) => String(round._id));
            return new Set(ids).size === ids.length;
          },
          message: 'Round IDs must be unique within a competition',
        },
        {
          validator(rounds) {
            if (!rounds.length) return true;
            const orders = rounds.map((r) => r.order).sort((a, b) => a - b);
            return orders.every((val, idx) => val === idx + 1);
          },
          message: 'Round orders must be unique contiguous integers starting at 1 (1, 2, 3... N)',
        },
      ],
    },
    maxRegistrations: { type: Number, default: null, min: [1, 'Must be at least 1'] },
    capacityVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
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

// Virtual for backward compatibility with maxParticipants query/read
competitionSchema.virtual('maxParticipants').get(function () {
  return this.maxRegistrations;
}).set(function (val) {
  this.maxRegistrations = val;
});

competitionSchema.index({ isActive: 1, status: 1 });
competitionSchema.index({ category: 1, type: 1 });
competitionSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Competition', competitionSchema);
