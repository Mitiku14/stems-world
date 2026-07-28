const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const mongoose = require('mongoose');

const adminController = require('../controllers/admin.controller');
const enrollmentValidator = require('../validators/enrollment.validator');
const { validate } = require('../middleware/validate.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { ROLES } = require('../constants');

// All admin routes require an authenticated admin
router.use(verifyToken, requireRole(ROLES.ADMIN));

// ── Reusable validators ────────────────────────────────────────────────────
const studentIdParam = [
  param('id')
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage('Invalid student ID'),
];

const studentListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Admin Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     description: >
 *       Returns aggregate counts for the admin dashboard:
 *       total students, total courses, and enrollment counts broken down by status.
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
 *                 message: { type: string, example: 'Dashboard stats fetched successfully.' }
 *                 data: { $ref: '#/components/schemas/DashboardStats' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/dashboard', adminController.getDashboard);

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/enrollments:
 *   get:
 *     summary: List all enrollments
 *     description: >
 *       Returns a paginated list of all enrollments across all students.
 *       Supports filtering by status and searching by student name or email.
 *     tags: [Admin — Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by enrollment status
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by student name or email (case-insensitive)
 *         example: john
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
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get(
  '/enrollments',
  enrollmentValidator.adminListQuery, validate,
  adminController.getAllEnrollments
);

/**
 * @swagger
 * /api/admin/enrollments/{id}:
 *   get:
 *     summary: Get a single enrollment with full detail
 *     description: >
 *       Returns complete details for one enrollment including student info,
 *       course info, uploaded PDF filename, and review history.
 *     tags: [Admin — Enrollments]
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
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/enrollments/:id',
  enrollmentValidator.enrollmentIdParam, validate,
  adminController.getEnrollmentById
);

/**
 * @swagger
 * /api/admin/enrollments/{id}/approve:
 *   patch:
 *     summary: Approve a pending enrollment
 *     description: >
 *       Approves a pending enrollment, granting the student access to course content.
 *       An approval email is sent to the student automatically.
 *
 *       **Only pending enrollments can be approved.**
 *       Attempting to approve an already approved or rejected enrollment returns 409.
 *     tags: [Admin — Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the enrollment to approve
 *         example: 64a1b2c3d4e5f6789012abcd
 *     responses:
 *       200:
 *         description: Enrollment approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Enrollment approved successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     status: { type: string, example: 'approved' }
 *                     reviewedAt: { type: string, format: date-time }
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
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Enrollment is not in pending status
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'This enrollment has already been approved. Only pending enrollments can be approved.' }
 */
router.patch(
  '/enrollments/:id/approve',
  enrollmentValidator.enrollmentIdParam, validate,
  adminController.approveEnrollment
);

/**
 * @swagger
 * /api/admin/enrollments/{id}/reject:
 *   patch:
 *     summary: Reject a pending enrollment
 *     description: >
 *       Rejects a pending enrollment with a required reason.
 *       A rejection email including the reason is sent to the student.
 *       The student can re-apply after addressing the rejection reason.
 *
 *       **Only pending enrollments can be rejected.**
 *     tags: [Admin — Enrollments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the enrollment to reject
 *         example: 64a1b2c3d4e5f6789012abcd
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rejectionReason]
 *             properties:
 *               rejectionReason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 500
 *                 example: Submitted academic documents are incomplete. Please re-upload a valid transcript.
 *     responses:
 *       200:
 *         description: Enrollment rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Enrollment rejected successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     status: { type: string, example: 'rejected' }
 *                     rejectionReason: { type: string }
 *                     reviewedAt: { type: string, format: date-time }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Enrollment is not in pending status
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.patch(
  '/enrollments/:id/reject',
  enrollmentValidator.reject, validate,
  adminController.rejectEnrollment
);

// ─────────────────────────────────────────────────────────────────────────────
// Student Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/students:
 *   get:
 *     summary: List all students
 *     description: >
 *       Returns a paginated list of all student accounts.
 *       Supports searching by name, email, or username.
 *     tags: [Admin — Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by student name, email, or username (case-insensitive)
 *         example: john
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Students fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Students fetched successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     students:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/User' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get(
  '/students',
  studentListQuery, validate,
  adminController.getAllStudents
);

/**
 * @swagger
 * /api/admin/students/{id}:
 *   get:
 *     summary: Get a student's profile and enrollment history
 *     description: >
 *       Returns a student's full profile along with their complete
 *       enrollment history (all statuses).
 *     tags: [Admin — Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the student
 *         example: 64a1b2c3d4e5f6789012abcd
 *     responses:
 *       200:
 *         description: Student fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Student fetched successfully.' }
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/User'
 *                     - type: object
 *                       properties:
 *                         enrollments:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Enrollment' }
 *       400:
 *         description: Invalid student ID format
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/students/:id',
  studentIdParam, validate,
  adminController.getStudentById
);

/**
 * @swagger
 * /api/admin/students/{id}/toggle-status:
 *   patch:
 *     summary: Enable or disable a student account
 *     description: >
 *       Toggles the `isActive` status of a student account.
 *       A disabled student's existing JWT is rejected on the **next request**
 *       (since the middleware always fetches a fresh user from the DB).
 *       An admin cannot disable their own account.
 *     tags: [Admin — Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the student
 *         example: 64a1b2c3d4e5f6789012abcd
 *     responses:
 *       200:
 *         description: Student account status toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Student account disabled successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     isActive: { type: boolean, example: false }
 *       400:
 *         description: Admin trying to disable their own account, or invalid ID
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
  '/students/:id/toggle-status',
  studentIdParam, validate,
  adminController.toggleStudentStatus
);

/**
 * @swagger
 * /api/admin/students/{id}:
 *   delete:
 *     summary: Permanently delete a student account
 *     description: >
 *       Permanently deletes a student account **and all their enrollments**.
 *       This action is irreversible.
 *     tags: [Admin — Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the student to delete
 *         example: 64a1b2c3d4e5f6789012abcd
 *     responses:
 *       200:
 *         description: Student deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Student and all associated data deleted successfully.' }
 *       400:
 *         description: Invalid student ID format
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  '/students/:id',
  studentIdParam, validate,
  adminController.deleteStudent
);

module.exports = router;
