const router = require('express').Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createCompetitionRules, updateCompetitionRules, competitionIdParam, listQuery } = require('../validators/competition.validator');
const ctrl = require('../controllers/competition.controller');

// ── Public ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/competitions:
 *   get:
 *     summary: List public competitions
 *     description: Returns a list of all active competitions that are open, upcoming, or completed.
 *     tags: [Competitions]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: scope
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Competitions fetched successfully
 */
router.get('/', listQuery, validate, ctrl.getCompetitions);

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

const compRegCtrl = require('../controllers/competitionRegistration.controller');
const compRegValidator = require('../validators/competitionRegistration.validator');

/**
 * @swagger
 * /api/competitions/{id}/register:
 *   post:
 *     summary: Register for a competition
 *     tags: [Competitions]
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
 */
router.post('/:id/register', optionalAuth, compRegValidator.submitRegistrationRules, validate, compRegCtrl.submitRegistration);
// ── Admin ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/competitions:
 *   post:
 *     summary: Create a competition
 *     tags: [Admin — Competitions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Competition'
 *     responses:
 *       201:
 *         description: Competition created successfully
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
