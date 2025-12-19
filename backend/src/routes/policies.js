/**
 * Policy Routes
 */

const express = require('express');
const multer = require('multer');
const { body, param, query } = require('express-validator');
const policyController = require('../controllers/policyController');
const { authenticate, checkPolicyLimit, requireFeature } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.features.maxFileSizeMb * 1024 * 1024, // Convert to bytes
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

/**
 * POST /policies/upload
 * Upload a new policy PDF
 */
router.post(
  '/upload',
  authenticate,
  checkPolicyLimit,
  upload.single('file'),
  [
    body('policyType')
      .optional()
      .isIn(['HOME', 'MOTOR', 'COMMERCIAL', 'LIFE', 'HEALTH', 'OTHER'])
      .withMessage('Invalid policy type'),
  ],
  validateRequest,
  policyController.uploadPolicy
);

/**
 * GET /policies
 * List user's policies
 */
router.get(
  '/',
  authenticate,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['UPLOADED', 'PROCESSING', 'EXTRACTING', 'ANALYZING', 'READY', 'ERROR'])
      .withMessage('Invalid status'),
    query('type')
      .optional()
      .isIn(['HOME', 'MOTOR', 'COMMERCIAL', 'LIFE', 'HEALTH', 'OTHER'])
      .withMessage('Invalid policy type'),
  ],
  validateRequest,
  policyController.listPolicies
);

/**
 * GET /policies/:id
 * Get a specific policy
 */
router.get(
  '/:id',
  authenticate,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid policy ID'),
  ],
  validateRequest,
  policyController.getPolicy
);

/**
 * GET /policies/:id/dashboard
 * Get dashboard data for a policy
 */
router.get(
  '/:id/dashboard',
  authenticate,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid policy ID'),
  ],
  validateRequest,
  policyController.getPolicyDashboard
);

/**
 * POST /policies/:id/reanalyze
 * Re-run analysis on a policy
 */
router.post(
  '/:id/reanalyze',
  authenticate,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid policy ID'),
  ],
  validateRequest,
  policyController.reanalyzePolicy
);

/**
 * DELETE /policies/:id
 * Delete a policy
 */
router.delete(
  '/:id',
  authenticate,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid policy ID'),
  ],
  validateRequest,
  policyController.deletePolicy
);

module.exports = router;
