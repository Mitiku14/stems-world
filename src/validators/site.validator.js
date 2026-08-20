const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

const create = [
  body('name').trim().notEmpty().withMessage('Site name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),

  body('address').optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Address cannot exceed 300 characters'),

  body('description').optional({ nullable: true }).trim()
    .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
];

const update = [
  body('name').optional().trim().notEmpty().withMessage('Site name cannot be empty')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),

  body('address').optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Address cannot exceed 300 characters'),

  body('description').optional({ nullable: true }).trim()
    .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
];

const siteIdParam = [
  param('id')
    .custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid site ID'),
];

const listQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

const publicListQuery = [
  query('search').optional().isString().withMessage('Search must be text')
    .trim().isLength({ max: 100 }).withMessage('Search cannot exceed 100 characters'),
];

module.exports = { create, update, siteIdParam, listQuery, publicListQuery };
