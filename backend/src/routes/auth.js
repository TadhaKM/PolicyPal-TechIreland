/**
 * Authentication Routes
 */

const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

/**
 * POST /auth/signup
 * Register a new user
 */
router.post(
  '/signup',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/\d/)
      .withMessage('Password must contain a number'),
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 }),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 }),
  ],
  validateRequest,
  authController.signup
);

/**
 * POST /auth/login
 * Authenticate user
 */
router.post(
  '/login',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],
  validateRequest,
  authController.login
);

/**
 * POST /auth/logout
 * Logout user
 */
router.post('/logout', authenticate, authController.logout);

/**
 * POST /auth/change-password
 * Change user password
 */
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters')
      .matches(/\d/)
      .withMessage('New password must contain a number'),
  ],
  validateRequest,
  authController.changePassword
);

/**
 * GET /me
 * Get current user profile
 */
router.get('/me', authenticate, authController.getProfile);

/**
 * PATCH /me
 * Update current user profile
 */
router.patch(
  '/me',
  authenticate,
  [
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 }),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 }),
  ],
  validateRequest,
  authController.updateProfile
);

module.exports = router;
