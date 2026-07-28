const express = require('express');
const router = express.Router();

const enrollmentController = require('../controllers/enrollment.controller');
const enrollmentValidator = require('../validators/enrollment.validator');
const { validate } = require('../middleware/validate.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const upload = require('../config/multer');
const { ROLES } = require('../constants');

// All enrollment routes require an authenticated student
router.use(verifyToken, requireRole(ROLES.STUDENT));

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/enrollments:
 *   post:
 *     summary: Submit a course enrollment
 *     description: >
 *       Submits an enrollment request for a course.
 *
 *       **Rules:**
 *       - Student cannot have a pending or approved enrollment for the same course
 *       - If `course.requiresDocument = true`, an academic PDF must be uploaded
 *       - Request must use `multipart/form-data` (even when no file is attached)
 *       - PDF file size limit: **5 MB**
 *       - Only PDF files are accepted
 *
 *       A confirmation email is sent to the student upon successful submission.
 *       The enrollment starts with status `pending` and awaits admin review.
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [courseId]
 *             properties:
 *               courseId:
 *                 type: string
 *                 description: MongoDB ObjectId of the course to enroll in
 *                 example: 64a1b2c3d4e5f6789012abcd
 *               academicPdf:
 *                 type: string
 *                 format: binary
 *                 description: >
 *                   Academic PDF document (required only if the course has
 *                   `requiresDocument = true`). Max 5 MB.
 *     responses:
 *       201:
 *         description: Enrollment submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Enrollment submitted successfully. You will be notified once it has been reviewed.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: '64a1b2c3d4e5f6789012abcd' }
 *                     course: { $ref: '#/components/schemas/Course' }
 *                     status: { type: string, example: 'pending' }
 *                     academicPdf: { type: string, nullable: true, example: 'a1b2c3d4-uuid.pdf' }
 *                     submittedAt: { type: string, format: date-time }
 *       400:
 *         description: PDF required but not provided, or invalid file type
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'An academic PDF document is required to enroll in this course.' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Course not found or inactive
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Duplicate enrollment (pending or approved already exists)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'You already have a pending enrollment for this course.' }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post(
  '/',
  upload.single('academicPdf'),
  enrollmentValidator.submit,
  validate,
  enrollmentController.submitEnrollment
);

/**
 * @swagger
 * /api/enrollments/my:
 *   get:
 *     summary: Get all enrollments for the current student
 *     description: >
 *       Returns a paginated list of all enrollments belonging to the
 *       authenticated student. Optionally filter by status.
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by enrollment status
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Enrollments fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Enrollments fetched successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enrollments:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Enrollment' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Invalid status filter value
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/my', enrollmentController.getMyEnrollments);

/**
 * @swagger
 * /api/enrollments/my/{id}:
 *   get:
 *     summary: Get a specific enrollment by ID
 *     description: >
 *       Returns detailed information about a single enrollment.
 *       The enrollment must belong to the authenticated student.
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the enrollment
 *         example: 64a1b2c3d4e5f6789012abcd
 *     responses:
 *       200:
 *         description: Enrollment fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Enrollment fetched successfully.' }
 *                 data: { $ref: '#/components/schemas/Enrollment' }
 *       400:
 *         description: Invalid enrollment ID format
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Enrollment not found or does not belong to this student
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/my/:id', enrollmentValidator.enrollmentIdParam, validate, enrollmentController.getMyEnrollmentById);

module.exports = router;
