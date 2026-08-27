const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const mongoose = require('mongoose');

const adminController      = require('../controllers/admin.controller');
const competitionController = require('../controllers/competition.controller');
const contactController    = require('../controllers/contact.controller');
const siteController       = require('../controllers/site.controller');
const compRegController    = require('../controllers/competitionRegistration.controller');
const exportController     = require('../controllers/export.controller');
const notificationController = require('../controllers/notification.controller');
const certificateController = require('../controllers/certificate.controller');
const resourceController   = require('../controllers/resource.controller');
const courseSubcategoryController = require('../controllers/courseSubcategory.controller');

const adminValidator       = require('../validators/admin.validator');
const enrollmentValidator  = require('../validators/enrollment.validator');
const siteValidator        = require('../validators/site.validator');
const compRegValidator     = require('../validators/competitionRegistration.validator');
const notificationValidator = require('../validators/notification.validator');
const certificateValidator = require('../validators/certificate.validator');
const resourceValidator    = require('../validators/resource.validator');
const courseValidator      = require('../validators/course.validator');
const courseSubcategoryValidator = require('../validators/courseSubcategory.validator');
const contactValidator     = require('../validators/contact.validator');
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
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search query cannot exceed 100 characters'),
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
 *                     competitions:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 2 }
 *                         active: { type: integer, example: 1 }
 *                         registrations:
 *                           type: object
 *                           properties:
 *                             total: { type: integer, example: 15 }
 *                             pending: { type: integer, example: 3 }
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
router.get('/feedback', contactValidator.listQuery, validate, contactController.getAllFeedback);

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

// ── Admin Management ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/admins:
 *   post:
 *     summary: Promote a user to admin
 *     description: >
 *       Promotes an existing registered user to an admin using only their email address.
 *       Only accessible by authenticated admins.
 *     tags: [Admin — Admins]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: existinguser@example.com
 *     responses:
 *       200:
 *         description: User promoted to admin successfully
 *       400:
 *         description: Validation error
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: No registered user found with that email address
 *       409:
 *         description: User is already an admin
 */
router.post('/admins', adminValidator.createAdmin, validate, adminController.createAdmin);

