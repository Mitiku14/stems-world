const { body } = require('express-validator');

const createAdmin = [
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
];

module.exports = {
  createAdmin,
};
