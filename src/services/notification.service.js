const Notification = require('../models/Notification');
const User = require('../models/User');
const { ROLES } = require('../constants');

/**
  * Safely create a notification for a user (does not throw/crash if creation fails).
  */
const createNotification = async ({
  recipient,
  title,
  message,
  type = 'general',
  relatedResource = null,
  relatedResourceType = null,
}) => {
  try {
    if (!recipient) return null;
    return await Notification.create({
      recipient,
      title,
      message,
      type,
      relatedResource,
      relatedResourceType,
    });
  } catch (error) {
    console.error(`[NotificationService] Failed to create notification for ${recipient}:`, error.message);
    return null;
  }
};

/**
  * Helper to notify a user by email address (looks up user first).
  */
const notifyUserByEmail = async (
  email,
  { title, message, type = 'general', relatedResource = null, relatedResourceType = null }
) => {
  try {
    if (!email) return null;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return null;
    return await createNotification({
      recipient: user._id,
      title,
      message,
      type,
      relatedResource,
      relatedResourceType,
    });
  } catch (error) {
    console.error(`[NotificationService] Failed to notify by email ${email}:`, error.message);
    return null;
  }
};

/**
  * Broadcast announcement to all active student users.
  */
const broadcastAnnouncement = async ({ title, message, relatedResource = null, relatedResourceType = null }) => {
  try {
    const students = await User.find({ role: ROLES.STUDENT, isActive: true }).select('_id');
    if (!students.length) return 0;

    const notifications = students.map((s) => ({
      recipient: s._id,
      title,
      message,
      type: 'announcement',
      relatedResource,
      relatedResourceType,
    }));

    const result = await Notification.insertMany(notifications);
    return result.length;
  } catch (error) {
    console.error('[NotificationService] Failed to broadcast announcement:', error.message);
    return 0;
  }
};

module.exports = {
  createNotification,
  notifyUserByEmail,
  broadcastAnnouncement,
};
