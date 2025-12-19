/**
 * Request Validation Middleware
 */

const { validationResult } = require('express-validator');

/**
 * Validate request using express-validator
 */
function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
        value: err.value,
      })),
    });
  }

  next();
}

module.exports = { validateRequest };
