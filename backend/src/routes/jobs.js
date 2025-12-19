/**
 * Job Routes
 */

const express = require('express');
const { param } = require('express-validator');
const policyController = require('../controllers/policyController');
const { authenticate } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

/**
 * GET /jobs/:id
 * Get job status
 */
router.get(
  '/:id',
  authenticate,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid job ID'),
  ],
  validateRequest,
  policyController.getJob
);

module.exports = router;
