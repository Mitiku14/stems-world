const router = require('express').Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createCompetitionRules, updateCompetitionRules, competitionIdParam, listQuery } = require('../validators/competition.validator');
const ctrl = require('../controllers/competition.controller');
const compRegCtrl = require('../controllers/competitionRegistration.controller');
const compRegValidator = require('../validators/competitionRegistration.validator');

// ── Public / Student ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/competitions:
 *   get:
 *     summary: List public competitions
 *     description: Returns a list of all active competitions that are published or completed.
 *     tags: [Competitions]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [steam_innovation, olympiad] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [individual, team] }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [local, national, international] }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Competitions fetched successfully
 */
router.get('/', listQuery, validate, ctrl.getCompetitions);

/**
 * @swagger
 * /api/competitions/registrations/my:
 *   get:
 *     summary: Get my competition registrations and progression
 *     tags: [Competitions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Registrations fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'My competition registrations fetched successfully.' }
 *                 data:
 *                   type: object
 *                   required: [registrations]
 *                   properties:
 *                     registrations:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/CompetitionRegistration' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/registrations/my', verifyToken, compRegCtrl.getMyRegistrations);

/**
 * @swagger
 * /api/competitions/{id}:
 *   get:
 *     summary: Get a single public competition
 *     tags: [Competitions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Competition fetched successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', competitionIdParam, validate, ctrl.getCompetition);

// Optional auth — sets req.user if token is present, but doesn't block anonymous users
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  verifyToken(req, res, (err) => {
    if (err) return next();
    next();
  });
};

/**
 * @swagger
 * /api/competitions/{id}/register:
 *   post:
 *     summary: Register for a competition
 *     description: Authentication is optional. Anonymous participants may register, while a supplied Bearer token associates the registration with the signed-in student.
 *     tags: [Competitions]
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
 *             required: [fullName, email]
 *             properties:
 *               fullName: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               grade: { type: string }
 *               school: { type: string }
 *               skills: { type: array, items: { type: string } }
 *               motivation: { type: string }
 *               teamName: { type: string }
 *               teamMembers: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Registration successful
 *       400:
 *         description: Invalid input or window closed
 *       409:
 *         description: Duplicate registration
 */
router.post('/:id/register', optionalAuth, compRegValidator.submitRegistrationRules, validate, compRegCtrl.submitRegistration);

// ── Admin ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/competitions:
 *   post:
 *     summary: Create a competition
 *     description: registrationOpenDate and registrationCloseDate are required. The open date must be strictly earlier than the close date; the close date cannot be later than eventStartDate.
 *     tags: [Admin — Competitions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CompetitionCreateInput'
 *     responses:
 *       201:
 *         description: Competition created successfully
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/', verifyToken, requireRole('admin'), createCompetitionRules, validate, ctrl.createCompetition);

/**
 * @swagger
 * /api/competitions/{id}:
 *   put:
 *     summary: Update a competition
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
 *             $ref: '#/components/schemas/Competition'
 *     responses:
 *       200:
 *         description: Competition updated successfully
 *       409:
 *         description: Conflict with round progression state or completion state
 */
router.put('/:id', verifyToken, requireRole('admin'), competitionIdParam, updateCompetitionRules, validate, ctrl.updateCompetition);

/**
 * @swagger
 * /api/competitions/{id}:
 *   delete:
 *     summary: Delete a competition
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
 *         description: Competition deleted successfully
 *       409:
 *         description: Cannot delete competition with existing registrations or certificates
 */
router.delete('/:id', verifyToken, requireRole('admin'), competitionIdParam, validate, ctrl.deleteCompetition);

/**
 * @swagger
 * /api/competitions/{id}/toggle-status:
 *   patch:
 *     summary: Toggle competition active/inactive
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
 *         description: Competition status toggled
 */
router.patch('/:id/toggle-status', verifyToken, requireRole('admin'), competitionIdParam, validate, ctrl.toggleCompetitionStatus);

module.exports = router;
