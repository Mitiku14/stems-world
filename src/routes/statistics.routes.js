const express = require('express');
const statisticsController = require('../controllers/statistics.controller');

const router = express.Router();

/**
 * @swagger
 * /api/statistics:
 *   get:
 *     summary: Get public homepage statistics
 *     description: Returns PM-managed homepage statistics. This read-only endpoint never creates or updates configuration.
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: Homepage statistics fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Homepage statistics fetched successfully. }
 *                 data: { $ref: '#/components/schemas/HomepageStatisticsPublic' }
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/', statisticsController.getPublicStatistics);

module.exports = router;
