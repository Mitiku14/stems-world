const express = require('express');

const controller = require('../controllers/studentProfile.controller');
const validator = require('../validators/studentProfile.validator');
const { verifyToken } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/students:
 *   post:
 *     summary: Create a student profile
 *     description: Creates a parent-owned StudentProfile in the lowest available slot from 1–5. StudentProfile._id is authoritative; slot/profileNumber is presentation and capacity metadata only. Same-name profiles are allowed and reported through possibleDuplicate.
 *     tags: [Student Profiles]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/StudentProfileCreateInput' }
 *     responses:
 *       201:
 *         description: Student profile created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/StudentProfileMutationResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     summary: List my student profiles
 *     description: Returns only StudentProfiles owned by the authenticated User, ordered by slot ascending. Retained profiles occupy one of the five slots regardless of isActive.
 *     tags: [Student Profiles]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Student profiles fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Student profiles fetched successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     students:
 *                       type: array
 *                       maxItems: 5
 *                       items: { $ref: '#/components/schemas/StudentProfile' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', verifyToken, validator.create, validate, controller.createStudentProfile);
router.get('/', verifyToken, controller.getStudentProfiles);

/**
 * @swagger
 * /api/students/{id}:
 *   get:
 *     summary: Get one of my student profiles
 *     description: Uses StudentProfile._id together with authenticated parent ownership. A profile owned by another User is returned as not found.
 *     tags: [Student Profiles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Student profile fetched
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/StudentProfileDetailResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   patch:
 *     summary: Update one of my student profiles
 *     description: Updates only names, grade, school, or isActive. Ownership, slot, and _id cannot change. Same-name profiles remain allowed and produce a possibleDuplicate warning.
 *     tags: [Student Profiles]
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
 *           schema: { $ref: '#/components/schemas/StudentProfileUpdateInput' }
 *     responses:
 *       200:
 *         description: Student profile updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/StudentProfileMutationResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.get('/:id', verifyToken, validator.studentProfileIdParam, validate, controller.getStudentProfile);
router.patch('/:id', verifyToken, validator.studentProfileIdParam, validator.update, validate, controller.updateStudentProfile);

module.exports = router;
