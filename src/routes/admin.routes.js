const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const mongoose = require('mongoose');

const adminController      = require('../controllers/admin.controller');
const contactController    = require('../controllers/contact.controller');
const enrollmentValidator  = require('../validators/enrollment.validator');
const { validate }         = require('../middleware/validate.middleware');
const { verifyToken }      = require('../middleware/auth.middleware');
const { requireRole }      = require('../middleware/role.middleware');
const { ROLES }            = require('../constants');

router.use(verifyToken, requireRole(ROLES.ADMIN));

const studentIdParam = [
  param('id')
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage('Invalid student ID'),
];

const studentListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

// ── Dashboard ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     description: >
 *       Returns aggregate counts for the admin dashboard:
 *       total students, total courses, and enrollment counts broken down by status.
 *       Status values match the frontend: pending / accepted / rejected.
 *     tags: [Admin — Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalStudents: { type: integer, example: 42 }
 *                     totalCourses: { type: integer, example: 6 }
 *                     enrollments:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         pending: { type: integer }
 *                         accepted: { type: integer }
 *                         rejected: { type: integer }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/dashboard', adminController.getDashboard);

// ── Enrollment Management ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/enrollments:
 *   get:
 *     summary: List all enrollments (flattened for admin table)
 *     description: >
 *       Returns a paginated list of all enrollments in the shape the admin frontend expects:
 *       `{ id, studentName, email, courseType, academicFileName, status, registeredAt }`.
 *       Supports filtering by status and searching by student name or email.
 *     tags: [Admin — Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, rejected]
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         example: john
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Enrollments fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/enrollments', enrollmentValidator.adminListQuery, validate, adminController.getAllEnrollments);

/**
 * @swagger
 * /api/admin/enrollments/{id}:
 *   get:
 *     summary: Get a single enrollment with full detail
 *     tags: [Admin — Enrollments]
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
router.get('/enrollments/:id', enrollmentValidator.enrollmentIdParam, validate, adminController.getEnrollmentById);

/**
 * @swagger
 * /api/admin/enrollments/{id}/approve:
 *   patch:
 *     summary: Accept a pending enrollment
 *     description: >
 *       Sets enrollment status to `accepted` (matches frontend "Accept" button).
 *       Sends an approval email to the student.
 *     tags: [Admin — Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Enrollment accepted successfully
 *       409:
 *         description: Enrollment is not pending
 */
router.patch('/enrollments/:id/approve', enrollmentValidator.enrollmentIdParam, validate, adminController.approveEnrollment);

/**
 * @swagger
 * /api/admin/enrollments/{id}/reject:
 *   patch:
 *     summary: Reject a pending enrollment
 *     description: >
 *       Sets enrollment status to `rejected`. `rejectionReason` is optional
 *       because the frontend admin has no input field for it.
 *     tags: [Admin — Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectionReason:
 *                 type: string
 *                 example: Documents are incomplete.
 *     responses:
 *       200:
 *         description: Enrollment rejected successfully
 *       409:
 *         description: Enrollment is not pending
 */
router.patch('/enrollments/:id/reject', enrollmentValidator.reject, validate, adminController.rejectEnrollment);

// ── Feedback (Contact form submissions) ───────────────────────────────────

/**
 * @swagger
 * /api/admin/feedback:
 *   get:
 *     summary: List all contact form submissions
 *     description: >
 *       Returns all feedback submitted via the public contact form.
 *       Matches the admin page FeedbackSection shape:
 *       `{ id, name, email, subject, message, submittedAt }`.
 *     tags: [Admin — Dashboard]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Feedback fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/feedback', contactController.getAllFeedback);

// ── Student Management ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/students:
 *   get:
 *     summary: List all students
 *     tags: [Admin — Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Students fetched successfully
 */
router.get('/students', studentListQuery, validate, adminController.getAllStudents);

/**
 * @swagger
 * /api/admin/students/{id}:
 *   get:
 *     summary: Get a student's profile and enrollment history
 *     tags: [Admin — Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Student fetched successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/students/:id', studentIdParam, validate, adminController.getStudentById);

/**
 * @swagger
 * /api/admin/students/{id}/toggle-status:
 *   patch:
 *     summary: Enable or disable a student account
 *     tags: [Admin — Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Student status toggled
 */
router.patch('/students/:id/toggle-status', studentIdParam, validate, adminController.toggleStudentStatus);

/**
 * @swagger
 * /api/admin/students/{id}:
 *   delete:
 *     summary: Permanently delete a student account
 *     tags: [Admin — Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Student deleted successfully
 */
router.delete('/students/:id', studentIdParam, validate, adminController.deleteStudent);

module.exports = router;
