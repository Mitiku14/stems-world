const express = require('express');
const router = express.Router();

const courseController = require('../controllers/course.controller');
const resourceController = require('../controllers/resource.controller');
const courseValidator = require('../validators/course.validator');
const resourceValidator = require('../validators/resource.validator');
const { validate } = require('../middleware/validate.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { ROLES } = require('../constants');

// ─────────────────────────────────────────────────────────────────────────────
// Course Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/courses/taxonomy:
 *   get:
 *     summary: Get the canonical Course taxonomy
 *     description: Returns the canonical Course category-to-subcategories mapping for building category and dependent subcategory selectors. No authentication required.
 *     tags: [Courses]
 *     responses:
 *       200:
 *         description: Course taxonomy fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Course taxonomy fetched successfully.' }
 *                 data: { $ref: '#/components/schemas/CourseTaxonomy' }
 */
router.get('/taxonomy', courseController.getCourseTaxonomy);

/**
 * @swagger
 * /api/courses:
 *   get:
 *     summary: List all active courses
 *     description: >
 *       Returns a paginated list of all active courses.
 *       Supports **full-text search** on title and description,
 *       and **filtering** by category, subcategory, and level.
 *       No authentication required.
 *     tags: [Courses]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search across course title and description
 *         example: machine learning
 *       - in: query
 *         name: category
 *         schema: { $ref: '#/components/schemas/CourseCategory' }
 *         description: Filter by course category
 *       - in: query
 *         name: subcategory
 *         schema: { $ref: '#/components/schemas/CourseSubcategory' }
 *         description: Filter by controlled specialization
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [beginner, intermediate, advanced, all]
 *         description: Filter by course level
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Courses fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Courses fetched successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     courses:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Course' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/', courseValidator.listQuery, validate, courseController.getCourses);

/**
 * @swagger
 * /api/courses/{id}:
 *   get:
 *     summary: Get a single course by ID
 *     description: >
 *       Returns the full details of one active course.
 *       Returns 404 if the course does not exist or is deactivated.
 *       No authentication required.
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the course
 *         example: 64a1b2c3d4e5f6789012abcd
 *     responses:
 *       200:
 *         description: Course fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Course fetched successfully.' }
 *                 data: { $ref: '#/components/schemas/Course' }
 *       400:
 *         description: Invalid course ID format
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', courseValidator.courseIdParam, validate, courseController.getCourse);

/**
 * @swagger
 * /api/courses/{courseId}/resources:
 *   get:
 *     summary: Get active learning resources for a course
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Course resources fetched successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:courseId/resources', resourceValidator.courseIdParam, validate, resourceController.getCourseResources);

/**
 * @swagger
 * /api/courses:
 *   post:
 *     summary: Create a new course (Admin only)
 *     description: Creates a new course. Requires admin authentication.
 *     tags: [Courses]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, category, subcategory]
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 150
 *                 example: Advanced Python Programming
 *               description:
 *                 type: string
 *                 maxLength: 2000
 *                 example: Deep dive into Python data structures, decorators, and async programming.
 *               category:
 *                 $ref: '#/components/schemas/CourseCategory'
 *               subcategory:
 *                 $ref: '#/components/schemas/CourseSubcategory'
 *               level:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced, all]
 *                 example: advanced
 *               requiresDocument:
 *                 type: boolean
 *                 example: false
 *                 description: If true, students must upload an academic PDF to enroll
 *               imageUrl:
 *                 type: string
 *                 nullable: true
 *                 example: /cs/programming.jpg
 *                 description: Optional image URL for the course card (external URL or relative path)
 *               syllabus:
 *                 type: array
 *                 items: { type: string }
 *                 example: ['Variables & Data Types', 'Control Flow', 'Functions']
 *                 description: List of topics or skills covered
 *               instructor:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 100
 *                 example: Dr. Abebe Tessema
 *                 description: Instructor name
 *               duration:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 50
 *                 example: 12 weeks
 *                 description: Course duration
 *               requirements:
 *                 type: array
 *                 items: { type: string }
 *                 example: ['Basic Python programming', 'English proficiency']
 *                 description: Prerequisites for the course
 *               registrationOpenDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 example: '2026-09-01T00:00:00.000Z'
 *                 description: Date when registration opens (null = always open)
 *               registrationCloseDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 example: '2026-10-01T00:00:00.000Z'
 *                 description: Date when registration closes (null = no deadline)
 *               season:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 50
 *                 example: Fall 2026
 *                 description: Intake label
 *               maxStudents:
 *                 type: integer
 *                 nullable: true
 *                 minimum: 1
 *                 example: 30
 *                 description: Maximum enrollment capacity (null = unlimited)
 *               sites:
 *                 type: array
 *                 items: { type: string }
 *                 example: ['64a1b2c3d4e5f6789012abcd']
 *                 description: Array of MongoDB ObjectIds for training locations
 *     responses:
 *       201:
 *         description: Course created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Course created successfully.' }
 *                 data: { $ref: '#/components/schemas/Course' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: Course with this title already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post(
  '/',
  verifyToken, requireRole(ROLES.ADMIN),
  courseValidator.create, validate,
  courseController.createCourse
);

/**
 * @swagger
 * /api/courses/{id}:
 *   put:
 *     summary: Update a course (Admin only)
 *     description: Updates one or more fields of an existing course. All fields are optional — only provided fields are updated.
 *     tags: [Courses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the course to update
 *         example: 64a1b2c3d4e5f6789012abcd
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 150
 *                 example: Updated Course Title
 *               description:
 *                 type: string
 *                 maxLength: 2000
 *               category:
 *                 $ref: '#/components/schemas/CourseCategory'
 *               subcategory:
 *                 $ref: '#/components/schemas/CourseSubcategory'
 *               level:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced, all]
 *               requiresDocument:
 *                 type: boolean
 *               imageUrl:
 *                 type: string
 *                 nullable: true
 *                 example: https://example.com/course-image.jpg
 *               syllabus:
 *                 type: array
 *                 items: { type: string }
 *               instructor:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 100
 *               duration:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 50
 *               requirements:
 *                 type: array
 *                 items: { type: string }
 *               registrationOpenDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               registrationCloseDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               season:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 50
 *               maxStudents:
 *                 type: integer
 *                 nullable: true
 *                 minimum: 1
 *               sites:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Course updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Course updated successfully.' }
 *                 data: { $ref: '#/components/schemas/Course' }
 *       400:
 *         description: Invalid course ID format
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.put(
  '/:id',
  verifyToken, requireRole(ROLES.ADMIN),
  courseValidator.courseIdParam, courseValidator.update, validate,
  courseController.updateCourse
);

/**
 * @swagger
 * /api/courses/{id}:
 *   delete:
 *     summary: Delete a course (Admin only)
 *     description: >
 *       Permanently deletes a course.
 *       **Business rule:** A course with active approved enrollments cannot be deleted.
 *       Deactivate it instead using the toggle-status endpoint.
 *     tags: [Courses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the course to delete
 *         example: 64a1b2c3d4e5f6789012abcd
 *     responses:
 *       200:
 *         description: Course deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Course deleted successfully.' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Cannot delete course with active enrollments
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { success: false, message: 'Cannot delete this course — it has 5 active approved enrollment(s). Deactivate it instead.' }
 */
router.delete(
  '/:id',
  verifyToken, requireRole(ROLES.ADMIN),
  courseValidator.courseIdParam, validate,
  courseController.deleteCourse
);

/**
 * @swagger
 * /api/courses/{id}/toggle-status:
 *   patch:
 *     summary: Toggle course active/inactive status (Admin only)
 *     description: >
 *       Toggles the `isActive` status of a course.
 *       Inactive courses are hidden from public course listings and
 *       new enrollments cannot be submitted for them.
 *     tags: [Courses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the course
 *         example: 64a1b2c3d4e5f6789012abcd
 *     responses:
 *       200:
 *         description: Course status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Course deactivated successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     isActive: { type: boolean, example: false }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
  '/:id/toggle-status',
  verifyToken, requireRole(ROLES.ADMIN),
  courseValidator.courseIdParam, validate,
  courseController.toggleCourseStatus
);

module.exports = router;
