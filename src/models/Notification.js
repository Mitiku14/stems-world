const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: [
        'enrollment_submitted',
        'enrollment_approved',
        'enrollment_rejected',
        'competition_submitted',
        'competition_approved',
        'competition_rejected',
        'announcement',
        'general',
      ],
      default: 'general',
      required: true,
    },
    relatedResource: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    relatedResourceType: {
      type: String,
      enum: ['Course', 'Enrollment', 'Competition', 'CompetitionRegistration', 'User', null],
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index for querying user notifications sorted by date
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
