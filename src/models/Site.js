const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Site name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    address: {
      type: String,
      trim: true,
      default: null,
      maxlength: [300, 'Address cannot exceed 300 characters'],
    },

    description: {
      type: String,
      trim: true,
      default: null,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

siteSchema.index({ isActive: 1 });

module.exports = mongoose.model('Site', siteSchema);
