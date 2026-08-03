const express = require('express');
const router = express.Router();

const enrollmentController = require('../controllers/enrollment.controller');
const enrollmentValidator  = require('../validators/enrollment.validator');
const { validate }         = require('../middleware/validate.middleware');
const { verifyToken }      = require('../middleware/auth.middleware');
const { requireRole }      = require('../middleware/role.middleware');
const { ROLES }            = require('../constants');

/**
 * @swagger
 * /api/enrollments:
 *   post:
 *     summary: Submit a course enrollment (public)
 *     description: >
 *       Submits an enrollment request for a course. **No authentication required.**
 *       The frontend form is shown to anonymous visitors.
 *
 *       `courseType` can be:
 *       - A frontend ID like `"cs-1"`, `"math-3"`, `"english-1"`
 *       - A MongoDB ObjectId
 *       - A partial course title (case-insensitive)
 *
 *       Request must use `application/json`.
 *     tags: [Enrollments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentName, email, courseType]
 *             properties:
 *               studentName:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               courseType:
 *                 type: string
 *                 example: cs-1
 *                 description: Frontend ID, ObjectId, or course title
 *               academicPdf:
 *                 type: string
 *                 format: uri
 *                 description: Public URL to the academic PDF. Required if requiresDocument=true.
 *     responses:
 *       201:
 *         description: Enrollment submitted successfully
 *       400:
 *         description: PDF required but not provided
 *       404:
 *         description: Course not found
 *       409:
 *         description: Duplicate pending or accepted enrollment
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post(
  '/',
  enrollmentValidator.submit,
  validate,
  enrollmentController.submitEnrollment
);

// The following routes still require an authenticated student
router.use(verifyToken, requireRole(ROLES.STUDENT));

/**
 * @swagger
 * /api/enrollments/my:
 *   get:
 *     summary: Get all enrollments for the current student
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, rejected]
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Enrollments fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/my', enrollmentController.getMyEnrollments);

/**
 * @swagger
 * /api/enrollments/my/{id}:
 *   get:
 *     summary: Get a specific enrollment by ID
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Enrollment fetched successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/my/:id', enrollmentValidator.enrollmentIdParam, validate, enrollmentController.getMyEnrollmentById);

module.exports = router;