// ── Course Management ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/courses:
 *   get:
 *     summary: List all courses (including inactive)
 *     tags: [Admin — Courses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { $ref: '#/components/schemas/CourseCategory' }
 *       - in: query
 *         name: subcategory
 *         schema: { $ref: '#/components/schemas/CourseSubcategorySlug' }
 *       - in: query
 *         name: level
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Courses fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/courses', courseValidator.listQuery, validate, adminController.getAllCourses);

// ── Course Subcategory Management ─────────────────────────────────────────

/**
 * @swagger
 * /api/admin/course-subcategories:
 *   get:
 *     summary: List managed Course subcategories
 *     description: Returns active and inactive Course subcategories. Top-level STEAM categories remain fixed in the backend.
 *     tags: [Admin — Course Subcategories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { $ref: '#/components/schemas/CourseCategory' }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 100 }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Course subcategories fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get(
  '/course-subcategories',
  courseSubcategoryValidator.listQuery,
  validate,
  courseSubcategoryController.getAllCourseSubcategories
);

/**
 * @swagger
 * /api/admin/course-subcategories:
 *   post:
 *     summary: Create a managed Course subcategory
 *     description: Creates a globally unique subcategory slug under one fixed STEAM category. The new active slug immediately becomes available to Course validation and public taxonomy discovery.
 *     tags: [Admin — Course Subcategories]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CourseSubcategoryInput'
 *     responses:
 *       201:
 *         description: Course subcategory created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Course subcategory created successfully.' }
 *                 data: { $ref: '#/components/schemas/CourseSubcategory' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: Course subcategory slug already exists
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post(
  '/course-subcategories',
  courseSubcategoryValidator.create,
  validate,
  courseSubcategoryController.createCourseSubcategory
);

/**
 * @swagger
 * /api/admin/course-subcategories/{id}:
 *   put:
 *     summary: Update a managed Course subcategory
 *     description: Name and active state may be updated safely. Changing slug or category returns 409 when existing Courses reference the current pair.
 *     tags: [Admin — Course Subcategories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 100, example: Web Development }
 *               slug: { $ref: '#/components/schemas/CourseSubcategorySlug' }
 *               category: { $ref: '#/components/schemas/CourseCategory' }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Course subcategory updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Structural update would invalidate referenced Courses or duplicate a slug
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.put(
  '/course-subcategories/:id',
  courseSubcategoryValidator.subcategoryIdParam,
  courseSubcategoryValidator.update,
  validate,
  courseSubcategoryController.updateCourseSubcategory
);

/**
 * @swagger
 * /api/admin/course-subcategories/{id}/toggle-status:
 *   patch:
 *     summary: Activate or deactivate a managed Course subcategory
 *     description: Inactive subcategories are hidden from public taxonomy and rejected for new Course assignments. Existing Courses remain readable.
 *     tags: [Admin — Course Subcategories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Course subcategory status toggled successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.patch(
  '/course-subcategories/:id/toggle-status',
  courseSubcategoryValidator.subcategoryIdParam,
  validate,
  courseSubcategoryController.toggleCourseSubcategoryStatus
);

// ── Competition Management ─────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/competitions:
 *   get:
 *     summary: List all competitions for admin management
 *     description: Returns draft, published, completed, cancelled, active, and inactive competitions.
 *     tags: [Admin — Competitions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Competitions fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Competitions fetched successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     competitions:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Competition' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get(
  '/competitions',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  validate,
  competitionController.getAllCompetitions
);

// ── Competition Registration Management ────────────────────────────────────

/**
 * @swagger
 * /api/admin/competition-registrations:
 *   get:
 *     summary: List all competition registrations
 *     tags: [Admin — Competitions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, accepted, rejected] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: competitionId
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Registrations fetched successfully
 */
router.get(
  '/competition-registrations', 
  compRegValidator.adminListQuery, 
  validate, 
  compRegController.getAllRegistrations
);

/**
 * @swagger
 * /api/admin/competition-registrations/{id}/approve:
 *   patch:
 *     summary: Approve a competition registration
 *     tags: [Admin — Competitions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Registration accepted
 */
router.patch(
  '/competition-registrations/:id/approve', 
  compRegValidator.registrationIdParam, 
  validate, 
  compRegController.approveRegistration
);

/**
 * @swagger
 * /api/admin/competition-registrations/{id}/reject:
 *   patch:
 *     summary: Reject a competition registration
 *     tags: [Admin — Competitions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectionReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Registration rejected
 */
router.patch(
  '/competition-registrations/:id/reject', 
  compRegValidator.rejectRegistrationRules, 
  validate, 
  compRegController.rejectRegistration
);

/**
 * @swagger
 * /api/admin/competition-registrations/{id}/round/pass:
 *   patch:
 *     summary: Pass current round for a participant registration
 *     tags: [Admin — Competitions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roundId]
 *             properties:
 *               roundId: { type: string }
 *     responses:
 *       200:
 *         description: Round passed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Participant passed round.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     progressionStatus: { type: string, enum: [in_progress, completed] }
 *                     currentRound: { type: string, nullable: true }
 *                     roundProgress:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/RoundProgress' }
 *       400:
 *         description: Competition lifecycle state does not allow round progression
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.patch(
  '/competition-registrations/:id/round/pass',
  compRegValidator.roundActionRules,
  validate,
  compRegController.passRound
);

/**
 * @swagger
 * /api/admin/competition-registrations/{id}/round/fail:
 *   patch:
 *     summary: Fail current round for a participant registration
 *     tags: [Admin — Competitions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roundId]
 *             properties:
 *               roundId: { type: string }
 *     responses:
 *       200:
 *         description: Participant failed round and is eliminated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Participant failed round and is eliminated.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     progressionStatus: { type: string, enum: [eliminated] }
 *                     currentRound: { type: string, nullable: true }
 *                     roundProgress:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/RoundProgress' }
 *       400:
 *         description: Competition lifecycle state does not allow round progression
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.patch(
  '/competition-registrations/:id/round/fail',
  compRegValidator.roundActionRules,
  validate,
  compRegController.failRound
);



// ── Site Management ────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/sites:
 *   get:
 *     summary: List all sites (including inactive)
 *     tags: [Admin — Sites]
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
 *         description: Sites fetched successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/sites', siteValidator.listQuery, validate, siteController.getAllSites);

/**
 * @swagger
 * /api/admin/sites:
 *   post:
 *     summary: Create a new site
 *     tags: [Admin — Sites]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Addis Ababa Hub
 *               address:
 *                 type: string
 *                 example: Bole Road, Addis Ababa, Ethiopia
 *               description:
 *                 type: string
 *                 example: Main training center
 *     responses:
 *       201:
 *         description: Site created successfully
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/sites', siteValidator.create, validate, siteController.createSite);

/**
 * @swagger
 * /api/admin/sites/{id}:
 *   put:
 *     summary: Update a site
 *     tags: [Admin — Sites]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Site updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/sites/:id', siteValidator.siteIdParam, siteValidator.update, validate, siteController.updateSite);

/**
 * @swagger
 * /api/admin/sites/{id}/toggle-status:
 *   patch:
 *     summary: Toggle site active/inactive
 *     tags: [Admin — Sites]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Site status toggled
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/sites/:id/toggle-status', siteValidator.siteIdParam, validate, siteController.toggleSiteStatus);

/**
 * @swagger
 * /api/admin/announcements:
 *   post:
 *     summary: Broadcast an announcement to all students
 *     tags: [Admin — Announcements]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, message]
 *             properties:
 *               title: { type: string, example: "Platform Maintenance" }
 *               message: { type: string, example: "System maintenance tonight at 12:00 AM UTC." }
 *     responses:
 *       201:
 *         description: Announcement broadcasted successfully
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/announcements', notificationValidator.announcementBody, validate, notificationController.createAnnouncement);

// ── Admin CSV Exports ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/export/students:
 *   get:
 *     summary: Export students to CSV
 *     tags: [Admin — CSV Export]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file stream returned
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 */
router.get('/export/students', exportController.exportStudents);

/**
 * @swagger
 * /api/admin/export/enrollments:
 *   get:
 *     summary: Export course enrollments to CSV
 *     tags: [Admin — CSV Export]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file stream returned
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 */
router.get('/export/enrollments', exportController.exportEnrollments);

/**
 * @swagger
 * /api/admin/export/competition-registrations:
 *   get:
 *     summary: Export competition registrations to CSV
 *     tags: [Admin — CSV Export]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file stream returned
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 */
router.get('/export/competition-registrations', exportController.exportCompetitionRegistrations);

/**
 * @swagger
 * /api/admin/export/courses:
 *   get:
 *     summary: Export course data to CSV
 *     tags: [Admin — CSV Export]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file stream returned
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 */
router.get('/export/courses', exportController.exportCourses);

// ── Admin Digital Certificates ─────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/certificates:
 *   post:
 *     summary: Issue a digital certificate to a student
 *     tags: [Admin — Certificates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, type, title]
 *             properties:
 *               studentId: { type: string }
 *               type: { type: string, enum: [course_completion, competition_achievement, hackathon_winner, special_recognition] }
 *               title: { type: string, example: "Certificate of Completion - Python Programming" }
 *               courseId: { type: string }
 *               competitionId: { type: string }
 *               gradeOrRank: { type: string, example: "Distinction" }
 *     responses:
 *       201:
 *         description: Certificate issued successfully
 *       409:
 *         description: Certificate already issued
 */
router.post('/certificates', certificateValidator.issueBody, validate, certificateController.issueCertificate);

/**
 * @swagger
 * /api/admin/certificates:
 *   get:
 *     summary: List all issued certificates
 *     tags: [Admin — Certificates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [valid, revoked] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Certificates fetched successfully
 */
router.get('/certificates', certificateValidator.adminListQuery, validate, certificateController.getAllCertificates);

/**
 * @swagger
 * /api/admin/certificates/{id}/revoke:
 *   patch:
 *     summary: Revoke an issued certificate
 *     tags: [Admin — Certificates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Certificate revoked successfully
 */
router.patch('/certificates/:id/revoke', certificateValidator.certificateIdParam, validate, certificateController.revokeCertificate);

// ── Admin Course Resources Management ──────────────────────────────────────

/**
 * @swagger
 * /api/admin/courses/{courseId}/resources:
 *   post:
 *     summary: Add learning resource to course
 *     tags: [Admin — Resources]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, type, url]
 *             properties:
 *               title: { type: string, example: "Syllabus PDF" }
 *               description: { type: string }
 *               type: { type: string, enum: [pdf, video, external_link, document, github_repo, other] }
 *               url: { type: string, example: "https://example.com/syllabus.pdf" }
 *               position: { type: integer, example: 1 }
 *     responses:
 *       201:
 *         description: Resource added successfully
 */
router.post('/courses/:courseId/resources', resourceValidator.createResource, validate, resourceController.addResource);

/**
 * @swagger
 * /api/admin/courses/{courseId}/resources/{resourceId}:
 *   put:
 *     summary: Update course learning resource
 *     tags: [Admin — Resources]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: resourceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Resource updated successfully
 */
router.put('/courses/:courseId/resources/:resourceId', resourceValidator.updateResource, validate, resourceController.updateResource);

/**
 * @swagger
 * /api/admin/courses/{courseId}/resources/{resourceId}:
 *   delete:
 *     summary: Delete course learning resource
 *     tags: [Admin — Resources]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: resourceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Resource deleted successfully
 */
router.delete('/courses/:courseId/resources/:resourceId', resourceValidator.resourceIdParams, validate, resourceController.deleteResource);

/**
 * @swagger
 * /api/admin/courses/{courseId}/resources/reorder:
 *   patch:
 *     summary: Reorder resource positions in course
 *     tags: [Admin — Resources]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceOrders]
 *             properties:
 *               resourceOrders:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     resourceId: { type: string }
 *                     position: { type: integer }
 *     responses:
 *       200:
 *         description: Resource positions reordered
 */
router.patch('/courses/:courseId/resources/reorder', resourceValidator.courseIdParam, validate, resourceController.reorderResources);

module.exports = router;
