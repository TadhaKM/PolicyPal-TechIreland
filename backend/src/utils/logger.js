/**
 * Logger Configuration
 * Using Winston for structured logging
 */

const winston = require('winston');
const config = require('../config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;

  if (stack) {
    log += `\n${stack}`;
  }

  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }

  return log;
});

// Create transports
const transports = [
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
  }),
];

// Add file transport in production
if (config.env === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(
        timestamp(),
        errors({ stack: true }),
        winston.format.json()
      ),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(
        timestamp(),
        errors({ stack: true }),
        winston.format.json()
      ),
    })
  );
}

const logger = winston.createLogger({
  level: config.logging.level,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Create a separate audit logger that never logs PII
const auditLogger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/audit.log',
    }),
  ],
});

module.exports = logger;
module.exports.audit = auditLogger;
