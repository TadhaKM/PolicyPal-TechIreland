/**
 * Security Middleware
 * Rate limiting, request sanitization, and security headers
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * General rate limiter
 */
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: 'Too Many Requests',
    message: 'You have exceeded the rate limit. Please try again later.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

/**
 * Stricter rate limiter for auth endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed requests
});

/**
 * Rate limiter for upload endpoints
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: {
    error: 'Too Many Requests',
    message: 'Upload limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Helmet security headers
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Needed for some file operations
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

/**
 * Request sanitizer
 * Removes potentially dangerous characters from request body
 */
function sanitizeRequest(req, res, next) {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key]);
      }
    });
  }

  // Note: Body sanitization should be done carefully for JSON
  // Only sanitize string fields, not entire objects

  next();
}

/**
 * Basic string sanitization
 */
function sanitizeString(str) {
  // Remove null bytes
  str = str.replace(/\0/g, '');

  // Limit length
  if (str.length > 10000) {
    str = str.substring(0, 10000);
  }

  return str;
}

/**
 * File validation middleware
 * Additional checks beyond multer
 */
function validateFile(req, res, next) {
  if (!req.file) {
    return next();
  }

  // Check file signature (magic bytes) for PDF
  const pdfMagicBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

  if (!req.file.buffer.slice(0, 4).equals(pdfMagicBytes)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid file format. Only PDF files are allowed.',
    });
  }

  // Check for suspicious content (very basic)
  const content = req.file.buffer.toString('utf8', 0, 1000);
  const suspiciousPatterns = [
    /\/JavaScript/i,
    /\/JS/i,
    /\/Launch/i,
    /\/EmbeddedFile/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      logger.warn(`Suspicious PDF content detected from IP: ${req.ip}`);
      // Don't block, but log for monitoring
    }
  }

  next();
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'debug';

    logger[logLevel]({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
    });
  });

  next();
}

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  logger.error('Unhandled error:', err);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'File size exceeds the maximum allowed limit',
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Unexpected file field',
    });
  }

  // JWT errors are handled in auth middleware

  // Default error response
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: config.env === 'production'
      ? 'An unexpected error occurred'
      : err.message,
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
}

module.exports = {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  securityHeaders,
  sanitizeRequest,
  validateFile,
  requestLogger,
  errorHandler,
  notFoundHandler,
};
