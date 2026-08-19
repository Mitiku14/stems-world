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
 *     summary: Submit a course enrollment
 *     description: >
 *       Submits an enrollment request for a course. **Authentication is optional.**
 *       If authenticated, the enrollment is linked to the user's account.
 *
 *       `courseType` can be:
 *       - A frontend ID like `"cs-1"`, `"math-3"`, `"english-1"`
 *       - A MongoDB ObjectId
 *       - A partial course title (case-insensitive)
 *
 *       Request must use `application/json`.
 *     tags: [Enrollments]
 *     security:
 *       - BearerAuth: []
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
 *               grade:
 *                 type: string
 *                 example: "12"
 *                 description: Student's current grade or class level
 *               site:
 *                 type: string
 *                 example: 64a1b2c3...
 *                 description: ObjectId of the selected physical training site
 *     responses:
 *       201:
 *         description: Enrollment submitted successfully
 *       400:
 *         description: PDF required, invalid site, or registration window closed
 *       404:
 *         description: Course not found
 *       409:
 *         description: Duplicate pending or accepted enrollment
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */

// Optional auth — sets req.user if token is present, but doesn't block anonymous users
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  // Delegate to verifyToken; if it fails, proceed without auth
  verifyToken(req, res, (err) => {
    if (err) return next(); // Silently continue as anonymous
    next();
  });
};

router.post(
  '/',
  optionalAuth,
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
