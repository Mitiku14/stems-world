const express = require('express');
const router = express.Router();

const contactController = require('../controllers/contact.controller');
const contactValidator  = require('../validators/contact.validator');
const { validate }      = require('../middleware/validate.middleware');

/**
 * @swagger
 * /api/contact:
 *   post:
 *     summary: Submit a contact / feedback message (public)
 *     description: >
 *       Matches the frontend ContactForm fields: name, email, subject, message.
 *       No authentication required.
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, subject, message]
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               subject:
 *                 type: string
 *                 example: Question about the robotics track
 *               message:
 *                 type: string
 *                 example: Is the robotics course open to beginners?
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/', contactValidator.submit, validate, contactController.submitContact);

module.exports = router;
