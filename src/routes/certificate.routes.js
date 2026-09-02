const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificate.controller');
const certificateValidator = require('../validators/certificate.validator');
const { validate } = require('../middleware/validate.middleware');
const { verifyToken } = require('../middleware/auth.middleware');

/**
 * @swagger
 * /api/certificates/verify/{certificateNumber}:
 *   get:
 *     summary: Verify a digital certificate (Public)
 *     tags: [Certificates]
 *     parameters:
 *       - in: path
 *         name: certificateNumber
 *         required: true
 *         schema: { type: string, example: 'CERT-2026-A1B2C3D4' }
 *     responses:
 *       200:
 *         description: Certificate is valid and public verification details returned
 *       400:
 *         description: Certificate has been revoked
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/verify/:certificateNumber', certificateValidator.verifyParam, validate, certificateController.verifyCertificate);

/**
 * @swagger
 * /api/certificates/my:
 *   get:
 *     summary: Get authenticated parent's/student's digital certificates
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentProfileId
 *         required: false
 *         schema: { type: string }
 *         description: Filter certificates to a specific owned StudentProfile
 *     responses:
 *       200:
 *         description: Certificates fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/my', verifyToken, certificateValidator.myListQuery, validate, certificateController.getMyCertificates);

/**
 * @swagger
 * /api/certificates/{id}:
 *   get:
 *     summary: Get certificate details by ID
 *     tags: [Certificates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Certificate details fetched
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', verifyToken, certificateValidator.certificateIdParam, validate, certificateController.getCertificateById);

module.exports = router;
