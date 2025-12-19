/**
 * Risk Data Routes (Optional public endpoints for debugging)
 */

const express = require('express');
const { query } = require('express-validator');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const riskDataService = require('../services/risk/riskDataService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /risk/flood
 * Get flood risk for coordinates
 */
router.get(
  '/flood',
  optionalAuth,
  [
    query('lat')
      .isFloat({ min: 51, max: 56 })
      .withMessage('Latitude must be within Ireland (51-56)'),
    query('lon')
      .isFloat({ min: -11, max: -5 })
      .withMessage('Longitude must be within Ireland (-11 to -5)'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { lat, lon } = req.query;
      const result = await riskDataService.getFloodRisk(parseFloat(lat), parseFloat(lon));
      res.json({ flood: result });
    } catch (error) {
      logger.error('Flood risk endpoint error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get flood risk data',
      });
    }
  }
);

/**
 * GET /risk/crime
 * Get crime statistics for area
 */
router.get(
  '/crime',
  optionalAuth,
  [
    query('lat')
      .optional()
      .isFloat({ min: 51, max: 56 }),
    query('lon')
      .optional()
      .isFloat({ min: -11, max: -5 }),
    query('eircode')
      .optional()
      .matches(/^[A-Za-z]\d{2}\s?[A-Za-z\d]{4}$/)
      .withMessage('Invalid Eircode format'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { lat, lon, eircode } = req.query;

      if (!lat && !lon && !eircode) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Provide lat/lon or eircode',
        });
      }

      const result = await riskDataService.getCrimeStats(
        parseFloat(lat) || 53.35,
        parseFloat(lon) || -6.26,
        eircode
      );

      res.json({ crime: result });
    } catch (error) {
      logger.error('Crime stats endpoint error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get crime statistics',
      });
    }
  }
);

/**
 * GET /risk/all
 * Get all risk data for a location
 */
router.get(
  '/all',
  authenticate,
  [
    query('lat')
      .isFloat({ min: 51, max: 56 })
      .withMessage('Latitude must be within Ireland'),
    query('lon')
      .isFloat({ min: -11, max: -5 })
      .withMessage('Longitude must be within Ireland'),
    query('eircode')
      .optional()
      .matches(/^[A-Za-z]\d{2}\s?[A-Za-z\d]{4}$/),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { lat, lon, eircode } = req.query;
      const result = await riskDataService.getAllRiskData(
        parseFloat(lat),
        parseFloat(lon),
        eircode
      );
      res.json({ risk: result });
    } catch (error) {
      logger.error('All risk endpoint error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get risk data',
      });
    }
  }
);

/**
 * GET /risk/geocode
 * Geocode an address
 */
router.get(
  '/geocode',
  authenticate,
  [
    query('address')
      .optional()
      .isLength({ min: 5 })
      .withMessage('Address must be at least 5 characters'),
    query('eircode')
      .optional()
      .matches(/^[A-Za-z]\d{2}\s?[A-Za-z\d]{4}$/),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { address, eircode } = req.query;

      if (!address && !eircode) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Provide address or eircode',
        });
      }

      const result = await riskDataService.geocodeAddress(address, eircode);

      if (!result) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Could not geocode the address',
        });
      }

      res.json({ location: result });
    } catch (error) {
      logger.error('Geocode endpoint error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to geocode address',
      });
    }
  }
);

module.exports = router;
