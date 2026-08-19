const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const notificationValidator = require('../validators/notification.validator');
const { validate } = require('../middleware/validate.middleware');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get student notifications
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: isRead
 *         schema: { type: boolean }
 *         description: Filter by read/unread status
 *     responses:
 *       200:
 *         description: Notifications fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', notificationValidator.listQuery, validate, notificationController.getNotifications);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count for badge
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/unread-count', notificationController.getUnreadCount);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.patch('/read-all', notificationController.markAllAsRead);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id/read', notificationValidator.notificationIdParam, validate, notificationController.markAsRead);

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', notificationValidator.notificationIdParam, validate, notificationController.deleteNotification);

module.exports = router;
