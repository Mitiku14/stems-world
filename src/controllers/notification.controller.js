const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');

exports.getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, isRead } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const filter = { recipient: req.user._id };
  if (isRead !== undefined) {
    filter.isRead = isRead === 'true';
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: req.user._id, isRead: false }),
  ]);

  return res.json(
    new ApiResponse(200, 'Notifications fetched successfully.', {
      notifications: notifications.map((n) => ({
        id: n._id,
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.isRead,
        relatedResource: n.relatedResource,
        relatedResourceType: n.relatedResourceType,
        createdAt: n.createdAt,
      })),
      unreadCount,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    })
  );
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
  return res.json(new ApiResponse(200, 'Unread notification count fetched.', { unreadCount }));
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user._id });
  if (!notification) throw new ApiError(404, 'Notification not found.');

  if (!notification.isRead) {
    notification.isRead = true;
    await notification.save();
  }

  return res.json(
    new ApiResponse(200, 'Notification marked as read.', {
      id: notification._id,
      isRead: notification.isRead,
    })
  );
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
  return res.json(
    new ApiResponse(200, 'All notifications marked as read.', {
      modifiedCount: result.modifiedCount,
    })
  );
});

exports.deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
  if (!notification) throw new ApiError(404, 'Notification not found.');

  return res.json(new ApiResponse(200, 'Notification deleted successfully.'));
});

exports.createAnnouncement = asyncHandler(async (req, res) => {
  const { title, message } = req.body;
  const count = await notificationService.broadcastAnnouncement({ title, message });

  return res.status(201).json(
    new ApiResponse(201, `Announcement sent to ${count} students successfully.`, {
      recipientsCount: count,
    })
  );
});
