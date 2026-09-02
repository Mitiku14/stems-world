const mongoose = require('mongoose');
const { normalizeNameComponent, fullNameFor } = require('../utils/studentProfile');

const studentProfileSchema = new mongoose.Schema(
  {
    parentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Parent user is required'],
      immutable: true,
    },
    slot: {
      type: Number,
      required: [true, 'Student profile slot is required'],
      min: [1, 'Student profile slot must be between 1 and 5'],
      max: [5, 'Student profile slot must be between 1 and 5'],
    },
    givenName: {
      type: String,
      required: [true, 'Given name is required'],
      trim: true,
      set: normalizeNameComponent,
    },
    fatherName: {
      type: String,
      required: [true, 'Father name is required'],
      trim: true,
      set: normalizeNameComponent,
    },
    grandfatherName: {
      type: String,
      required: [true, 'Grandfather name is required'],
      trim: true,
      set: normalizeNameComponent,
    },
    grade: {
      type: String,
      default: null,
      trim: true,
    },
    school: {
      type: String,
      default: null,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

studentProfileSchema.virtual('fullName').get(function getFullName() {
  return fullNameFor(this);
});

studentProfileSchema.index(
  { parentUser: 1, slot: 1 },
  { unique: true }
);

studentProfileSchema.index({ parentUser: 1, isActive: 1 });

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
