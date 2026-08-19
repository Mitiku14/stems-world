const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

const notificationIdParam = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid notification ID'),
];

const listQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('isRead').optional().isBoolean().withMessage('isRead must be a boolean'),
];

const announcementBody = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Announcement title is required')
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),

  body('message')
    .trim()
    .notEmpty()
    .withMessage('Announcement message is required')
    .isLength({ max: 1000 })
    .withMessage('Message cannot exceed 1000 characters'),
];

module.exports = {
  notificationIdParam,
  listQuery,
  announcementBody,
};
