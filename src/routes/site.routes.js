const express = require('express');
const router = express.Router();

const siteController = require('../controllers/site.controller');
const siteValidator  = require('../validators/site.validator');
const { validate }   = require('../middleware/validate.middleware');

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sites:
 *   get:
 *     summary: List active sites
 *     description: Returns all active site locations. No authentication required.
 *     tags: [Sites]
 *     responses:
 *       200:
 *         description: Sites fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sites:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Site'
 */
router.get('/', siteValidator.publicListQuery, validate, siteController.getActiveSites);

module.exports = router;
